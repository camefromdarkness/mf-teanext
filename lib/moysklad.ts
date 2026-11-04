import "server-only";
import { normalizeRussianPhone } from "@/lib/phone";

const API_URL = "https://api.moysklad.ru/api/remap/1.2";

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

type MoyskladStockRow = {
  meta?: { href?: string };
  quantity?: number;
};

type MoyskladEntity = {
  id: string;
  meta: { href: string };
};

type MoyskladApiError = {
  errors?: { error?: string }[];
};

export class MoyskladError extends Error {
  constructor(
    message: string,
    readonly status?: number,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

let missingStockConfigurationReported = false;

export async function getMoyskladAvailableStock(assortmentIds: string[]) {
  const stock = new Map<string, number>();
  if (assortmentIds.length === 0) return stock;

  if (
    !process.env.MOYSKLAD_TOKEN?.trim() ||
    !process.env.MOYSKLAD_STORE_ID?.trim()
  ) {
    if (!missingStockConfigurationReported) {
      console.error(
        "Остатки МойСклад недоступны: задайте MOYSKLAD_TOKEN и MOYSKLAD_STORE_ID.",
      );
      missingStockConfigurationReported = true;
    }
    return stock;
  }

  const assortmentSet = new Set(assortmentIds);
  const storeId = requiredSetting("MOYSKLAD_STORE_ID");
  const storeHref = entityMeta("store", storeId).href;
  const limit = 1000;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      filter: `store=${storeHref}`,
      limit: String(limit),
      offset: String(offset),
    });
    const result = await request<MoyskladList<MoyskladStockRow>>(
      `/report/stock/all?${params.toString()}`,
    );
    if (!Array.isArray(result.rows)) {
      throw new MoyskladError("МойСклад вернул некорректные данные об остатках.");
    }

    for (const row of result.rows) {
      const assortmentHref = row.meta?.href;
      const assortmentId = assortmentHref
        ? new URL(assortmentHref).pathname.split("/").pop()
        : undefined;
      if (!assortmentId || !assortmentSet.has(assortmentId)) continue;
      if (
        typeof row.quantity !== "number" ||
        !Number.isFinite(row.quantity)
      ) {
        throw new MoyskladError("МойСклад вернул некорректное количество товара.");
      }
      stock.set(assortmentId, Math.max(0, row.quantity));
    }

    if (result.rows.length < limit) break;
    offset += limit;
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
