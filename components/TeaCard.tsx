import Image from "next/image";
import type { Tea } from "@/data/teas";

type TeaCardProps = {
  tea: Tea;
  quantity: number;
  priority?: boolean;
  animationDelay?: string;
  onOpen: (tea: Tea) => void;
  onAdd: (tea: Tea) => void;
  onDecrease: (tea: Tea) => void;
  onIncrease: (tea: Tea) => void;
};

export function getTeaImages(tea: Tea) {
  const gallery = tea.images
    .filter((image) => image.showInGallery)
    .map((image) => image.url);
  const cover = tea.images.find((image) => image.isCover)?.url;
  return gallery.length
    ? gallery
    : cover
      ? [cover]
      : tea.images.slice(0, 1).map((image) => image.url);
}

export function discountedPrice(tea: Tea) {
  return Math.round(Number(tea.price) * (1 - tea.discountPercent / 100));
}

export function formatPrice(price: number | string) {
  return Number(price).toLocaleString("ru-RU");
}

export default function TeaCard({
  tea,
  quantity,
  priority = false,
  animationDelay,
  onOpen,
  onAdd,
  onDecrease,
  onIncrease,
}: TeaCardProps) {
  const availableStock = tea.availableStock;
  const hasStockData =
    typeof availableStock === "number" && Number.isFinite(availableStock);
  const maximumQuantity = hasStockData
    ? Math.max(0, Math.floor(availableStock))
    : 0;
  const isOutOfStock = hasStockData && maximumQuantity === 0;
  const quantityLimitReached = !hasStockData || quantity >= maximumQuantity;

  return (
    <article
      className={`product-card${isOutOfStock ? " out-of-stock" : ""}`}
      onClick={() => onOpen(tea)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(tea);
        }
      }}
      tabIndex={0}
      aria-label={`Подробнее о чае: ${tea.name}`}
      style={{ animationDelay }}
    >
      <div className="image-wrapper">
        <Image
          src={
            tea.images.find((image) => image.isCover)?.url ??
            tea.images[0]?.url ??
            "/logo.png"
          }
          alt={tea.name}
          fill
          sizes="(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 25vw"
          loading={priority ? "eager" : "lazy"}
        />
        {tea.discountPercent > 0 && (
          <span className="discount-badge">−{tea.discountPercent}%</span>
        )}
        {isOutOfStock && (
          <span className="stock-status-badge">Нет в наличии</span>
        )}
      </div>
      <div className="product-info">
        <h3>{tea.name}</h3>
        <p className="short-desc">{tea.shortDesc}</p>
        <div className="product-bottom">
          <div className="price">
            {tea.discountPercent > 0 && (
              <span className="price-old sale-original-price">
                {formatPrice(tea.price)}
                <span className="unit">{tea.unit}</span>
              </span>
            )}
            <span className="price-current">
              {formatPrice(discountedPrice(tea))}
              <span className="unit">{tea.unit}</span>
            </span>
          </div>
          <div
            className={`qty-control${quantity > 0 ? " in-cart" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="quick-add-btn"
              aria-label={
                isOutOfStock
                  ? `«${tea.name}» нет в наличии`
                  : `Добавить «${tea.name}» в корзину`
              }
              disabled={quantityLimitReached}
              onClick={() => onAdd(tea)}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.5 8.5h11l-1.1 8.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 8.5Z" />
                <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" />
                <path d="M12 11v4M10 13h4" />
              </svg>
            </button>
            <div className="quick-qty">
              <button
                type="button"
                className="quick-qty-btn quick-qty-minus"
                aria-label={`Уменьшить количество «${tea.name}»`}
                onClick={() => onDecrease(tea)}
              >
                −
              </button>
              <span className="quick-qty-value">{quantity}</span>
              <button
                type="button"
                className="quick-qty-btn quick-qty-plus"
                aria-label={`Увеличить количество «${tea.name}»`}
                disabled={quantityLimitReached}
                onClick={() => onIncrease(tea)}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
