"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Tea, TeaImage } from "@/data/teas";

type AdminTea = Tea & { isActive: boolean };
type Draft = Omit<Tea, "id" | "images" | "isActive" | "sortOrder" | "discountPercent"> & {
  images: TeaImage[];
  discountPercent: string;
};

const EMPTY_DRAFT: Draft = {
  type: "",
  name: "",
  shortDesc: "",
  price: "",
  discountPercent: "20",
  unit: "₽ / 50г",
  description: "",
  details: [],
  images: [],
};

function draftFromTea(tea: AdminTea): Draft {
  return {
    type: tea.type,
    name: tea.name,
    shortDesc: tea.shortDesc,
    price: tea.price,
    discountPercent: String(tea.discountPercent),
    unit: tea.unit,
    description: tea.description,
    details: tea.details,
    images: tea.images,
  };
}

export default function AdminPanel({
  authenticated,
  initialTeas,
}: {
  authenticated: boolean;
  initialTeas: AdminTea[];
}) {
  const router = useRouter();
  const [teas, setTeas] = useState(initialTeas);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [detailsText, setDetailsText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaImages, setMediaImages] = useState<{ url: string; alt: string }[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const editing = selectedId !== "";

  async function readError(response: Response) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return body?.error ?? "Не удалось выполнить запрос.";
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setPassword("");
      router.refresh();
    } catch (requestError) {
      console.error("Не удалось выполнить вход в админ-панель.", requestError);
      setError("Не удалось подключиться к серверу.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      router.refresh();
    } catch (requestError) {
      console.error("Не удалось завершить сеанс администратора.", requestError);
      setError("Не удалось выйти. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/images", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const result = (await response.json()) as { url: string };
      setMediaImages((current) =>
        current.some((image) => image.url === result.url)
          ? current
          : [...current, { url: result.url, alt: draft.name }],
      );
      setDraft((current) => ({
        ...current,
        images: [
          ...current.images,
          {
            url: result.url,
            alt: current.name,
            sortOrder: current.images.length,
            isCover: current.images.length === 0,
            showInGallery: true,
          },
        ],
      }));
    } catch (requestError) {
      console.error("Не удалось загрузить изображение.", requestError);
      setError("Не удалось загрузить файл.");
    } finally {
      setBusy(false);
    }
  }

  async function saveTea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const details = detailsText
      .split("\n")
      .map((line) => line.split("|").map((part) => part.trim()))
      .filter((parts) => parts.some(Boolean))
      .map(([label, ...rest]) => [label ?? "", rest.join(" | ")] as [string, string]);

    try {
      const response = await fetch("/api/admin/teas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: Number(selectedId) } : {}),
          ...draft,
          price: Number(draft.price),
          discountPercent: Number(draft.discountPercent),
          details,
        }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const saved = (await response.json()) as AdminTea;
      setTeas((current) => {
        const found = current.some((tea) => tea.id === saved.id);
        return found
          ? current.map((tea) => (tea.id === saved.id ? saved : tea))
          : [...current, saved];
      });
      setSelectedId(String(saved.id));
    } catch (requestError) {
      console.error("Не удалось сохранить данные чая.", requestError);
      setError("Не удалось сохранить товар.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTea(tea: AdminTea) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tea.id, isActive: !tea.isActive }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const updated = (await response.json()) as AdminTea;
      setTeas((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (requestError) {
      console.error("Не удалось изменить видимость чая.", requestError);
      setError("Не удалось изменить видимость товара.");
    } finally {
      setBusy(false);
    }
  }

  function startNewTea() {
    setSelectedId("");
    setDraft(EMPTY_DRAFT);
    setDetailsText("");
  }

  function selectTea(tea: AdminTea) {
    setSelectedId(String(tea.id));
    setDraft(draftFromTea(tea));
    setDetailsText(tea.details.map(([key, value]) => `${key} | ${value}`).join("\n"));
  }

  async function openImageLibrary() {
    setMediaOpen((open) => !open);
    if (mediaImages.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/images");
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setMediaImages((await response.json()) as { url: string; alt: string }[]);
    } catch (requestError) {
      console.error("Не удалось получить каталог изображений.", requestError);
      setError("Не удалось загрузить список фотографий.");
    } finally {
      setBusy(false);
    }
  }

  function addImageFromLibrary(image: { url: string; alt: string }) {
    setDraft((current) =>
      current.images.some((item) => item.url === image.url)
        ? current
        : {
            ...current,
            images: [
              ...current.images,
              {
                ...image,
                sortOrder: current.images.length,
                isCover: current.images.length === 0,
                showInGallery: true,
              },
            ],
          },
    );
    setMediaOpen(false);
  }

  if (!authenticated) {
    return (
      <main className="admin-page">
        <form className="admin-login" onSubmit={login}>
          <Link className="admin-back-link" href="/">← В магазин</Link>
          <p className="tea-category-label">MOON FLOWER</p>
          <h1>Вход в админ-панель</h1>
          <label>
            Пароль администратора
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Проверка…" : "Войти"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-heading">
        <div>
          <Link className="admin-back-link" href="/">← В магазин</Link>
          <p className="tea-category-label">УПРАВЛЕНИЕ КАТАЛОГОМ</p>
          <h1>Админ-панель</h1>
        </div>
        <button type="button" className="admin-secondary-button" onClick={logout} disabled={busy}>
          Выйти
        </button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-layout">
        <section className="admin-products">
          <button
            className={`admin-product-row${selectedId === "" ? " selected" : ""}`}
            type="button"
            onClick={startNewTea}
          >
            + Добавить чай
          </button>
          {teas.map((tea) => (
            <div
              className={`admin-product-row${selectedId === String(tea.id) ? " selected" : ""}`}
              key={tea.id}
            >
              <button type="button" onClick={() => selectTea(tea)}>
                {tea.name}
                <small>{tea.isActive ? "Опубликован" : "Скрыт"}</small>
              </button>
              <button
                type="button"
                className="admin-visibility-button"
                aria-label={tea.isActive ? "Скрыть чай" : "Опубликовать чай"}
                disabled={busy}
                onClick={() => toggleTea(tea)}
              >
                {tea.isActive ? "Скрыть" : "Показать"}
              </button>
            </div>
          ))}
        </section>
        <form className="admin-editor" onSubmit={saveTea}>
          <h2>{editing ? "Редактировать чай" : "Новый чай"}</h2>
          <div className="admin-fields-grid">
            <label>
              Категория
              <input value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} required />
            </label>
            <label>
              Цена, ₽
              <input type="number" min="1" step="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required />
            </label>
            <label>
              Скидка, %
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={draft.discountPercent}
                onChange={(event) =>
                  setDraft({ ...draft, discountPercent: event.target.value })
                }
                required
              />
            </label>
          </div>
          <label>
            Название
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </label>
          <label>
            Короткое описание
            <input value={draft.shortDesc} onChange={(event) => setDraft({ ...draft, shortDesc: event.target.value })} required />
          </label>
          <label>
            Единица продажи
            <input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} required />
          </label>
          <label>
            Описание
            <textarea rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required />
          </label>
          <label>
            Характеристики (одна строка на пункт, формат: «Название | значение»)
            <textarea rows={4} value={detailsText} onChange={(event) => setDetailsText(event.target.value)} />
          </label>
          <div className="admin-image-heading">
            <h3>Фотографии</h3>
            <div className="admin-image-actions">
              <button type="button" className="admin-secondary-button" onClick={openImageLibrary} disabled={busy}>
                Выбрать из каталога
              </button>
              <label className="admin-upload-button">
                Загрузить фото
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          {mediaOpen && (
            <div className="admin-media-library">
              {mediaImages.length ? mediaImages.map((image) => (
                <button
                  type="button"
                  className="admin-media-image"
                  key={image.url}
                  disabled={draft.images.some((item) => item.url === image.url)}
                  onClick={() => addImageFromLibrary(image)}
                >
                  <span><Image src={image.url} alt={image.alt} fill sizes="100px" /></span>
                  {draft.images.some((item) => item.url === image.url) ? "Уже выбрано" : "Добавить"}
                </button>
              )) : <p>В каталоге пока нет фотографий.</p>}
            </div>
          )}
          {draft.images.length === 0 ? (
            <p className="admin-image-hint">Добавьте хотя бы одно фото или выберите существующее из каталога.</p>
          ) : (
            <div className="admin-image-grid">
              {draft.images.map((image, index) => (
                <div className="admin-image-card" key={`${image.url}-${index}`}>
                  <div className="admin-image-preview">
                    <Image src={image.url} alt={image.alt} fill sizes="160px" />
                  </div>
                  <label>
                    <input
                      type="radio"
                      name="cover"
                      checked={image.isCover}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          images: current.images.map((item, itemIndex) => ({
                            ...item,
                            isCover: itemIndex === index,
                          })),
                        }))
                      }
                    />
                    Фото карточки
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={image.showInGallery}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          images: current.images.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, showInGallery: event.target.checked }
                              : item,
                          ),
                        }))
                      }
                    />
                    В галерее
                  </label>
                  <button
                    type="button"
                    className="admin-remove-image"
                    onClick={() =>
                      setDraft((current) => {
                        const images = current.images
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
                        if (image.isCover && images[0]) images[0].isCover = true;
                        return { ...current, images };
                      })
                    }
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="admin-save-button" type="submit" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить чай"}
          </button>
        </form>
      </div>
    </main>
  );
}
