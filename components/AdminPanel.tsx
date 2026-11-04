"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Tea, TeaImage } from "@/data/teas";

type AdminTea = Tea & { isActive: boolean };
type Draft = Omit<
  Tea,
  "id" | "images" | "isActive" | "sortOrder" | "discountPercent" | "availableStock"
> & {
  images: TeaImage[];
  discountPercent: string;
};

type MoyskladProduct = { id: string; name: string; code: string };

type AdminOrder = {
  id: string;
  contactName: string | null;
  phoneNumber: string;
  status: string;
  total: number;
  createdAt: string;
  moyskladOrderId: string | null;
  moyskladStatus: string | null;
  moyskladStatusType: string | null;
  items: {
    id: string;
    teaName: string;
    teaUnit: string;
    quantity: number;
    unitPrice: number;
  }[];
};

function isUnsuccessfulMoyskladStatus(
  status: string | null,
  statusType: string | null,
) {
  return (
    statusType === "Unsuccessful" ||
    ["Отменен", "Отклонен", "Удален", "Возврат"].includes(status ?? "")
  );
}

function isAdminOrder(value: unknown): value is AdminOrder {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("contactName" in value) ||
    !(typeof value.contactName === "string" || value.contactName === null) ||
    !("phoneNumber" in value) ||
    typeof value.phoneNumber !== "string" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !("total" in value) ||
    typeof value.total !== "number" ||
    !("createdAt" in value) ||
    typeof value.createdAt !== "string" ||
    !("moyskladOrderId" in value) ||
    !(typeof value.moyskladOrderId === "string" || value.moyskladOrderId === null) ||
    !("moyskladStatus" in value) ||
    !(typeof value.moyskladStatus === "string" || value.moyskladStatus === null) ||
    !("moyskladStatusType" in value) ||
    !(typeof value.moyskladStatusType === "string" || value.moyskladStatusType === null) ||
    !("items" in value) ||
    !Array.isArray(value.items)
  ) {
    return false;
  }

  return value.items.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string" &&
      "teaName" in item &&
      typeof item.teaName === "string" &&
      "teaUnit" in item &&
      typeof item.teaUnit === "string" &&
      "quantity" in item &&
      typeof item.quantity === "number" &&
      "unitPrice" in item &&
      typeof item.unitPrice === "number",
  );
}

const EMPTY_DRAFT: Draft = {
  moyskladAssortmentId: null,
  type: "",
  name: "",
  shortDesc: "",
  price: "",
  discountPercent: "20",
  unit: "₽ / 50г",
  description: "",
  details: [],
  images: [],
};

function draftFromTea(tea: AdminTea): Draft {
  return {
    moyskladAssortmentId: tea.moyskladAssortmentId,
    type: tea.type,
    name: tea.name,
    shortDesc: tea.shortDesc,
    price: tea.price,
    discountPercent: String(tea.discountPercent),
    unit: tea.unit,
    description: tea.description,
    details: tea.details,
    images: tea.images,
  };
}

