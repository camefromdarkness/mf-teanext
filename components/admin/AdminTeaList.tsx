"use client";

import { Fragment, type PointerEvent, type RefObject } from "react";
import type { AdminTea } from "@/components/admin/types";

type Props = {
  teas: AdminTea[];
  selectedId: string;
  busy: boolean;
  canEditExistingTeas: boolean;
  draggedTeaId: number | null;
  dropIndex: number | null;
  productsListRef: RefObject<HTMLElement | null>;
  startNewTea: () => void;
  selectTea: (tea: AdminTea) => void;
  toggleTea: (tea: AdminTea) => void;
  startDraggingTea: (
    event: PointerEvent<HTMLButtonElement>,
    teaId: number,
  ) => void;
  moveDraggedTea: (event: PointerEvent<HTMLButtonElement>) => void;
  finishDraggingTea: (event: PointerEvent<HTMLButtonElement>) => void;
  cancelDraggingTea: (event: PointerEvent<HTMLButtonElement>) => void;
};

export default function AdminTeaList({
  teas,
  selectedId,
  busy,
  canEditExistingTeas,
  draggedTeaId,
  dropIndex,
  productsListRef,
  startNewTea,
  selectTea,
  toggleTea,
  startDraggingTea,
  moveDraggedTea,
  finishDraggingTea,
  cancelDraggingTea,
}: Props) {
  return (
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
  );
}
