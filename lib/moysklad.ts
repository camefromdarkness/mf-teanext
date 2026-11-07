import "server-only";
import { createHash } from "node:crypto";
import { normalizeRussianPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

const API_URL = "https://api.moysklad.ru/api/remap/1.2";
const API_CIRCUIT_ID = "moysklad-user-api";

type MoyskladMeta = {
  href: string;
  type: string;
  mediaType: "application/json";
};

type MoyskladList<T> = {
  rows: T[];
};

type MoyskladProduct = {
  id: string;
  name: string;
  code?: string;
  archived?: boolean;
};

type MoyskladCurrentStockRow = {
  assortmentId?: string;
  freeStock?: number;
};

type MoyskladEntity = {
  id: string;
  meta: { href: string };
};

export type MoyskladOrderState = {
  id: string;
  name: string;
  stateType: string | null;
};

type MoyskladApiError = {
  errors?: { error?: string; code?: number }[];
};

type RequestCacheEntry = { expiresAt: number; value: unknown };

const successfulGetCache = new Map<string, RequestCacheEntry>();
const failedRequestCache = new Map<string, RequestCacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const FAILED_REQUEST_COOLDOWN_MS = 60_000;
const DEFAULT_API_PAUSE_MS = 60_000;
const MAX_PARALLEL_API_REQUESTS = 4;
const API_BUDGET_WINDOW_MS = 3_000;
// The app uses a user token: cap at 30 of the documented 45 units per window,
// allowing for the higher request weights that take effect later in 2026.
const API_BUDGET_UNITS = 30;
const apiRequestWindow: { at: number; units: number }[] = [];
let activeApiRequests = 0;
let apiPauseUntil = 0;
let apiPauseError: MoyskladError | null = null;
let apiProbeInFlight = false;

export class MoyskladError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly suppressed = false,
    readonly cooldownMs?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MoyskladError";
  }
}

function requiredSetting(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MoyskladError(`Не задана настройка ${name}.`);
  }
  return value;
}

export function moyskladIsConfigured() {
  return Boolean(
    process.env.MOYSKLAD_TOKEN?.trim() &&
      process.env.MOYSKLAD_ORGANIZATION_ID?.trim() &&
      process.env.MOYSKLAD_STORE_ID?.trim(),
  );
}

function requestKey(path: string, init: RequestInit, method: string) {
  const body = typeof init.body === "string" ? init.body : "";
  return createHash("sha256")
    .update(method)
    .update("\0")
    .update(path)
    .update("\0")
    .update(body)
    .digest("hex");
}

function trimCache(cache: Map<string, RequestCacheEntry>) {
  if (cache.size <= 1_000) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > 1_000) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

async function acquireApiSlot(path: string) {
  // Stock reports cost 5 units; other user-token requests are budgeted at 4.
  const units = path.startsWith("/report/stock/all/") ? 5 : 4;
  while (true) {
    const now = Date.now();
    while (apiRequestWindow[0]?.at <= now - API_BUDGET_WINDOW_MS) {
      apiRequestWindow.shift();
    }
    const usedUnits = apiRequestWindow.reduce((total, entry) => total + entry.units, 0);
    if (
      activeApiRequests < MAX_PARALLEL_API_REQUESTS &&
      usedUnits + units <= API_BUDGET_UNITS
    ) {
      activeApiRequests += 1;
      apiRequestWindow.push({ at: now, units });
      return () => {
        activeApiRequests = Math.max(0, activeApiRequests - 1);
      };
    }

    const nextWindowTime = apiRequestWindow[0]
      ? apiRequestWindow[0].at + API_BUDGET_WINDOW_MS + 1
      : now + 50;
    await new Promise((resolve) => setTimeout(resolve, Math.max(25, nextWindowTime - now)));
  }
}

function getRetryDelay(response: Response) {
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = response.headers.get("X-Lognex-Retry-After");
  const resetMs = response.headers.get("X-Lognex-Reset");
  const candidates = [
    retryAfter && Number.isFinite(Number(retryAfter))
      ? Number(retryAfter) * 1_000
      : retryAfter
        ? Math.max(0, Date.parse(retryAfter) - Date.now())
        : 0,
    retryAfterMs ? Number(retryAfterMs) : 0,
    resetMs ? Number(resetMs) : 0,
  ].filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(DEFAULT_API_PAUSE_MS, ...candidates);
}

