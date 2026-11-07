"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import CartModal from "@/components/CartModal";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import SearchFilters from "@/components/SearchFilters";
import TeaCard from "@/components/TeaCard";
import TeaModal from "@/components/TeaModal";
import type { Tea } from "@/data/teas";
import type { CartLine } from "@/components/types";

const CART_STORAGE_KEY = "tea_cart";
const CART_UPDATED_EVENT = "moon-flower-cart-updated";

function subscribeToCart(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CART_UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CART_UPDATED_EVENT, callback);
  };
}

function getCartSnapshot() {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]";
  } catch (error) {
    console.error("Не удалось прочитать корзину из браузера.", error);
    return "[]";
  }
}

function parseCart(snapshot: string, teas: Tea[]): CartLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch (error) {
    console.error("Не удалось разобрать сохранённую корзину.", error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error("Сохранённая корзина имеет неверный формат.");
    return [];
  }

  return parsed.flatMap((item: unknown) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("quantity" in item)
    ) {
      return [];
    }

    const { id, quantity } = item;
    if (
      typeof id !== "number" ||
      typeof quantity !== "number" ||
      !Number.isInteger(id) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !teas.some((tea) => tea.id === id)
    ) {
      return [];
    }

    const tea = teas.find((item) => item.id === id);
    const availableStock = tea?.availableStock;
    if (typeof availableStock === "number" && Number.isFinite(availableStock)) {
      const cappedQuantity = Math.min(
        quantity,
        Math.max(0, Math.floor(availableStock)),
      );
      return cappedQuantity > 0 ? [{ id, quantity: cappedQuantity }] : [];
    }

    return [{ id, quantity }];
  });
}

function updateCart(
  teas: Tea[],
  updater: (current: CartLine[]) => CartLine[],
) {
  try {
    const updatedCart = updater(parseCart(getCartSnapshot(), teas));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updatedCart));
    window.dispatchEvent(new Event(CART_UPDATED_EVENT));
  } catch (error) {
    console.error("Не удалось сохранить корзину в браузере.", error);
  }
}

export default function TeaStore({ teas }: { teas: Tea[] }) {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedTea, setSelectedTea] = useState<Tea | null>(null);
  const [teaClosing, setTeaClosing] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const cartSnapshot = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    () => "[]",
  );
  const cart = useMemo(() => parseCart(cartSnapshot, teas), [cartSnapshot, teas]);
  const types = useMemo(
    () => ["all", ...new Set(teas.map((tea) => tea.type))],
    [teas],
  );
  const filteredTeas = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return teas.filter((tea) => {
      const matchesType = activeType === "all" || tea.type === activeType;
      const matchesSearch =
        !query ||
        `${tea.name} ${tea.shortDesc} ${tea.type}`
          .toLocaleLowerCase("ru")
          .includes(query);
      return matchesType && matchesSearch;
    });
  }, [activeType, search, teas]);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const stockUnavailable = teas.some(
    (tea) => tea.moyskladAssortmentId && tea.availableStock == null,
  );

  useEffect(() => {
    if (!cartOpen && (!selectedTea || teaClosing)) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cartOpen) setCartOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cartOpen, selectedTea, teaClosing]);

  const changeQuantity = useCallback((tea: Tea, difference: number) => {
    updateCart(teas, (current) => {
      const existing = current.find((item) => item.id === tea.id);
      if (!existing && difference < 1) return current;
      const maximumQuantity =
        tea.availableStock === null || tea.availableStock === undefined
          ? 0
          : Math.max(0, Math.floor(tea.availableStock));
      const quantity = (existing?.quantity ?? 0) + difference;
      if (quantity > maximumQuantity) return current;
      if (quantity <= 0) {
        return current.filter((item) => item.id !== tea.id);
      }

      if (!existing) return [...current, { id: tea.id, quantity }];
      return current.map((item) =>
        item.id === tea.id ? { ...item, quantity } : item,
      );
    });
  }, [teas]);

  function openTea(tea: Tea) {
    setSelectedTea(tea);
    setTeaClosing(false);
    setActiveSlide(0);
    setCartOpen(false);
  }

  return (
    <>
      <Header cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
      <main>
        {stockUnavailable && (
          <p className="cart-stock-warning" role="status">
            Не удалось загрузить остатки из МойСклад. Добавление товаров и оформление заказа временно недоступны.
          </p>
        )}
        <SearchFilters
          search={search}
          types={types}
          activeType={activeType}
          onSearch={setSearch}
          onSelectType={setActiveType}
        />
        {filteredTeas.length > 0 ? (
          <div className="catalog">
            {filteredTeas.map((tea, index) => (
              <TeaCard
                tea={tea}
                priority={index === 0}
                animationDelay={`${Math.min(index, 9) * 45}ms`}
                quantity={
                  cart.find((item) => item.id === tea.id)?.quantity ?? 0
                }
                onOpen={openTea}
                onAdd={(item) => changeQuantity(item, 1)}
                onDecrease={(item) => changeQuantity(item, -1)}
                onIncrease={(item) => changeQuantity(item, 1)}
                key={tea.id}
              />
            ))}
          </div>
        ) : (
          <div className="catalog-empty">
            <h3>Ничего не найдено</h3>
            <p>Попробуйте изменить запрос или выбрать другой вид чая.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveType("all");
              }}
            >
              Показать всю коллекцию
            </button>
          </div>
        )}
      </main>
      <Footer />
      <TeaModal
        tea={selectedTea}
        slide={activeSlide}
        quantity={
          cart.find((item) => item.id === selectedTea?.id)?.quantity ?? 0
        }
        onSlideChange={setActiveSlide}
        onCloseStart={() => setTeaClosing(true)}
        onClose={() => {
          setSelectedTea(null);
          setTeaClosing(false);
        }}
        onAdd={(tea) => changeQuantity(tea, 1)}
        onDecrease={(tea) => changeQuantity(tea, -1)}
        onIncrease={(tea) => changeQuantity(tea, 1)}
      />
      <CartModal
        open={cartOpen}
        cart={cart}
        teas={teas}
        onClose={() => setCartOpen(false)}
        onOpenTea={openTea}
        onQuantityChange={(id, quantity) => {
            const tea = teas.find((item) => item.id === id);
            if (!tea) return;
            const maximumQuantity =
              tea.availableStock === null || tea.availableStock === undefined
                ? 0
                : Math.max(0, Math.floor(tea.availableStock));
            updateCart(teas, (current) => {
              const existing = current.find((item) => item.id === id);
              if (quantity <= 0) {
                return current.filter((item) => item.id !== id);
              }
              if (
                quantity > maximumQuantity &&
                quantity >= (existing?.quantity ?? 0)
              ) {
                return current;
              }
              const alreadyExists = current.some((item) => item.id === id);
              return alreadyExists
                ? current.map((item) =>
                    item.id === id ? { ...item, quantity } : item,
                  )
                : [...current, { id, quantity }];
            });
          }}
        onOrderCreated={() => updateCart(teas, () => [])}
        />
    </>
  );
}
