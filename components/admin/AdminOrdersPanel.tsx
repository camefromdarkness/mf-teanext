"use client";

import type { Dispatch, SetStateAction } from "react";
import type {
  AdminOrder,
  MoyskladOrderState,
} from "@/components/admin/types";

type Props = {
  orders: AdminOrder[];
  ordersTotal: number;
  ordersLoading: boolean;
  ordersLoaded: boolean;
  ordersError: string;
  ordersNotice: string;
  ordersPage: number;
  ordersTotalPages: number;
  orderStates: MoyskladOrderState[];
  orderStatesLoaded: boolean;
  orderActionBusyId: string;
  orderStateById: Record<string, { paid?: string; rejected?: string }>;
  canDeleteOrders: boolean;
  loadOrders: (page?: number) => Promise<void>;
  loadOrderStates: () => Promise<void>;
  setOrderStateById: Dispatch<
    SetStateAction<Record<string, { paid?: string; rejected?: string }>>
  >;
  requestOrderStatus: (
    order: AdminOrder,
    action: "paid" | "rejected",
  ) => void;
  requestDeleteOrder: (order: AdminOrder) => void;
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
export default function AdminOrdersPanel(props: Props) {
  const {
    orders,
    ordersTotal,
    ordersLoading,
    ordersLoaded,
    ordersError,
    ordersNotice,
    ordersPage,
    ordersTotalPages,
    orderStates,
    orderStatesLoaded,
    orderActionBusyId,
    orderStateById,
    canDeleteOrders,
    loadOrders,
    loadOrderStates,
    setOrderStateById,
    requestOrderStatus,
    requestDeleteOrder,
  } = props;
  return (
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
  );
}