function pausedApiError() {
  if (apiPauseError) {
    return new MoyskladError(
      apiPauseError.message,
      apiPauseError.status,
      true,
      apiPauseError.cooldownMs,
      apiPauseError.code,
    );
  }
  return new MoyskladError(
    "Запрос к МойСклад временно приостановлен после предыдущей ошибки.",
    503,
    true,
  );
}

async function acquirePersistentProbe() {
  const state = await prisma.moyskladApiCircuit.findUnique({
    where: { id: API_CIRCUIT_ID },
  });
  if (!state?.blockedUntil) {
    if (apiPauseError && apiPauseUntil <= Date.now()) {
      apiPauseError = null;
      apiPauseUntil = 0;
      apiProbeInFlight = false;
    }
    return false;
  }

  const now = new Date();
  apiPauseError = new MoyskladError(
    state.lastMessage ?? "Доступ к API МойСклад временно приостановлен после ошибки.",
    state.lastStatus ?? 403,
    false,
    undefined,
    state.lastCode ?? undefined,
  );
  if (state.blockedUntil > now) {
    apiPauseUntil = state.blockedUntil.getTime();
    throw pausedApiError();
  }
  if (state.probeUntil && state.probeUntil > now) {
    apiPauseUntil = state.probeUntil.getTime();
    throw pausedApiError();
  }

  const probeUntil = new Date(now.getTime() + DEFAULT_API_PAUSE_MS);
  const claimed = await prisma.moyskladApiCircuit.updateMany({
    where: {
      id: API_CIRCUIT_ID,
      blockedUntil: state.blockedUntil,
      OR: [{ probeUntil: null }, { probeUntil: { lte: now } }],
    },
    data: { probeUntil },
  });
  if (claimed.count !== 1) {
    apiPauseUntil = probeUntil.getTime();
    throw pausedApiError();
  }
  apiPauseUntil = 0;
  apiProbeInFlight = true;
  return true;
}

async function persistApiPause(error: MoyskladError) {
  const blockedUntil = new Date(
    Date.now() + (error.cooldownMs ?? DEFAULT_API_PAUSE_MS),
  );
  await prisma.moyskladApiCircuit.upsert({
    where: { id: API_CIRCUIT_ID },
    create: {
      id: API_CIRCUIT_ID,
      blockedUntil,
      probeUntil: null,
      lastStatus: error.status ?? null,
      lastCode: error.code ?? null,
      lastMessage: error.message.slice(0, 255),
      updatedAt: new Date(),
    },
    update: {
      blockedUntil,
      probeUntil: null,
      lastStatus: error.status ?? null,
      lastCode: error.code ?? null,
      lastMessage: error.message.slice(0, 255),
    },
  }).catch(() => undefined);
}

