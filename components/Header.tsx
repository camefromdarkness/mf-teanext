import Image from "next/image";
import Link from "next/link";

type HeaderProps = {
  cartCount: number;
  onOpenCart: () => void;
};

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 8.5h11l-1.1 8.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 8.5Z" />
      <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" />
      <path d="M9 12.5h6" />
    </svg>
  );
}

export default function Header({ cartCount, onOpenCart }: HeaderProps) {
  return (
    <header>
      <a className="brand" href="#" aria-label="MOON FLOWER — на главную">
        <Image
          src="/logo.png"
          alt=""
          className="logo"
          width={120}
          height={120}
          loading="eager"
        />
        <span className="brand-name">MOON FLOWER</span>
      </a>
      <Link className="account-link" href="/account" aria-label="Личный кабинет">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
        <span>Кабинет</span>
      </Link>
      <Link className="account-link admin-link" href="/admin" aria-label="Админ-панель">
        <span>Админка</span>
      </Link>
      <section
        className="sale-announcement"
        aria-label="Распродажа 11.11 — Чёрная пятница 11.11"
      >
        <h1 className="sale-announcement-title">
          Распродажа 11.11 — Чёрная пятница 11.11
        </h1>
        <div className="sale-marquee" aria-hidden="true">
          <div className="sale-marquee-track">
            {[0, 1].map((group) => (
              <div
                className="sale-marquee-group"
                aria-hidden={group === 1 ? true : undefined}
                key={group}
              >
                <span className="sale-marquee-sale">РАСПРОДАЖА 11.11</span>
                <span className="sale-marquee-separator">✦</span>
                <span className="sale-marquee-black-friday">
                  ЧЁРНАЯ ПЯТНИЦА 11.11
                </span>
                <span className="sale-marquee-separator">✦</span>
              </div>
            ))}
          </div>
        </div>
        <p>Скидки на выбранные чаи</p>
      </section>
      <button
        type="button"
        className={`cart-icon${cartCount > 0 ? " is-visible" : ""}`}
        aria-label={`Открыть корзину, товаров: ${cartCount}`}
        onClick={onOpenCart}
      >
        <CartIcon />
        <span className="cart-badge">{cartCount}</span>
      </button>
    </header>
  );
}
