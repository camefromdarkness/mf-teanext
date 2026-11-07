"use client";

import type { AdminTea, PendingOrderAction } from "@/components/admin/types";

type Props = {
  tea: AdminTea | null;
  teaBusy: boolean;
  onCancelTea: () => void;
  onConfirmTea: () => void;
  orderAction: PendingOrderAction | null;
  orderActionBusy: boolean;
  orderError: string;
  onCancelOrder: () => void;
  onConfirmOrder: () => void;
};

export default function AdminActionDialogs({
  tea,
  teaBusy,
  onCancelTea,
  onConfirmTea,
  orderAction,
  orderActionBusy,
  orderError,
  onCancelOrder,
  onConfirmOrder,
}: Props) {
  return (
    <>
      {tea && (
        <div
          className="admin-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !teaBusy) {
              onCancelTea();
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
              Вы уверены, что хотите удалить «{tea.name}»? Действие нельзя
              отменить. История заказов и фотографии сохранятся.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={onCancelTea}
                disabled={teaBusy}
                autoFocus
              >
                Отмена
              </button>
              <button
                type="button"
                className="admin-confirm-delete-button"
                onClick={onConfirmTea}
                disabled={teaBusy}
              >
                {teaBusy ? "Удаление…" : "Да, удалить"}
              </button>
            </div>
          </section>
        </div>
      )}
      {orderAction && (
        <div
          className="admin-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !orderActionBusy) {
              onCancelOrder();
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
              {orderAction.action === "delete"
                ? "УДАЛЕНИЕ ЗАПИСИ"
                : orderAction.action === "paid"
                  ? "ПОДТВЕРЖДЕНИЕ ОПЛАТЫ"
                  : "ОТМЕНА ЗАКАЗА"}
            </p>
            <h2 id="order-action-title">
              {orderAction.action === "delete"
                ? "Удалить запись заказа?"
                : orderAction.action === "paid"
                  ? "Подтвердить оплату заказа?"
                  : "Отклонить заказ?"}
            </h2>
            <p id="order-action-description">
              {orderAction.action === "delete" ? (
                <>
                  Запись заказа №
                  {orderAction.order.id.slice(-8).toUpperCase()} будет удалена
                  из базы сайта. Документ МойСклад и складские остатки не
                  изменятся. Действие нельзя отменить.
                </>
              ) : orderAction.action === "paid" ? (
                <>
                  Подтвердить оплату заказа №
                  {orderAction.order.id.slice(-8).toUpperCase()} и установить в
                  МойСклад статус «{orderAction.stateName}»? Товар останется в
                  резерве до отгрузки.
                </>
              ) : (
                <>
                  Отклонить заказ №
                  {orderAction.order.id.slice(-8).toUpperCase()}, снять резерв
                  и установить в МойСклад статус «{orderAction.stateName}»?
                  Товар вернётся в доступный остаток.
                </>
              )}
            </p>
            {orderError && (
              <p className="admin-error" role="alert">
                {orderError}
              </p>
            )}
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={onCancelOrder}
                disabled={orderActionBusy}
                autoFocus
              >
                Отмена
              </button>
              <button
                type="button"
                className={
                  orderAction.action === "paid"
                    ? "admin-confirm-primary-button"
                    : "admin-confirm-delete-button"
                }
                onClick={onConfirmOrder}
                disabled={orderActionBusy}
              >
                {orderActionBusy
                  ? "Выполняем…"
                  : orderAction.action === "delete"
                    ? "Да, удалить"
                    : orderAction.action === "paid"
                      ? "Да, подтвердить"
                      : "Да, отклонить"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
