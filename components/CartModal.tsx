"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  onOrderCreated: () => void;
};

type CheckoutProfile = {
  name: string | null;
  phoneNumber: string | null;
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
  onOrderCreated,
}: CartModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<CheckoutProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<
    "idle" | "loading" | "ready" | "unauthenticated" | "error"
  >("idle");
  const [profileRetry, setProfileRetry] = useState(0);
  const checkoutKey = useRef<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<{
    message: string;
    href?: string;
    linkLabel?: string;
    success?: boolean;
  } | null>(null);
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
  const hasUnavailableQuantity = lines.some(
    ({ tea, quantity }) =>
      tea.availableStock === null ||
      tea.availableStock === undefined ||
      quantity > Math.max(0, Math.floor(tea.availableStock)),
  );

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    fetch("/api/account/profile", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 401) {
          setProfile(null);
          setProfileStatus("unauthenticated");
          return;
        }
        if (!response.ok) {
          throw new Error("Не удалось загрузить контактные данные.");
        }
        const result: unknown = await response.json();
        if (
          typeof result !== "object" ||
          result === null ||
          !("name" in result) ||
          !(typeof result.name === "string" || result.name === null) ||
          !("phoneNumber" in result) ||
          !(typeof result.phoneNumber === "string" || result.phoneNumber === null)
        ) {
          throw new Error("Сервер вернул некорректные данные профиля.");
        }
        setProfile({ name: result.name, phoneNumber: result.phoneNumber });
        setProfileStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Не удалось загрузить телефон для оформления заказа.", error);
        setProfileStatus("error");
      });

    return () => controller.abort();
  }, [open, profileRetry]);

  useEffect(() => {
    checkoutKey.current = null;
  }, [cart]);

  useEffect(() => {
    const telegramUrl = checkoutState?.success ? checkoutState.href : undefined;
    if (!telegramUrl) return;

    const redirectTimer = window.setTimeout(() => {
      window.location.assign(telegramUrl);
    }, 1800);

    return () => window.clearTimeout(redirectTimer);
  }, [checkoutState]);

  function close() {
    setCheckoutState(null);
    onClose();
  }

  async function checkout() {
    if (!lines.length || profileStatus !== "ready" || !profile?.phoneNumber) return;
    setSubmitting(true);
    setCheckoutState(null);
    try {
      checkoutKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutKey: checkoutKey.current,
          items: lines.map(({ tea, quantity }) => ({
            id: tea.id,
            quantity,
          })),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const errorMessage =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Не удалось создать заказ.";
        const code =
          typeof result === "object" &&
          result !== null &&
          "code" in result &&
          typeof result.code === "string"
            ? result.code
            : "";
        setCheckoutState({
          message: errorMessage,
          ...(code === "AUTH_REQUIRED"
            ? {
                href: "/auth/signin?callbackUrl=%2F",
                linkLabel: "Войти в аккаунт",
              }
            : code === "PROFILE_REQUIRED"
              ? { href: "/account", linkLabel: "Добавить телефон в профиле" }
              : {}),
        });
        return;
      }

      if (
        typeof result !== "object" ||
        result === null ||
        !("orderId" in result) ||
        typeof result.orderId !== "string" ||
        !("name" in result) ||
        !(typeof result.name === "string" || result.name === null) ||
        !("phoneNumber" in result) ||
        typeof result.phoneNumber !== "string" ||
        !("total" in result) ||
        typeof result.total !== "number" ||
        !("items" in result) ||
        !Array.isArray(result.items)
      ) {
        throw new Error("Сервер вернул некорректные данные заказа.");
      }

      const message = [
        `Здравствуйте! Хочу подтвердить заказ №${result.orderId.slice(-8).toUpperCase()}.`,
        `Имя: ${result.name ?? "не указано"}`,
        `Телефон: ${result.phoneNumber}`,
        "",
        ...result.items.map((item, index) => {
          if (
            typeof item !== "object" ||
            item === null ||
            !("name" in item) ||
            typeof item.name !== "string" ||
            !("quantity" in item) ||
            typeof item.quantity !== "number" ||
            !("unitPrice" in item) ||
            typeof item.unitPrice !== "number" ||
            !("unit" in item) ||
            typeof item.unit !== "string"
          ) {
            throw new Error("Сервер вернул некорректный состав заказа.");
          }
          const itemTotal = item.unitPrice * item.quantity;
          return `${index + 1}. ${item.name} — ${item.quantity} шт. × ${formatPrice(item.unitPrice)} ₽ ${item.unit} = ${formatPrice(itemTotal)} ₽`;
        }),
        "",
        `Итого: ${formatPrice(result.total)} ₽`,
      ].join("\n");
      const telegramUrl = `https://t.me/mf_administration?text=${encodeURIComponent(message)}`;
      checkoutKey.current = null;
      setCheckoutState({
        message: `Заказ WEB-${result.orderId.slice(-8).toUpperCase()} на ${formatPrice(result.total)} ₽ создан в МойСклад. Через пару секунд откроется Telegram для подтверждения заказа.`,
        href: telegramUrl,
        linkLabel: "Перейти в Telegram и отправить заказ",
        success: true,
      });
      onOrderCreated();
    } catch (error) {
      console.error("Не удалось оформить заказ.", error);
      setCheckoutState({
        message: "Не удалось оформить заказ. Проверьте соединение и попробуйте ещё раз.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`cart-modal-overlay${open ? " active" : ""}`}
      aria-hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
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
          onClick={close}
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
                    disabled={
                      tea.availableStock === null ||
                      tea.availableStock === undefined ||
                      quantity >= Math.max(0, Math.floor(tea.availableStock))
                    }
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
          {(profileStatus === "idle" || profileStatus === "loading") && (
            <p className="cart-profile-message" role="status">
              Загружаем контактные данные…
            </p>
          )}
          {profileStatus === "unauthenticated" && (
            <div className="cart-profile-message">
              <p>Чтобы оформить заказ, войдите через соцсеть.</p>
              <Link href="/auth/signin?callbackUrl=%2F">Войти в аккаунт</Link>
            </div>
          )}
          {profileStatus === "error" && (
            <div className="cart-profile-message" role="alert">
              <p>Не удалось загрузить данные профиля.</p>
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  setProfileStatus("loading");
                  setProfileRetry((attempt) => attempt + 1);
                }}
              >
                Повторить
              </button>
            </div>
          )}
          {profileStatus === "ready" && profile && (
            <div className="cart-profile-fields">
              {profile.phoneNumber ? (
                <label>
                  Телефон для заказа
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={profile.phoneNumber}
                    readOnly
                  />
                </label>
              ) : (
                <p>
                  Добавьте номер телефона в личном кабинете для оформления
                  заказа.{" "}
                  <Link href="/account">Перейти в личный кабинет</Link>
                </p>
              )}
            </div>
          )}
          {!checkoutState?.success && (
            <>
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
            </>
          )}
          {hasUnavailableQuantity && (
            <p className="cart-stock-warning" role="alert">
              Не удалось подтвердить количество одного или нескольких товаров.
              Уменьшите их количество или повторите попытку позже.
            </p>
          )}
          {!checkoutState?.success && (
            <button
              type="button"
              className="cart-checkout-btn"
              disabled={
                lines.length === 0 ||
                submitting ||
                hasUnavailableQuantity ||
                profileStatus !== "ready" ||
                !profile?.phoneNumber
              }
              onClick={checkout}
            >
              {submitting ? "Оформляем…" : "Оформить заказ"}
            </button>
          )}
          {checkoutState && (
            <div className="cart-checkout-result" role="status">
              <p>{checkoutState.message}</p>
              {checkoutState.href &&
                (checkoutState.href.startsWith("https://") ? (
                  <a
                    href={checkoutState.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {checkoutState.linkLabel}
                  </a>
                ) : (
                  <Link href={checkoutState.href}>{checkoutState.linkLabel}</Link>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
