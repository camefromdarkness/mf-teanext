"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { signOut } from "next-auth/react";
import type { Tea, TeaImage } from "@/data/teas";
import AdminUsersPanel from "@/components/AdminUsersPanel";

type AdminTea = Tea & { isActive: boolean };
type StaffRole = "MANAGER" | "ADMIN" | "SUPER_ADMIN";
type Draft = Omit<
  Tea,
  "id" | "images" | "isActive" | "sortOrder" | "discountPercent" | "availableStock"
> & {
  images: TeaImage[];
  discountPercent: string;
};

type MoyskladProduct = { id: string; name: string; code: string };
type MoyskladOrderState = { id: string; name: string; stateType: string | null };
type PendingOrderAction = {
  order: AdminOrder;
  action: "paid" | "rejected" | "delete";
  stateId?: string;
  stateName?: string;
};

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

type MediaImage = {
  url: string;
  alt: string;
  uploaded?: boolean;
  inUse?: boolean;
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
  role,
  currentUserId,
  initialTeas,
}: {
  role: StaffRole;
  currentUserId: string;
  initialTeas: AdminTea[];
}) {
  const canEditExistingTeas = role !== "MANAGER";
  const canManageUsers = role !== "MANAGER";
  const canDeleteOrders = role !== "MANAGER";
  const [teas, setTeas] = useState(initialTeas);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [detailsText, setDetailsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaImages, setMediaImages] = useState<MediaImage[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moyskladSearch, setMoyskladSearch] = useState("");
  const [moyskladProducts, setMoyskladProducts] = useState<MoyskladProduct[]>([]);
  const [selectedMoyskladProduct, setSelectedMoyskladProduct] =
    useState<MoyskladProduct | null>(null);
  const [moyskladSearchBusy, setMoyskladSearchBusy] = useState(false);
  const [moyskladSearchError, setMoyskladSearchError] = useState("");
  const [draggedTeaId, setDraggedTeaId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const productsListRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    teaId: number;
    pointerId: number;
    dropIndex: number;
    clientY: number;
  } | null>(null);
  const [teaPendingDeletion, setTeaPendingDeletion] = useState<AdminTea | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "orders" | "users">("catalog");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersError, setOrdersError] = useState("");
  const [ordersNotice, setOrdersNotice] = useState("");
  const [orderStates, setOrderStates] = useState<MoyskladOrderState[]>([]);
  const [orderStatesLoaded, setOrderStatesLoaded] = useState(false);
  const [orderActionBusyId, setOrderActionBusyId] = useState("");
  const [pendingOrderAction, setPendingOrderAction] =
    useState<PendingOrderAction | null>(null);
  const [orderStateById, setOrderStateById] = useState<
    Record<string, { paid?: string; rejected?: string }>
  >({});
  const editing = selectedId !== "";
  const categories = useMemo(
    () => [...new Set(teas.map((tea) => tea.type.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [teas],
  );

  useEffect(() => {
    if (!teaPendingDeletion) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setTeaPendingDeletion(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [teaPendingDeletion, busy]);

  useEffect(() => {
    if (!pendingOrderAction) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !orderActionBusyId) {
        setPendingOrderAction(null);
        setOrdersError("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingOrderAction, orderActionBusyId]);

  async function readError(response: Response) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return body?.error ?? "Не удалось выполнить запрос.";
  }

  async function loadOrders(page = ordersPage) {
    setOrdersLoading(true);
    setOrdersError("");
    setOrdersNotice("");
    try {
      const response = await fetch(`/api/admin/orders?page=${page}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setOrdersError(await readError(response));
        return;
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("orders" in result) ||
        !Array.isArray(result.orders) ||
        !result.orders.every(isAdminOrder) ||
        !("page" in result) ||
        typeof result.page !== "number" ||
        !Number.isSafeInteger(result.page) ||
        !("totalPages" in result) ||
        typeof result.totalPages !== "number" ||
        !Number.isSafeInteger(result.totalPages) ||
        !("total" in result) ||
        typeof result.total !== "number" ||
        !Number.isSafeInteger(result.total)
      ) {
        throw new Error("Сервер вернул некорректный список заказов.");
      }
      setOrders(result.orders);
      setOrdersPage(result.page);
      setOrdersTotalPages(Math.max(1, result.totalPages));
      setOrdersTotal(result.total);
      if (response.headers.get("X-Moysklad-Status-Sync") === "failed") {
        setOrdersNotice(
          "Не удалось обновить статусы из МойСклад. Показаны последние сохранённые данные.",
        );
      }
      setOrdersLoaded(true);
    } catch (requestError) {
      console.error("Не удалось загрузить заказы.", requestError);
      setOrdersError("Не удалось загрузить заказы.");
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadOrderStates() {
    try {
      const response = await fetch("/api/admin/orders/states", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response));
      const result: unknown = await response.json();
      if (
        !Array.isArray(result) ||
        !result.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            "id" in item &&
            typeof item.id === "string" &&
            "name" in item &&
            typeof item.name === "string",
        )
      ) {
        throw new Error("Сервер вернул некорректный список статусов МойСклад.");
      }
      setOrderStates(result as MoyskladOrderState[]);
      setOrderStatesLoaded(true);
    } catch (requestError) {
      console.error("Не удалось загрузить статусы МойСклад.", requestError);
      setOrdersError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось загрузить статусы из МойСклад.",
      );
    }
  }

  function requestOrderStatus(
    order: AdminOrder,
    decision: "paid" | "rejected",
  ) {
    const stateId = orderStateById[order.id]?.[decision];
    if (!stateId) {
      setOrdersError("Сначала выберите статус МойСклад для этого действия.");
      return;
    }
    const selectedState = orderStates.find((state) => state.id === stateId);
    if (!selectedState) {
      setOrdersError("Выбранный статус не найден. Обновите список статусов.");
      return;
    }
    setOrdersError("");
    setPendingOrderAction({
      order,
      action: decision,
      stateId,
      stateName: selectedState.name,
    });
  }

  async function updateOrderStatus(
    order: AdminOrder,
    decision: "paid" | "rejected",
    stateId: string,
  ) {
    setOrderActionBusyId(order.id);
    setOrdersError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, stateId }),
      });
      if (!response.ok) {
        setOrdersError(await readError(response));
        return;
      }
      const updated = (await response.json()) as {
        id: string;
        status: string;
        moyskladStatus: string | null;
      };
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                status: updated.status,
                moyskladStatus: updated.moyskladStatus,
              }
            : item,
        ),
      );
      setPendingOrderAction(null);
    } catch (requestError) {
      console.error("Не удалось изменить статус заказа.", requestError);
      setOrdersError("Не удалось изменить статус заказа.");
    } finally {
      setOrderActionBusyId("");
    }
  }

  function requestDeleteOrder(order: AdminOrder) {
    setOrdersError("");
    setPendingOrderAction({ order, action: "delete" });
  }

  async function deleteOrder(order: AdminOrder) {
    setOrderActionBusyId(order.id);
    setOrdersError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id }),
      });
      if (!response.ok) {
        setOrdersError(await readError(response));
        return;
      }
      setPendingOrderAction(null);
      await loadOrders(
        orders.length === 1 && ordersPage > 1 ? ordersPage - 1 : ordersPage,
      );
    } catch (requestError) {
      console.error("Не удалось удалить локальную запись заказа.", requestError);
      setOrdersError("Не удалось удалить запись заказа.");
    } finally {
      setOrderActionBusyId("");
    }
  }

  function confirmOrderAction() {
    if (!pendingOrderAction) return;
    const { order, action, stateId } = pendingOrderAction;
    if (action === "delete") {
      void deleteOrder(order);
    } else if (stateId) {
      void updateOrderStatus(order, action, stateId);
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
          : [...current, { url: result.url, alt: draft.name, uploaded: true }],
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

  async function deleteTea(tea: AdminTea) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tea.id }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      setTeas((current) => current.filter((item) => item.id !== tea.id));
      setSelectedId("");
      setDraft(EMPTY_DRAFT);
      setDetailsText("");
      setSelectedMoyskladProduct(null);
      setMoyskladProducts([]);
      setMoyskladSearch("");
      setCreatingCategory(false);
      setTeaPendingDeletion(null);
    } catch (requestError) {
      console.error("Не удалось удалить товар из каталога.", requestError);
      setError("Не удалось удалить товар.");
    } finally {
      setBusy(false);
    }
  }

  async function reorderTea(sourceId: number, targetIndex: number) {
    if (busy) return;
    const previousTeas = teas;
    const sourceIndex = teas.findIndex((tea) => tea.id === sourceId);
    if (sourceIndex < 0) return;

    const reordered = [...teas];
    const [movedTea] = reordered.splice(sourceIndex, 1);
    const insertionIndex = Math.max(
      0,
      Math.min(
        targetIndex > sourceIndex ? targetIndex - 1 : targetIndex,
        reordered.length,
      ),
    );
    if (insertionIndex === sourceIndex) return;
    reordered.splice(insertionIndex, 0, movedTea);
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

  const getDropIndex = useCallback((clientY: number) => {
    const rows = productsListRef.current?.querySelectorAll<HTMLElement>(
      "[data-tea-id]",
    );
    if (!rows) return teas.length;

    for (let index = 0; index < rows.length; index += 1) {
      const bounds = rows[index].getBoundingClientRect();
      if (clientY < bounds.top + bounds.height / 2) return index;
    }
    return rows.length;
  }, [teas.length]);

  function startDraggingTea(
    event: React.PointerEvent<HTMLButtonElement>,
    teaId: number,
  ) {
    if (busy || event.button !== 0) return;
    event.preventDefault();
    const index = getDropIndex(event.clientY);
    dragStateRef.current = {
      teaId,
      pointerId: event.pointerId,
      dropIndex: index,
      clientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedTeaId(teaId);
    setDropIndex(index);
  }

  function moveDraggedTea(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.clientY = event.clientY;
    drag.dropIndex = getDropIndex(event.clientY);
    setDropIndex(drag.dropIndex);
  }

  function finishDraggingTea(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDraggedTeaId(null);
    setDropIndex(null);
    void reorderTea(drag.teaId, drag.dropIndex);
  }

  function cancelDraggingTea(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDraggedTeaId(null);
    setDropIndex(null);
  }

  useEffect(() => {
    if (draggedTeaId === null) return;

    function scrollDuringDrag(event: WheelEvent) {
      const list = productsListRef.current;
      const drag = dragStateRef.current;
      if (!list || !drag) return;
      event.preventDefault();
      list.scrollTop += event.deltaY;
      drag.dropIndex = getDropIndex(drag.clientY);
      setDropIndex(drag.dropIndex);
    }

    window.addEventListener("wheel", scrollDuringDrag, { passive: false });
    return () => window.removeEventListener("wheel", scrollDuringDrag);
  }, [draggedTeaId, getDropIndex]);

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
      setMediaImages((await response.json()) as MediaImage[]);
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

  async function deleteLibraryImage(image: MediaImage) {
    if (!image.uploaded || image.inUse) return;
    if (!window.confirm("Удалить загруженную фотографию? Это действие нельзя отменить.")) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image.url }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setMediaImages((current) =>
        current.filter((item) => item.url !== image.url),
      );
    } catch (requestError) {
      console.error("Не удалось удалить фотографию.", requestError);
      setError("Не удалось удалить фотографию.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <div>
          <Link className="admin-back-link" href="/">← В магазин</Link>
          <p className="tea-category-label">
            {role === "SUPER_ADMIN"
              ? "СУПЕР-АДМИНИСТРАТОР"
              : role === "ADMIN"
                ? "АДМИНИСТРАТОР"
                : "МЕНЕДЖЕР"}
          </p>
          <h1>Админ-панель</h1>
        </div>
        <button
          type="button"
          className="admin-secondary-button"
          onClick={() => signOut({ redirectTo: "/auth/signin" })}
          disabled={busy}
        >
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
            if (!orderStatesLoaded) void loadOrderStates();
          }}
        >
          Заказы
        </button>
        {canManageUsers && (
          <button
            type="button"
            role="tab"
            id="admin-users-tab"
            aria-controls="admin-users-panel"
            aria-selected={activeTab === "users"}
            className={activeTab === "users" ? "active" : ""}
            onClick={() => setActiveTab("users")}
          >
            Пользователи
          </button>
        )}
      </nav>
      {activeTab === "catalog" ? (
      <div
        className="admin-layout"
        role="tabpanel"
        id="admin-catalog-panel"
        aria-labelledby="admin-catalog-tab"
      >
        <section className="admin-products" ref={productsListRef}>
          <button
            className={`admin-product-row${selectedId === "" ? " selected" : ""}`}
            type="button"
            onClick={startNewTea}
          >
            + Добавить чай
          </button>
          {teas.map((tea, index) => (
            <Fragment key={tea.id}>
              <div
                className={`admin-drop-indicator${dropIndex === index ? " active" : ""}`}
                aria-hidden="true"
              />
              <div
                className={`admin-product-row${selectedId === String(tea.id) ? " selected" : ""}${draggedTeaId === tea.id ? " dragging" : ""}`}
                data-tea-id={tea.id}
              >
                <button
                  type="button"
                  className="admin-drag-handle"
                  aria-label={`Перетащить «${tea.name}» для изменения порядка`}
                  disabled={busy}
                  onPointerDown={(event) => startDraggingTea(event, tea.id)}
                  onPointerMove={moveDraggedTea}
                  onPointerUp={finishDraggingTea}
                  onPointerCancel={cancelDraggingTea}
                >
                  ⠿
                </button>
                <button
                  type="button"
                  disabled={!canEditExistingTeas}
                  onClick={() => selectTea(tea)}
                >
                  {tea.name}
                  <small>{tea.isActive ? "Опубликован" : "Скрыт"}</small>
                </button>
                {canEditExistingTeas && (
                  <button
                    type="button"
                    className="admin-visibility-button"
                    aria-label={tea.isActive ? "Скрыть чай" : "Опубликовать чай"}
                    disabled={busy}
                    onClick={() => toggleTea(tea)}
                  >
                    {tea.isActive ? "Скрыть" : "Показать"}
                  </button>
                )}
              </div>
            </Fragment>
          ))}
          <div
            className={`admin-drop-indicator${dropIndex === teas.length ? " active" : ""}`}
            aria-hidden="true"
          />
        </section>
        <form className="admin-editor" onSubmit={saveTea}>
          <h2>{editing ? "Редактировать чай" : "Новый чай"}</h2>
          <div className="admin-fields-grid">
            <label>
              Категория
              <select
                value={creatingCategory ? "__new__" : draft.type}
                onChange={(event) => {
                  if (event.target.value === "__new__") {
                    setCreatingCategory(true);
                    setDraft((current) => ({ ...current, type: "" }));
                    return;
                  }
                  setCreatingCategory(false);
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value,
                  }));
                }}
                required
              >
                <option value="" disabled>
                  Выберите категорию
                </option>
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
                <option value="__new__">+ Создать категорию</option>
              </select>
              {creatingCategory && (
                <input
                  autoFocus
                  maxLength={100}
                  placeholder="Название новой категории"
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  required
                />
              )}
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
                placeholder="Название или код"
                role="combobox"
                aria-autocomplete="list"
                aria-describedby="moysklad-search-hint"
                aria-controls="moysklad-product-suggestions"
                aria-expanded={moyskladProducts.length > 0}
                autoComplete="off"
              />
            </label>
            <p id="moysklad-search-hint">
              Начните вводить название или код — покажу подходящие товары.
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
                <div className="admin-media-item" key={image.url}>
                  <button
                    type="button"
                    className="admin-media-image"
                    disabled={draft.images.some((item) => item.url === image.url)}
                    onClick={() => addImageFromLibrary(image)}
                  >
                    <span><Image src={image.url} alt={image.alt} fill sizes="100px" /></span>
                    {draft.images.some((item) => item.url === image.url) ? "Уже выбрано" : "Добавить"}
                  </button>
                  {canDeleteOrders && image.uploaded && (
                    <button
                      type="button"
                      className="admin-media-delete"
                      disabled={
                        busy ||
                        image.inUse ||
                        draft.images.some((item) => item.url === image.url)
                      }
                      title={
                        image.inUse
                          ? "Сначала удалите фотографию из карточек товаров."
                          : draft.images.some((item) => item.url === image.url)
                            ? "Сначала уберите фотографию из текущего товара."
                            : "Удалить загруженный файл"
                      }
                      onClick={() => void deleteLibraryImage(image)}
                    >
                      {image.inUse
                        ? "Используется в каталоге"
                        : draft.images.some((item) => item.url === image.url)
                          ? "Выбрано в товаре"
                          : "Удалить файл"}
                    </button>
                  )}
                </div>
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
          {editing && (
            <button
              className="admin-delete-button"
              type="button"
              onClick={() => setTeaPendingDeletion(
                teas.find((item) => item.id === Number(selectedId)) ?? null,
              )}
              disabled={busy}
            >
              Удалить товар
            </button>
          )}
        </form>
      </div>
      ) : activeTab === "orders" ? (
        <section
          className="admin-orders"
          role="tabpanel"
          id="admin-orders-panel"
          aria-labelledby="admin-orders-tab"
        >
          <div className="admin-orders-heading">
            <div>
              <h2>Заказы</h2>
              <p>
                При оплате товар остаётся зарезервированным до отгрузки. При
                отмене резерв снимается и товар возвращается в доступный
                остаток МойСклад. Всего заказов: {ordersTotal}.
              </p>
            </div>
            <button
              type="button"
              className="admin-secondary-button"
              onClick={() => {
                void loadOrders();
                void loadOrderStates();
              }}
              disabled={ordersLoading || orderActionBusyId !== ""}
            >
              {ordersLoading ? "Загружаем…" : "Обновить"}
            </button>
          </div>
          {ordersError && <p className="admin-error" role="alert">{ordersError}</p>}
          {ordersNotice && <p role="status">{ordersNotice}</p>}
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
                        : order.status === "PAID"
                          ? "Оплата подтверждена"
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
                  {order.status === "PENDING" && order.moyskladOrderId && (
                    <div className="admin-order-actions">
                      <label>
                        Статус МойСклад после оплаты
                        <select
                          value={orderStateById[order.id]?.paid ?? ""}
                          onChange={(event) =>
                            setOrderStateById((current) => ({
                              ...current,
                              [order.id]: {
                                ...current[order.id],
                                paid: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Выберите статус</option>
                          {orderStates
                            .filter((state) => state.stateType === "Regular")
                            .map((state) => (
                            <option value={state.id} key={state.id}>
                              {state.name}
                            </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Статус МойСклад при отмене
                        <select
                          value={orderStateById[order.id]?.rejected ?? ""}
                          onChange={(event) =>
                            setOrderStateById((current) => ({
                              ...current,
                              [order.id]: {
                                ...current[order.id],
                                rejected: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Выберите статус</option>
                          {orderStates
                            .filter((state) => state.stateType === "Unsuccessful")
                            .map((state) => (
                            <option value={state.id} key={state.id}>
                              {state.name}
                            </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="admin-save-button"
                        onClick={() => requestOrderStatus(order, "paid")}
                        disabled={
                          orderActionBusyId !== "" ||
                          !orderStateById[order.id]?.paid ||
                          !orderStatesLoaded
                        }
                      >
                        {orderActionBusyId === order.id
                          ? "Сохраняем…"
                          : "Подтвердить оплату"}
                      </button>
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => requestOrderStatus(order, "rejected")}
                        disabled={
                          orderActionBusyId !== "" ||
                          !orderStateById[order.id]?.rejected ||
                          !orderStatesLoaded
                        }
                      >
                        Отклонить заказ
                      </button>
                    </div>
                  )}
                  {canDeleteOrders && (
                    <button
                      type="button"
                      className="admin-delete-button"
                      onClick={() => requestDeleteOrder(order)}
                      disabled={orderActionBusyId !== ""}
                    >
                      Удалить локальный журнал заказа
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {ordersTotalPages > 1 && (
            <nav className="admin-orders-pagination" aria-label="Страницы заказов">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => void loadOrders(ordersPage - 1)}
                disabled={ordersLoading || ordersPage <= 1}
              >
                ← Новее
              </button>
              <span>
                Страница {ordersPage} из {ordersTotalPages}
              </span>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => void loadOrders(ordersPage + 1)}
                disabled={ordersLoading || ordersPage >= ordersTotalPages}
              >
                Старее →
              </button>
            </nav>
          )}
        </section>
      ) : (
        <AdminUsersPanel role={role} currentUserId={currentUserId} />
      )}
      {teaPendingDeletion && (
        <div
          className="admin-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setTeaPendingDeletion(null);
            }
          }}
        >
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-tea-title"
            aria-describedby="delete-tea-description"
          >
            <p className="tea-category-label">УДАЛЕНИЕ ТОВАРА</p>
            <h2 id="delete-tea-title">Удалить чай из каталога?</h2>
            <p id="delete-tea-description">
              Вы уверены, что хотите удалить «{teaPendingDeletion.name}»?
              Действие нельзя отменить. История заказов и фотографии сохранятся.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => setTeaPendingDeletion(null)}
                disabled={busy}
                autoFocus
              >
                Отмена
              </button>
              <button
                type="button"
                className="admin-confirm-delete-button"
                onClick={() => void deleteTea(teaPendingDeletion)}
                disabled={busy}
              >
                {busy ? "Удаление…" : "Да, удалить"}
              </button>
            </div>
          </section>
        </div>
      )}
      {pendingOrderAction && (
        <div
          className="admin-confirm-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !orderActionBusyId
            ) {
              setPendingOrderAction(null);
              setOrdersError("");
            }
          }}
        >
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="order-action-title"
            aria-describedby="order-action-description"
          >
            <p className="tea-category-label">
              {pendingOrderAction.action === "delete"
                ? "УДАЛЕНИЕ ЗАПИСИ"
                : pendingOrderAction.action === "paid"
                  ? "ПОДТВЕРЖДЕНИЕ ОПЛАТЫ"
                  : "ОТМЕНА ЗАКАЗА"}
            </p>
            <h2 id="order-action-title">
              {pendingOrderAction.action === "delete"
                ? "Удалить запись заказа?"
                : pendingOrderAction.action === "paid"
                  ? "Подтвердить оплату заказа?"
                  : "Отклонить заказ?"}
            </h2>
            <p id="order-action-description">
              {pendingOrderAction.action === "delete" ? (
                <>
                  Запись заказа №
                  {pendingOrderAction.order.id.slice(-8).toUpperCase()} будет
                  удалена из базы сайта. Документ МойСклад и складские остатки
                  не изменятся. Действие нельзя отменить.
                </>
              ) : pendingOrderAction.action === "paid" ? (
                <>
                  Подтвердить оплату заказа №
                  {pendingOrderAction.order.id.slice(-8).toUpperCase()} и
                  установить в МойСклад статус «
                  {pendingOrderAction.stateName}»? Товар останется в резерве до
                  отгрузки.
                </>
              ) : (
                <>
                  Отклонить заказ №
                  {pendingOrderAction.order.id.slice(-8).toUpperCase()}, снять
                  резерв и установить в МойСклад статус «
                  {pendingOrderAction.stateName}»? Товар вернётся в доступный
                  остаток.
                </>
              )}
            </p>
            {ordersError && (
              <p className="admin-error" role="alert">
                {ordersError}
              </p>
            )}
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  setPendingOrderAction(null);
                  setOrdersError("");
                }}
                disabled={orderActionBusyId !== ""}
                autoFocus
              >
                Отмена
              </button>
              <button
                type="button"
                className={
                  pendingOrderAction.action === "paid"
                    ? "admin-confirm-primary-button"
                    : "admin-confirm-delete-button"
                }
                onClick={confirmOrderAction}
                disabled={orderActionBusyId !== ""}
              >
                {orderActionBusyId
                  ? "Выполняем…"
                  : pendingOrderAction.action === "delete"
                    ? "Да, удалить"
                    : pendingOrderAction.action === "paid"
                      ? "Да, подтвердить"
                      : "Да, отклонить"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
