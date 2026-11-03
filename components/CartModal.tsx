"use client";

import Image from "next/image";
import type { Tea } from "@/data/teas";
import type { CartLine } from "@/components/types";
import { discountedPrice, formatPrice, getTeaImages } from "@/components/TeaCard";

type CartModalProps = {
  open: boolean;
  cart: CartLine[];
  teas: Tea[];
  onClose: () => void;
  onOpenTea: (tea: Tea) => void;
  onQuantityChange: (id: number, quantity: number) => void;
};

function pluralize(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}

export default function CartModal({
  open,
  cart,
  teas,
  onClose,
  onOpenTea,
  onQuantityChange,
}: CartModalProps) {
  const lines = cart.flatMap((line) => {
    const tea = teas.find((item) => item.id === line.id);
    return tea ? [{ ...line, tea }] : [];
  });
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce(
    (sum, line) => sum + discountedPrice(line.tea) * line.quantity,
    0,
  );
  const originalTotal = lines.reduce(
    (sum, line) => sum + Number(line.tea.price) * line.quantity,
    0,
  );
  const hasDiscount = lines.some((line) => line.tea.discountPercent > 0);

  function checkout() {
    if (!lines.length) return;
    const message = [
      "Здравствуйте! Хочу оформить заказ:",
      "",
      ...lines.map(
        ({ tea, quantity }, index) =>
          `${index + 1}. ${tea.name} — ${quantity} шт. × ${formatPrice(discountedPrice(tea))} ${tea.unit} = ${formatPrice(discountedPrice(tea) * quantity)} ₽`,
      ),
    ].join("\n");
    window.open(
      `https://t.me/mf_administration?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div
      className={`cart-modal-overlay${open ? " active" : ""}`}
      aria-hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="cart-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        <button
          type="button"
          className="cart-modal-close"
          aria-label="Закрыть корзину"
          onClick={onClose}
          tabIndex={open ? 0 : -1}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="cart-header">
          <h2 id="cart-title">Корзина</h2>
          <div className="cart-header-subtitle">
            {itemCount} {pluralize(itemCount)}
          </div>
        </div>
        <div className="cart-items-list">
          {lines.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M6.5 8.5h11l-1.1 8.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 8.5Z" />
                  <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" />
                </svg>
              </div>
              <div className="cart-empty-title">Корзина пуста</div>
              <div className="cart-empty-subtitle">
                Откройте каталог и добавьте чай
              </div>
            </div>
          ) : (
            lines.map(({ tea, quantity }) => (
              <div className="cart-item" key={tea.id}>
                <div className="cart-item-image">
                  <Image
                    src={getTeaImages(tea)[0]}
                    alt=""
                    fill
                    sizes="70px"
                  />
                </div>
                <div className="cart-item-info">
                  <button
                    type="button"
                    className="cart-item-name cart-item-link"
                    onClick={() => onOpenTea(tea)}
                  >
                    {tea.name}
                  </button>
                  <div className="cart-item-price-row">
                    {tea.discountPercent > 0 && (
                      <span className="cart-item-price sale-original-price">
                        {formatPrice(Number(tea.price) * quantity)} ₽
                      </span>
                    )}
                    <span className="cart-item-sale-price">
                      {formatPrice(discountedPrice(tea) * quantity)} ₽
                    </span>
                  </div>
                </div>
                <div className="cart-item-controls">
                  <button
                    type="button"
                    className="cart-qty-btn"
                    aria-label={`Уменьшить количество «${tea.name}»`}
                    onClick={() => onQuantityChange(tea.id, quantity - 1)}
                  >
                    −
                  </button>
                  <span className="cart-qty-display">{quantity}</span>
                  <button
                    type="button"
                    className="cart-qty-btn"
                    aria-label={`Увеличить количество «${tea.name}»`}
                    onClick={() => onQuantityChange(tea.id, quantity + 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="cart-item-remove"
                    aria-label={`Удалить «${tea.name}» из корзины`}
                    onClick={() => onQuantityChange(tea.id, 0)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span>Количество товаров</span>
            <span>{itemCount}</span>
          </div>
          <div className="cart-total-amount">
            <span className="label">Итого</span>
            {itemCount > 0 && hasDiscount && (
              <span className="old-value sale-original-price">
                {formatPrice(originalTotal)} ₽
              </span>
            )}
            <span className="value sale-value">{formatPrice(total)} ₽</span>
          </div>
          <button
            type="button"
            className="cart-checkout-btn"
            disabled={lines.length === 0}
            onClick={checkout}
          >
            Оформить заказ
          </button>
        </div>
      </section>
    </div>
  );
}