async function clearPersistentPause() {
  await prisma.moyskladApiCircuit.updateMany({
    where: { id: API_CIRCUIT_ID },
    data: {
      blockedUntil: null,
      probeUntil: null,
      lastStatus: null,
      lastCode: null,
      lastMessage: null,
    },
  }).catch(() => undefined);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { cacheTtlMs?: number } = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const key = requestKey(path, init, method);
  const now = Date.now();
  const success = successfulGetCache.get(key);
  if (success && success.expiresAt > now) return success.value as T;
  if (success) successfulGetCache.delete(key);

  const failed = failedRequestCache.get(key);
  if (failed && failed.expiresAt > now) {
    const error = failed.value as MoyskladError;
    throw new MoyskladError(error.message, error.status, true, error.cooldownMs, error.code);
  }
  if (failed) failedRequestCache.delete(key);

  const inFlight = inFlightRequests.get(key);
  if (inFlight) return (await inFlight) as T;

  const task = (async () => {
    let isProbe = false;
    if (apiPauseUntil > Date.now()) throw pausedApiError();
    const releaseApiSlot = await acquireApiSlot(path);

    try {
      if (apiPauseUntil > Date.now()) throw pausedApiError();
      isProbe = await acquirePersistentProbe();
      if (!isProbe && apiPauseError) {
        if (apiProbeInFlight) throw pausedApiError();
        apiProbeInFlight = true;
        isProbe = true;
      }
      const result = await performRequest<T>(path, init);
      if (isProbe) {
        await clearPersistentPause();
        apiPauseUntil = 0;
        apiPauseError = null;
      }
      const ttl = method === "GET" ? (options.cacheTtlMs ?? 0) : 0;
      if (ttl > 0) {
        successfulGetCache.set(key, { expiresAt: Date.now() + ttl, value: result });
        trimCache(successfulGetCache);
      }
      return result;
    } catch (error) {
      const requestError =
        error instanceof MoyskladError
          ? error
          : new MoyskladError(
              error instanceof Error ? error.message : "Не удалось выполнить запрос к МойСклад.",
            );
      failedRequestCache.set(key, {
        expiresAt: Date.now() + FAILED_REQUEST_COOLDOWN_MS,
        value: requestError,
      });
      trimCache(failedRequestCache);
      const shouldPauseIntegration =
        requestError.status === 401 ||
        requestError.status === 429 ||
        (requestError.status === 403 && requestError.code === 1061);
      if (!requestError.suppressed && shouldPauseIntegration) {
        apiPauseError = requestError;
        apiPauseUntil = Date.now() + (requestError.cooldownMs ?? DEFAULT_API_PAUSE_MS);
        await persistApiPause(requestError);
      } else if (isProbe) {
        await clearPersistentPause();
        apiPauseError = null;
        apiPauseUntil = 0;
      }
      throw requestError;
    } finally {
      if (isProbe) apiProbeInFlight = false;
      releaseApiSlot();
    }
  })();

  inFlightRequests.set(key, task);
  try {
    return (await task) as T;
  } finally {
    if (inFlightRequests.get(key) === task) inFlightRequests.delete(key);
  }
}

async function performRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = requiredSetting("MOYSKLAD_TOKEN");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json;charset=utf-8");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  let result: unknown;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new MoyskladError("МойСклад вернул ответ в неизвестном формате.", response.status);
  }

  if (!response.ok) {
    const body = result as MoyskladApiError;
    const message = body.errors?.[0]?.error;
    throw new MoyskladError(
      message
        ? `МойСклад: ${message}`
        : `МойСклад отклонил запрос (HTTP ${response.status}).`,
      response.status,
      false,
      response.status === 429 ? getRetryDelay(response) : undefined,
      body.errors?.[0]?.code,
    );
  }

  return result as T;
}

function entityMeta(type: string, id: string): MoyskladMeta {
  return {
    href: `${API_URL}/entity/${type}/${encodeURIComponent(id)}`,
    type,
    mediaType: "application/json",
  };
}

export async function searchMoyskladProducts(query: string) {
  const params = new URLSearchParams({
    limit: "100",
    search: query,
    filter: "archived=false",
  });
  const result = await request<MoyskladList<MoyskladProduct>>(
    `/entity/product?${params.toString()}`,
  );
  if (!Array.isArray(result.rows)) {
    throw new MoyskladError("МойСклад вернул некорректный список товаров.");
  }
  return result.rows.map((product) => ({
    id: product.id,
    name: product.name,
    code: product.code ?? "",
  }));
}

export async function getMoyskladProduct(id: string) {
  const product = await request<MoyskladProduct>(`/entity/product/${encodeURIComponent(id)}`);
  return {
    id: product.id,
    name: product.name,
    code: product.code ?? "",
  };
}

