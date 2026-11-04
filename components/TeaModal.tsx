"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import type { Tea } from "@/data/teas";
import { discountedPrice, formatPrice, getTeaImages } from "@/components/TeaCard";

type TeaModalProps = {
  tea: Tea | null;
  slide: number;
  quantity: number;
  onSlideChange: (slide: number) => void;
  onCloseStart: () => void;
  onClose: () => void;
  onAdd: (tea: Tea) => void;
  onDecrease: (tea: Tea) => void;
  onIncrease: (tea: Tea) => void;
};

export default function TeaModal({
  tea,
  slide,
  quantity,
  onSlideChange,
  onCloseStart,
  onClose,
  onAdd,
  onDecrease,
  onIncrease,
}: TeaModalProps) {
  const [active, setActive] = useState(false);
  const modalRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pullingDown = useRef(false);
  const imageTouchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tea) return;

    const frame = requestAnimationFrame(() => setActive(true));
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [tea]);

  const closeModal = useCallback(() => {
    if (closeTimer.current) return;
    onCloseStart();
    setActive(false);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, 550);
  }, [onClose, onCloseStart]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal]);

  if (!tea) return null;

  const images = getTeaImages(tea);
  const availableStock = tea.availableStock;
  const hasStockData =
    typeof availableStock === "number" && Number.isFinite(availableStock);
  const maximumQuantity = hasStockData
    ? Math.max(0, Math.floor(availableStock))
    : 0;
  const isOutOfStock = hasStockData && maximumQuantity === 0;
  const quantityLimitReached = !hasStockData || quantity >= maximumQuantity;
  const nextSlide = (direction: number) => {
    onSlideChange((slide + direction + images.length) % images.length);
  };

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const modal = modalRef.current;
    if (!modal || modal.scrollTop > 5) {
      touchStart.current = null;
      return;
    }

    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    pullingDown.current = false;
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    const modal = modalRef.current;
    const start = touchStart.current;
    if (!modal || !start || modal.scrollTop > 5) return;

    const touch = event.touches[0];
    const deltaY = touch.clientY - start.y;
    const deltaX = touch.clientX - start.x;
    if (deltaY <= 10 || Math.abs(deltaY) <= Math.abs(deltaX)) return;

    pullingDown.current = true;
    modal.style.transition = "none";
    modal.style.transform = `translateY(${deltaY}px)`;
    modal.style.opacity = String(Math.max(0.3, 1 - deltaY / 400));
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const modal = modalRef.current;
    const start = touchStart.current;
    touchStart.current = null;
    if (!modal || !start || !pullingDown.current) return;

    const deltaY = event.changedTouches[0].clientY - start.y;
    pullingDown.current = false;
    modal.style.transition = "";

    if (deltaY > 120) {
      onCloseStart();
      setActive(false);
      modal.style.transform = `translateY(${window.innerHeight}px)`;
      modal.style.opacity = "0";
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        onClose();
      }, 550);
      return;
    }

    modal.style.transform = "";
    modal.style.opacity = "";
  }

  return (
    <div
      className={`modal-overlay${active ? " active" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={modalRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="Закрыть карточку чая"
          onClick={closeModal}
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
        <div
          className={`slider-strip${isOutOfStock ? " out-of-stock" : ""}`}
          onClick={(event) => {
            if (
              images.length < 2 ||
              (event.target instanceof Element && event.target.closest("button"))
            ) {
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = (event.clientX - bounds.left) / bounds.width;
            if (position <= 0.25) nextSlide(-1);
            else if (position >= 0.75) nextSlide(1);
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            imageTouchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = imageTouchStart.current;
            imageTouchStart.current = null;
            if (!start || images.length < 2) return;
            const touch = event.changedTouches[0];
            const deltaX = touch.clientX - start.x;
            const deltaY = touch.clientY - start.y;
            if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
              nextSlide(deltaX > 0 ? -1 : 1);
            }
          }}
        >
          {isOutOfStock && (
            <span className="stock-status-badge">Нет в наличии</span>
          )}
          <div
            className="slider-track"
            style={{ transform: `translateX(-${slide * 100}%)` }}
          >
            {images.map((image, index) => (
              <div
                className="slider-slide"
                role="img"
                aria-label={`${tea.name}, фото ${index + 1}`}
                style={{ backgroundImage: `url("${image}")` }}
                key={image}
              />
            ))}
          </div>
          {images.length > 1 && (
            <div className="slider-dots">
              {images.map((image, index) => (
                <button
                  type="button"
                  className={`dot${slide === index ? " active" : ""}`}
                  aria-label={`Фото ${index + 1}`}
                  aria-current={slide === index ? "true" : undefined}
                  onClick={() => onSlideChange(index)}
                  key={image}
                />
              ))}
            </div>
          )}
        </div>
        <div className="modal-header">
          <p className="tea-category-label">{tea.type}</p>
          <h2 id="modal-title">{tea.name}</h2>
          <div className="modal-price">
            {tea.discountPercent > 0 && (
              <span className="modal-price-old sale-original-price">
                {formatPrice(tea.price)} {tea.unit}
              </span>
            )}
            <span className="modal-price-current">
              <span>{formatPrice(discountedPrice(tea))}</span>
              <span className="unit">{tea.unit}</span>
            </span>
          </div>
        </div>
        <div className="modal-content">
          <p className="description">{tea.description}</p>
          <div className="details">
            <h4>Характеристики</h4>
            <ul>
              {tea.details.map(([label, value]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          </div>
          {quantity === 0 ? (
            <button
              type="button"
              className={`add-to-cart-btn${isOutOfStock ? " out-of-stock" : ""}`}
              disabled={!hasStockData || isOutOfStock}
              onClick={() => onAdd(tea)}
            >
              {isOutOfStock
                ? "Нет в наличии"
                : !hasStockData
                  ? "Остаток не проверен"
                  : "Добавить в корзину"}
            </button>
          ) : (
            <div className="cart-quantity-control active">
              <button
                type="button"
                aria-label="Уменьшить количество"
                onClick={() => onDecrease(tea)}
              >
                −
              </button>
              <span className="cart-quantity-value">{quantity}</span>
              <button
                type="button"
                aria-label="Увеличить количество"
                disabled={quantityLimitReached}
                onClick={() => onIncrease(tea)}
              >
                +
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