export default function AdminPanel({
  authenticated,
  initialTeas,
}: {
  authenticated: boolean;
  initialTeas: AdminTea[];
}) {
  const router = useRouter();
  const [teas, setTeas] = useState(initialTeas);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [detailsText, setDetailsText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaImages, setMediaImages] = useState<{ url: string; alt: string }[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moyskladSearch, setMoyskladSearch] = useState("");
  const [moyskladProducts, setMoyskladProducts] = useState<MoyskladProduct[]>([]);
  const [selectedMoyskladProduct, setSelectedMoyskladProduct] =
    useState<MoyskladProduct | null>(null);
  const [moyskladSearchBusy, setMoyskladSearchBusy] = useState(false);
  const [moyskladSearchError, setMoyskladSearchError] = useState("");
  const [draggedTeaId, setDraggedTeaId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "orders">("catalog");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const editing = selectedId !== "";

  async function readError(response: Response) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return body?.error ?? "Не удалось выполнить запрос.";
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setPassword("");
      router.refresh();
    } catch (requestError) {
      console.error("Не удалось выполнить вход в админ-панель.", requestError);
      setError("Не удалось подключиться к серверу.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      router.refresh();
    } catch (requestError) {
      console.error("Не удалось завершить сеанс администратора.", requestError);
      setError("Не удалось выйти. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function loadOrders() {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      if (!response.ok) {
        setOrdersError(await readError(response));
        return;
      }
      const result: unknown = await response.json();
      if (!Array.isArray(result) || !result.every(isAdminOrder)) {
        throw new Error("Сервер вернул некорректный список заказов.");
      }
      setOrders(result);
      setOrdersLoaded(true);
    } catch (requestError) {
      console.error("Не удалось загрузить заказы.", requestError);
      setOrdersError("Не удалось загрузить заказы.");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function uploadImage(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/images", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const result = (await response.json()) as { url: string };
      setMediaImages((current) =>
        current.some((image) => image.url === result.url)
          ? current
          : [...current, { url: result.url, alt: draft.name }],
      );
      setDraft((current) => ({
        ...current,
        images: [
          ...current.images,
          {
            url: result.url,
            alt: current.name,
            sortOrder: current.images.length,
            isCover: current.images.length === 0,
            showInGallery: true,
          },
        ],
      }));
    } catch (requestError) {
      console.error("Не удалось загрузить изображение.", requestError);
      setError("Не удалось загрузить файл.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.moyskladAssortmentId) {
      setError("Сначала выберите позицию в МойСклад.");
      return;
    }
    setBusy(true);
    setError("");
    const details = detailsText
      .split("\n")
      .map((line) => line.split("|").map((part) => part.trim()))
      .filter((parts) => parts.some(Boolean))
      .map(([label, ...rest]) => [label ?? "", rest.join(" | ")] as [string, string]);

    try {
      const response = await fetch("/api/admin/teas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: Number(selectedId) } : {}),
          ...draft,
          price: Number(draft.price),
          discountPercent: Number(draft.discountPercent),
          details,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const saved = (await response.json()) as AdminTea;
      setTeas((current) => {
        const found = current.some((tea) => tea.id === saved.id);
        return found
          ? current.map((tea) => (tea.id === saved.id ? saved : tea))
          : [...current, saved];
      });
      setSelectedId(String(saved.id));
    } catch (requestError) {
      console.error("Не удалось сохранить данные чая.", requestError);
      setError("Не удалось сохранить товар.");
    } finally {
      setBusy(false);
    }
  }

  function selectMoyskladItem(product: MoyskladProduct) {
    setSelectedMoyskladProduct(product);
    setDraft((current) => ({
      ...current,
      moyskladAssortmentId: product.id,
    }));
    setMoyskladProducts([]);
  }

  useEffect(() => {
    const query = moyskladSearch.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setMoyskladSearchBusy(true);
      setMoyskladSearchError("");
      try {
        const response = await fetch(
          `/api/admin/moysklad/products?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setMoyskladSearchError(await readError(response));
          return;
        }
        setMoyskladProducts((await response.json()) as MoyskladProduct[]);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        console.error("Не удалось выполнить поиск в МойСклад.", requestError);
        setMoyskladSearchError("Не удалось подключиться к МойСклад.");
      } finally {
        if (!controller.signal.aborted) setMoyskladSearchBusy(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [moyskladSearch]);

  async function toggleTea(tea: AdminTea) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tea.id, isActive: !tea.isActive }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const updated = (await response.json()) as AdminTea;
      setTeas((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (requestError) {
      console.error("Не удалось изменить видимость чая.", requestError);
      setError("Не удалось изменить видимость товара.");
    } finally {
      setBusy(false);
    }
  }

  async function reorderTea(sourceId: number, targetId: number) {
    if (sourceId === targetId || busy) return;
    const previousTeas = teas;
    const sourceIndex = teas.findIndex((tea) => tea.id === sourceId);
    const targetIndex = teas.findIndex((tea) => tea.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const reordered = [...teas];
    const [movedTea] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedTea);
    const orderedTeas = reordered.map((tea, sortOrder) => ({
      ...tea,
      sortOrder,
    }));
    setTeas(orderedTeas);
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/teas/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedTeas.map((tea) => tea.id) }),
      });
      if (!response.ok) {
        setTeas(previousTeas);
        setError(await readError(response));
        return;
      }
    } catch (requestError) {
      console.error("Не удалось сохранить порядок товаров.", requestError);
      setTeas(previousTeas);
      setError("Не удалось сохранить порядок товаров.");
    } finally {
      setBusy(false);
    }
  }

  function startDraggingTea(event: DragEvent<HTMLButtonElement>, teaId: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(teaId));
    setDraggedTeaId(teaId);
  }

  function dropTea(event: DragEvent<HTMLDivElement>, targetId: number) {
    event.preventDefault();
    const sourceId = Number(event.dataTransfer.getData("text/plain"));
    setDraggedTeaId(null);
    if (Number.isSafeInteger(sourceId)) void reorderTea(sourceId, targetId);
  }

  function startNewTea() {
    setSelectedId("");
    setDraft(EMPTY_DRAFT);
    setDetailsText("");
    setSelectedMoyskladProduct(null);
    setMoyskladProducts([]);
    setMoyskladSearch("");
  }

  function selectTea(tea: AdminTea) {
    setSelectedId(String(tea.id));
    setDraft(draftFromTea(tea));
    setDetailsText(tea.details.map(([key, value]) => `${key} | ${value}`).join("\n"));
    setSelectedMoyskladProduct(null);
    setMoyskladProducts([]);
    setMoyskladSearch("");
    if (tea.moyskladAssortmentId) {
      void fetch(
        `/api/admin/moysklad/products?id=${encodeURIComponent(tea.moyskladAssortmentId)}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response));
          const product = (await response.json()) as MoyskladProduct;
          setSelectedMoyskladProduct(product);
        })
        .catch((requestError: unknown) => {
          console.error("Не удалось получить привязанный товар МойСклад.", requestError);
          setError("Не удалось загрузить связанную позицию из МойСклад.");
        });
    }
  }

  async function openImageLibrary() {
    setMediaOpen((open) => !open);
    if (mediaImages.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/images");
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setMediaImages((await response.json()) as { url: string; alt: string }[]);
    } catch (requestError) {
      console.error("Не удалось получить каталог изображений.", requestError);
      setError("Не удалось загрузить список фотографий.");
    } finally {
      setBusy(false);
    }
  }

  function addImageFromLibrary(image: { url: string; alt: string }) {
    setDraft((current) =>
      current.images.some((item) => item.url === image.url)
        ? current
        : {
            ...current,
            images: [
              ...current.images,
              {
                ...image,
                sortOrder: current.images.length,
                isCover: current.images.length === 0,
                showInGallery: true,
              },
            ],
          },
    );
    setMediaOpen(false);
  }

  if (!authenticated) {
    return (
      <main className="admin-page">
        <form className="admin-login" onSubmit={login}>
          <Link className="admin-back-link" href="/">← В магазин</Link>
          <p className="tea-category-label">MOON FLOWER</p>
          <h1>Вход в админ-панель</h1>
          <label>
            Пароль администратора
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Проверка…" : "Войти"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <div>
          <Link className="admin-back-link" href="/">← В магазин</Link>
          <p className="tea-category-label">УПРАВЛЕНИЕ КАТАЛОГОМ</p>
          <h1>Админ-панель</h1>
        </div>
        <button type="button" className="admin-secondary-button" onClick={logout} disabled={busy}>
          Выйти
        </button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <nav
        className="admin-tabs"
        role="tablist"
        aria-label="Разделы админ-панели"
      >
        <button
          type="button"
          role="tab"
          id="admin-catalog-tab"
          aria-controls="admin-catalog-panel"
          aria-selected={activeTab === "catalog"}
          className={activeTab === "catalog" ? "active" : ""}
          onClick={() => setActiveTab("catalog")}
        >
          Каталог
        </button>
        <button
          type="button"
          role="tab"
          id="admin-orders-tab"
          aria-controls="admin-orders-panel"
          aria-selected={activeTab === "orders"}
          className={activeTab === "orders" ? "active" : ""}
          onClick={() => {
            setActiveTab("orders");
            if (!ordersLoaded && !ordersLoading) void loadOrders();
          }}
        >
          Заказы
        </button>
      </nav>
      {activeTab === "catalog" ? (
      <div
        className="admin-layout"
        role="tabpanel"
        id="admin-catalog-panel"
        aria-labelledby="admin-catalog-tab"
      >
        <section className="admin-products">
          <button
            className={`admin-product-row${selectedId === "" ? " selected" : ""}`}
            type="button"
            onClick={startNewTea}
          >
            + Добавить чай
          </button>
          {teas.map((tea) => (
            <div
              className={`admin-product-row${selectedId === String(tea.id) ? " selected" : ""}${draggedTeaId === tea.id ? " dragging" : ""}`}
              key={tea.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => dropTea(event, tea.id)}
            >
              <button
                type="button"
                className="admin-drag-handle"
                aria-label={`Перетащить «${tea.name}» для изменения порядка`}
                draggable
                disabled={busy}
                onDragStart={(event) => startDraggingTea(event, tea.id)}
                onDragEnd={() => setDraggedTeaId(null)}
              >
                ⠿
              </button>
              <button type="button" onClick={() => selectTea(tea)}>
                {tea.name}
                <small>{tea.isActive ? "Опубликован" : "Скрыт"}</small>
              </button>
              <button
                type="button"
                className="admin-visibility-button"
                aria-label={tea.isActive ? "Скрыть чай" : "Опубликовать чай"}
                disabled={busy}
                onClick={() => toggleTea(tea)}
              >
                {tea.isActive ? "Скрыть" : "Показать"}
              </button>
            </div>
          ))}
        </section>
        <form className="admin-editor" onSubmit={saveTea}>
          <h2>{editing ? "Редактировать чай" : "Новый чай"}</h2>
          <div className="admin-fields-grid">
            <label>
              Категория
              <input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} required />
            </label>
            <label>
              Цена, ₽
              <input type="number" min="1" step="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required />
            </label>
            <label>
              Скидка, %
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={draft.discountPercent}
                onChange={(event) =>
                  setDraft({ ...draft, discountPercent: event.target.value })
                }
                required
              />
            </label>
          </div>
          <label>
            Название
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </label>
          <label>
            Короткое описание
            <input value={draft.shortDesc} onChange={(event) => setDraft({ ...draft, shortDesc: event.target.value })} required />
          </label>
          <label>
            Единица продажи
            <input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} required />
          </label>
          <div className="admin-moysklad-link">
            <label>
              Позиция в МойСклад
              <input
                value={moyskladSearch}
                onChange={(event) => {
                  setMoyskladSearch(event.target.value);
                  setMoyskladProducts([]);
                  setMoyskladSearchBusy(event.target.value.trim().length >= 2);
                  setMoyskladSearchError("");
                }}
                placeholder="Название или артикул"
                role="combobox"
                aria-autocomplete="list"
                aria-describedby="moysklad-search-hint"
                aria-controls="moysklad-product-suggestions"
                aria-expanded={moyskladProducts.length > 0}
                autoComplete="off"
              />
            </label>
            <p id="moysklad-search-hint">
              Начните вводить название или артикул — покажу подходящие товары.
            </p>
            {moyskladSearchBusy && <p role="status">Ищем в МойСклад…</p>}
            {moyskladSearchError && (
              <p className="admin-error" role="alert">{moyskladSearchError}</p>
            )}
            {selectedMoyskladProduct ? (
              <p>
                Связано: {selectedMoyskladProduct.name}
                {selectedMoyskladProduct.code
                  ? ` · артикул ${selectedMoyskladProduct.code}`
                  : ""}
              </p>
            ) : draft.moyskladAssortmentId ? (
              <p>Связанный товар ID: {draft.moyskladAssortmentId}</p>
            ) : (
              <p>Не выбрано. Без связи с товаром нельзя проверить остаток или оформить заказ.</p>
            )}
            {draft.moyskladAssortmentId && (
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    moyskladAssortmentId: null,
                  }));
                  setSelectedMoyskladProduct(null);
                }}
              >
                Убрать связь
              </button>
            )}
            {moyskladProducts.length > 0 && (
              <div
                className="admin-moysklad-results"
                id="moysklad-product-suggestions"
                role="listbox"
                aria-label="Товары МойСклад"
              >
                {moyskladProducts.map((product) => (
                  <button
                    type="button"
                    className="admin-secondary-button"
                    key={product.id}
                    role="option"
                    aria-selected={draft.moyskladAssortmentId === product.id}
                    onClick={() => selectMoyskladItem(product)}
                  >
                    <span>{product.name}</span>
                    <small>
                      {product.code ? `Артикул: ${product.code}` : "Без артикула"}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {!moyskladSearchBusy &&
              moyskladSearch.trim().length >= 2 &&
              !moyskladSearchError &&
              moyskladProducts.length === 0 && (
                <p role="status">Подходящих товаров не найдено.</p>
              )}
          </div>
          <label>
            Описание
            <textarea rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required />
          </label>
          <label>
            Характеристики (одна строка на пункт, формат: «Название | значение»)
            <textarea rows={4} value={detailsText} onChange={(event) => setDetailsText(event.target.value)} />
          </label>
          <div className="admin-image-heading">
            <h3>Фотографии</h3>
            <div className="admin-image-actions">
              <button type="button" className="admin-secondary-button" onClick={openImageLibrary} disabled={busy}>
                Выбрать из каталога
              </button>
              <label className="admin-upload-button">
                Загрузить фото
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          {mediaOpen && (
            <div className="admin-media-library">
              {mediaImages.length ? mediaImages.map((image) => (
                <button
                  type="button"
                  className="admin-media-image"
                  key={image.url}
                  disabled={draft.images.some((item) => item.url === image.url)}
                  onClick={() => addImageFromLibrary(image)}
                >
                  <span><Image src={image.url} alt={image.alt} fill sizes="100px" /></span>
                  {draft.images.some((item) => item.url === image.url) ? "Уже выбрано" : "Добавить"}
                </button>
              )) : <p>В каталоге пока нет фотографий.</p>}
            </div>
          )}
          {draft.images.length === 0 ? (
            <p className="admin-image-hint">Добавьте хотя бы одно фото или выберите существующее из каталога.</p>
          ) : (
            <div className="admin-image-grid">
              {draft.images.map((image, index) => (
                <div className="admin-image-card" key={`${image.url}-${index}`}>
                  <div className="admin-image-preview">
                    <Image src={image.url} alt={image.alt} fill sizes="160px" />
                  </div>
                  <label>
                    <input
                      type="radio"
                      name="cover"
                      checked={image.isCover}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          images: current.images.map((item, itemIndex) => ({
                            ...item,
                            isCover: itemIndex === index,
                          })),
                        }))
                      }
                    />
                    Фото карточки
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={image.showInGallery}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          images: current.images.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, showInGallery: event.target.checked }
                              : item,
                          ),
                        }))
                      }
                    />
                    В галерее
                  </label>
                  <button
                    type="button"
                    className="admin-remove-image"
                    onClick={() =>
                      setDraft((current) => {
                        const images = current.images
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
                        if (image.isCover && images[0]) images[0].isCover = true;
                        return { ...current, images };
                      })
                    }
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}
          {!draft.moyskladAssortmentId && (
            <p className="admin-error" role="alert">
              Чтобы сохранить товар, сначала свяжите его с позицией МойСклад.
            </p>
          )}
          <button
            className="admin-save-button"
            type="submit"
            disabled={busy || !draft.moyskladAssortmentId}
          >
            {busy ? "Сохранение…" : "Сохранить чай"}
          </button>
        </form>
      </div>
      ) : (
        <section
          className="admin-orders"
          role="tabpanel"
          id="admin-orders-panel"
          aria-labelledby="admin-orders-tab"
        >
          <div className="admin-orders-heading">
            <div>
              <h2>Заказы</h2>
              <p>Последние 100 заказов, включая ожидающие синхронизации с МойСклад.</p>
            </div>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => void loadOrders()}
              disabled={ordersLoading}
            >
              {ordersLoading ? "Загружаем…" : "Обновить"}
            </button>
          </div>
          {ordersError && <p className="admin-error" role="alert">{ordersError}</p>}
          {ordersLoading && !ordersLoaded ? (
            <p role="status">Загружаем заказы…</p>
          ) : orders.length === 0 ? (
            <p className="admin-orders-empty">Заказов пока нет.</p>
          ) : (
            <div className="admin-orders-list">
              {orders.map((order) => (
                <article className="admin-order" key={order.id}>
                  <div className="admin-order-heading">
                    <div>
                      <h3>Заказ №{order.id.slice(-8).toUpperCase()}</h3>
                      <time dateTime={order.createdAt}>
                        {new Date(order.createdAt).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <span>
                      {order.moyskladStatus
                        ? `${isUnsuccessfulMoyskladStatus(order.moyskladStatus, order.moyskladStatusType) ? "Не принят — " : "МойСклад — "}${order.moyskladStatus}`
                        : order.status === "REJECTED"
                          ? "Отклонен"
                          : "Ожидает подтверждения"}
                    </span>
                  </div>
                  <p>
                    Покупатель: {order.contactName || "Имя не указано"} ·{" "}
                    <a href={`tel:${order.phoneNumber}`}>{order.phoneNumber}</a>
                  </p>
                  <ul>
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.teaName} — {item.quantity} ×{" "}
                          {item.unitPrice.toLocaleString("ru-RU")} ₽
                          {item.teaUnit ? ` / ${item.teaUnit}` : ""}
                        </span>
                        <span>
                          {(item.quantity * item.unitPrice).toLocaleString("ru-RU")} ₽
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="admin-order-footer">
                    <strong>
                      Итого: {order.total.toLocaleString("ru-RU")} ₽
                    </strong>
                    {order.moyskladOrderId ? (
                      <span>
                        {order.moyskladStatus
                          ? `МойСклад: ${order.moyskladStatus}`
                          : "Записан в МойСклад"}
                      </span>
                    ) : (
                      <span className="admin-order-unsynced">
                        Не синхронизирован с МойСклад
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