export async function getMoyskladAvailableStock(
  assortmentIds: string[],
  options: { cacheTtlMs?: number } = {},
) {
  const stock = new Map<string, number>();
  if (assortmentIds.length === 0) return stock;

  if (
    !process.env.MOYSKLAD_TOKEN?.trim() ||
    !process.env.MOYSKLAD_STORE_ID?.trim()
  ) {
    throw new MoyskladError(
      "Для проверки остатков не заданы MOYSKLAD_TOKEN и MOYSKLAD_STORE_ID.",
    );
  }

  const assortmentSet = new Set(assortmentIds);
  const storeId = requiredSetting("MOYSKLAD_STORE_ID");
  const params = new URLSearchParams({
    filter: `storeId=${storeId}`,
    stockType: "freeStock",
  });
  const result = await request<MoyskladCurrentStockRow[]>(
    `/report/stock/all/current?${params.toString()}`,
    {},
    options,
  );
  if (!Array.isArray(result)) {
    throw new MoyskladError("МойСклад вернул некорректные данные об остатках.");
  }

  for (const row of result) {
    if (!row.assortmentId || !assortmentSet.has(row.assortmentId)) continue;
    if (typeof row.freeStock !== "number" || !Number.isFinite(row.freeStock)) {
      throw new MoyskladError("МойСклад вернул некорректное количество товара.");
    }
    stock.set(row.assortmentId, Math.max(0, row.freeStock));
  }

  return stock;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

async function findOrCreateCounterparty(name: string | null, phone: string) {
  const canonicalPhone = normalizeRussianPhone(phone);
  if (!canonicalPhone) {
    throw new MoyskladError("Для заказа нужен корректный российский номер телефона.");
  }

  const params = new URLSearchParams({
    filter: `phone=${canonicalPhone}`,
    limit: "100",
  });
  const result = await request<MoyskladList<MoyskladEntity & { phone?: string }>>(
    `/entity/counterparty?${params.toString()}`,
  );
  const matches = result.rows.filter(
    (counterparty) =>
      typeof counterparty.phone === "string" &&
      normalizePhone(counterparty.phone) === normalizePhone(canonicalPhone),
  );
  if (matches.length > 1) {
    throw new MoyskladError(
      "В МойСклад найдено несколько покупателей с этим телефоном. Проверьте карточки контрагентов.",
    );
  }
  if (matches[0]) return matches[0];

  return request<MoyskladEntity>("/entity/counterparty", {
    method: "POST",
    body: JSON.stringify({
      companyType: "individual",
      name: name?.trim() || canonicalPhone,
      phone: canonicalPhone,
    }),
  });
}

export async function findMoyskladCustomerOrder(externalCode: string) {
  const params = new URLSearchParams({
    filter: `externalCode=${externalCode}`,
    limit: "100",
  });
  const result = await request<MoyskladList<MoyskladEntity>>(
    `/entity/customerorder?${params.toString()}`,
  );
  if (result.rows.length > 1) {
    throw new MoyskladError(
      "В МойСклад найдено несколько заказов с одним внешним кодом.",
    );
  }
  return result.rows[0] ?? null;
}

export async function getMoyskladCustomerOrderStatus(orderId: string) {
  try {
    const order = await request<{
      state?: { name?: string; stateType?: string };
    }>(
      `/entity/customerorder/${encodeURIComponent(orderId)}?expand=state`,
    );
    if (typeof order.state?.name !== "string" || !order.state.name) {
      throw new MoyskladError(
        "МойСклад не вернул статус заказа покупателя.",
      );
    }
    return {
      name: order.state.name,
      type:
        typeof order.state.stateType === "string"
          ? order.state.stateType
          : null,
    };
  } catch (error) {
    if (error instanceof MoyskladError && error.status === 404) {
      return { name: "Удален", type: "Unsuccessful" };
    }
    throw error;
  }
}

export async function getMoyskladCustomerOrderStates() {
  const metadata = await request<{
    states?: {
      id?: string;
      name?: string;
      stateType?: string;
      meta?: { href?: string };
    }[];
  }>("/entity/customerorder/metadata");
  if (!Array.isArray(metadata.states)) {
    throw new MoyskladError("МойСклад не вернул статусы заказов.");
  }

  return metadata.states.map((state) => {
    const id =
      typeof state.id === "string"
        ? state.id
        : state.meta?.href?.split("/").pop();
    if (!id || typeof state.name !== "string" || !state.name) {
      throw new MoyskladError("МойСклад вернул некорректный статус заказа.");
    }
    return {
      id,
      name: state.name,
      stateType: typeof state.stateType === "string" ? state.stateType : null,
    };
  });
}

export async function setMoyskladCustomerOrderState(
  orderId: string,
  stateId: string,
  releaseReserve: boolean,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  const releasedPositions: { id: string; reserve: number }[] = [];

  if (releaseReserve) {
    const positions = await request<
      MoyskladList<{ id?: string; reserve?: number }>
    >(`/entity/customerorder/${encodedOrderId}/positions`);
    if (!Array.isArray(positions.rows)) {
      throw new MoyskladError("МойСклад не вернул позиции заказа.");
    }

    try {
      for (const position of positions.rows) {
        if (typeof position.id !== "string" || !position.id) {
          throw new MoyskladError(
            "МойСклад вернул позицию заказа без идентификатора.",
          );
        }
        if (
          typeof position.reserve !== "number" ||
          !Number.isFinite(position.reserve)
        ) {
          throw new MoyskladError(
            "МойСклад вернул некорректное значение резерва заказа.",
          );
        }
        if (position.reserve <= 0) continue;

        await request(
          `/entity/customerorder/${encodedOrderId}/positions/${encodeURIComponent(position.id)}`,
          {
            method: "PUT",
            body: JSON.stringify({ reserve: 0 }),
          },
        );
        releasedPositions.push({ id: position.id, reserve: position.reserve });
      }
    } catch (error) {
      try {
        await Promise.all(
          releasedPositions.map((position) =>
            request(
              `/entity/customerorder/${encodedOrderId}/positions/${encodeURIComponent(position.id)}`,
              {
                method: "PUT",
                body: JSON.stringify({ reserve: position.reserve }),
              },
            ),
          ),
        );
      } catch (restoreError) {
        console.error(
          `Не удалось восстановить резерв заказа МойСклад ${orderId} после ошибки снятия резерва.`,
          restoreError,
        );
        throw new MoyskladError(
          "Не удалось полностью снять резерв и восстановить изменения. Проверьте заказ в МойСклад.",
        );
      }
      throw error;
    }
  }

  try {
    await request(`/entity/customerorder/${encodedOrderId}`, {
      method: "PUT",
      body: JSON.stringify({
        state: {
          meta: {
            href: `${API_URL}/entity/customerorder/metadata/states/${encodeURIComponent(stateId)}`,
            type: "state",
            mediaType: "application/json",
          },
        },
      }),
    });
  } catch (error) {
    if (releasedPositions.length > 0) {
      try {
        await Promise.all(
          releasedPositions.map((position) =>
            request(
              `/entity/customerorder/${encodedOrderId}/positions/${encodeURIComponent(position.id)}`,
              {
                method: "PUT",
                body: JSON.stringify({ reserve: position.reserve }),
              },
            ),
          ),
        );
      } catch (restoreError) {
        console.error(
          `Не удалось восстановить резерв заказа МойСклад ${orderId} после ошибки смены статуса.`,
          restoreError,
        );
        throw new MoyskladError(
          "Не удалось изменить статус заказа и восстановить резерв. Проверьте заказ в МойСклад.",
        );
      }
    }
    throw error;
  }

  return getMoyskladCustomerOrderStatus(orderId);
}

export async function createMoyskladCustomerOrder({
  externalCode,
  localOrderId,
  contactName,
  phoneNumber,
  items,
}: {
  externalCode: string;
  localOrderId: string;
  contactName: string | null;
  phoneNumber: string;
  items: {
    assortmentId: string;
    quantity: number;
    unitPrice: number;
  }[];
}) {
  const organizationId = requiredSetting("MOYSKLAD_ORGANIZATION_ID");
  const storeId = requiredSetting("MOYSKLAD_STORE_ID");
  const counterparty = await findOrCreateCounterparty(contactName, phoneNumber);

  return request<MoyskladEntity>("/entity/customerorder", {
    method: "POST",
    body: JSON.stringify({
      name: `WEB-${localOrderId.slice(-8).toUpperCase()}`,
      externalCode,
      description: `Заказ с сайта, номер ${localOrderId}`,
      organization: { meta: entityMeta("organization", organizationId) },
      store: { meta: entityMeta("store", storeId) },
      agent: { meta: counterparty.meta },
      positions: {
        rows: items.map((item) => ({
          quantity: item.quantity,
          price: item.unitPrice * 100,
          reserve: item.quantity,
          assortment: {
            meta: entityMeta("product", item.assortmentId),
          },
        })),
      },
    }),
  });
}
