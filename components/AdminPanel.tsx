"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import AdminUsersPanel from "@/components/AdminUsersPanel";
import AdminActionDialogs from "@/components/admin/AdminActionDialogs";
import AdminOrdersPanel from "@/components/admin/AdminOrdersPanel";
import AdminTeaEditor from "@/components/admin/AdminTeaEditor";
import AdminTeaList from "@/components/admin/AdminTeaList";
import { readResponseError } from "@/components/admin/admin-utils";
import useAdminCatalog from "@/components/admin/useAdminCatalog";
import {
  type AdminOrder,
  type AdminTea,
  type MoyskladOrderState,
  type PendingOrderAction,
  type StaffRole,
} from "@/components/admin/types";

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

export default function AdminPanel({
  role,
  currentUserId,
  initialTeas,
}: {
  role: StaffRole;
  currentUserId: string;
  initialTeas: AdminTea[];
}) {
  const canEditExistingTeas = true;
  const canManageUsers = role !== "MANAGER";
  const canDeleteOrders = role !== "MANAGER";
  const catalog = useAdminCatalog(initialTeas);
  const {
    teas,
    selectedId,
    draft,
    setDraft,
    creatingCategory,
    setCreatingCategory,
    detailsText,
    setDetailsText,
    busy,
    error,
    mediaImages,
    mediaOpen,
    moyskladSearch,
    setMoyskladSearch,
    moyskladProducts,
    setMoyskladProducts,
    moyskladSearchBusy,
    setMoyskladSearchBusy,
    moyskladSearchError,
    setMoyskladSearchError,
    selectedMoyskladProduct,
    draggedTeaId,
    dropIndex,
    productsListRef,
    teaPendingDeletion,
    setTeaPendingDeletion,
    categories,
    uploadImage,
    saveTea,
    selectMoyskladItem,
    clearMoyskladItem,
    toggleTea,
    deleteTea,
    startDraggingTea,
    moveDraggedTea,
    finishDraggingTea,
    cancelDraggingTea,
    startNewTea,
    selectTea,
    openImageLibrary,
    addImageFromLibrary,
    deleteLibraryImage,
  } = catalog;
  const [activeTab, setActiveTab] = useState<"catalog" | "orders" | "users">(
    "catalog",
  );
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

  async function loadOrders(page = ordersPage) {
    setOrdersLoading(true);
    setOrdersError("");
    setOrdersNotice("");
    try {
      const response = await fetch(`/api/admin/orders?page=${page}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setOrdersError(await readResponseError(response));
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
      if (!response.ok) throw new Error(await readResponseError(response));
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
        setOrdersError(await readResponseError(response));
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
        setOrdersError(await readResponseError(response));
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
        <AdminTeaList
          teas={teas}
          selectedId={selectedId}
          busy={busy}
          canEditExistingTeas={canEditExistingTeas}
          draggedTeaId={draggedTeaId}
          dropIndex={dropIndex}
          productsListRef={productsListRef}
          startNewTea={startNewTea}
          selectTea={selectTea}
          toggleTea={toggleTea}
          startDraggingTea={startDraggingTea}
          moveDraggedTea={moveDraggedTea}
          finishDraggingTea={finishDraggingTea}
          cancelDraggingTea={cancelDraggingTea}
        />
        <AdminTeaEditor
          teas={teas}
          selectedId={selectedId}
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          creatingCategory={creatingCategory}
          setCreatingCategory={setCreatingCategory}
          detailsText={detailsText}
          setDetailsText={setDetailsText}
          busy={busy}
          canDeleteImages={true}
          canDeleteTea={canDeleteOrders}
          mediaImages={mediaImages}
          mediaOpen={mediaOpen}
          moyskladSearch={moyskladSearch}
          onMoyskladSearchChange={(value) => {
            setMoyskladSearch(value);
            setMoyskladProducts([]);
            setMoyskladSearchBusy(value.trim().length >= 2);
            setMoyskladSearchError("");
          }}
          moyskladProducts={moyskladProducts}
          moyskladSearchBusy={moyskladSearchBusy}
          moyskladSearchError={moyskladSearchError}
          selectedMoyskladProduct={selectedMoyskladProduct}
          saveTea={saveTea}
          selectMoyskladItem={selectMoyskladItem}
          clearMoyskladItem={clearMoyskladItem}
          openImageLibrary={openImageLibrary}
          uploadImage={uploadImage}
          addImageFromLibrary={addImageFromLibrary}
          deleteLibraryImage={deleteLibraryImage}
          requestDeleteTea={(tea) => setTeaPendingDeletion(tea)}
        />
      </div>
      ) : activeTab === "orders" ? (
        <AdminOrdersPanel
          orders={orders} ordersTotal={ordersTotal} ordersLoading={ordersLoading} ordersLoaded={ordersLoaded}
          ordersError={ordersError} ordersNotice={ordersNotice} ordersPage={ordersPage} ordersTotalPages={ordersTotalPages}
          orderStates={orderStates} orderStatesLoaded={orderStatesLoaded} orderActionBusyId={orderActionBusyId}
          orderStateById={orderStateById} canDeleteOrders={canDeleteOrders} loadOrders={loadOrders}
          loadOrderStates={loadOrderStates} setOrderStateById={setOrderStateById}
          requestOrderStatus={requestOrderStatus} requestDeleteOrder={requestDeleteOrder}
        />
      ) : (
        <AdminUsersPanel role={role} currentUserId={currentUserId} />
      )}
      <AdminActionDialogs
        tea={teaPendingDeletion}
        teaBusy={busy}
        onCancelTea={() => setTeaPendingDeletion(null)}
        onConfirmTea={() => {
          if (teaPendingDeletion) void deleteTea(teaPendingDeletion);
        }}
        orderAction={pendingOrderAction}
        orderActionBusy={orderActionBusyId !== ""}
        orderError={ordersError}
        onCancelOrder={() => {
          setPendingOrderAction(null);
          setOrdersError("");
        }}
        onConfirmOrder={confirmOrderAction}
      />
    </main>
  );
}
