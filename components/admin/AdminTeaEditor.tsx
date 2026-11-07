"use client";

import Image from "next/image";
import type { FormEvent, Dispatch, SetStateAction } from "react";
import type {
  AdminTea,
  Draft,
  MediaImage,
  MoyskladProduct,
} from "@/components/admin/types";

type Props = {
  teas: AdminTea[];
  selectedId: string;
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  categories: string[];
  creatingCategory: boolean;
  setCreatingCategory: Dispatch<SetStateAction<boolean>>;
  detailsText: string;
  setDetailsText: Dispatch<SetStateAction<string>>;
  busy: boolean;
  canDeleteImages: boolean;
  canDeleteTea: boolean;
  mediaImages: MediaImage[];
  mediaOpen: boolean;
  moyskladSearch: string;
  onMoyskladSearchChange: (value: string) => void;
  moyskladProducts: MoyskladProduct[];
  moyskladSearchBusy: boolean;
  moyskladSearchError: string;
  selectedMoyskladProduct: MoyskladProduct | null;
  saveTea: (event: FormEvent<HTMLFormElement>) => void;
  selectMoyskladItem: (product: MoyskladProduct) => void;
  clearMoyskladItem: () => void;
  openImageLibrary: () => void;
  uploadImage: (file: File) => void;
  addImageFromLibrary: (image: MediaImage) => void;
  deleteLibraryImage: (image: MediaImage) => void;
  requestDeleteTea: (tea: AdminTea) => void;
};

export default function AdminTeaEditor({
  teas,
  selectedId,
  draft,
  setDraft,
  categories,
  creatingCategory,
  setCreatingCategory,
  detailsText,
  setDetailsText,
  busy,
  canDeleteImages,
  canDeleteTea,
  mediaImages,
  mediaOpen,
  moyskladSearch,
  onMoyskladSearchChange,
  moyskladProducts,
  moyskladSearchBusy,
  moyskladSearchError,
  selectedMoyskladProduct,
  saveTea,
  selectMoyskladItem,
  clearMoyskladItem,
  openImageLibrary,
  uploadImage,
  addImageFromLibrary,
  deleteLibraryImage,
  requestDeleteTea,
}: Props) {
  const editing = selectedId !== "";

  return (
    <form className="admin-editor" onSubmit={saveTea}>
      <h2>{editing ? "Редактировать чай" : "Новый чай"}</h2>
      <div className="admin-fields-grid">
        <label>
          Категория
          <select
            value={creatingCategory ? "__new__" : draft.type}
            onChange={(event) => {
              if (event.target.value === "__new__") {
                setCreatingCategory(true);
                setDraft((current) => ({ ...current, type: "" }));
                return;
              }
              setCreatingCategory(false);
              setDraft((current) => ({ ...current, type: event.target.value }));
            }}
            required
          >
            <option value="" disabled>
              Выберите категорию
            </option>
            {categories.map((category) => (
              <option value={category} key={category}>
                {category}
              </option>
            ))}
            <option value="__new__">+ Создать категорию</option>
          </select>
          {creatingCategory && (
            <input
              autoFocus
              maxLength={100}
              placeholder="Название новой категории"
              value={draft.type}
              onChange={(event) =>
                setDraft((current) => ({ ...current, type: event.target.value }))
              }
              required
            />
          )}
        </label>
        <label>
          Цена, ₽
          <input
            type="number"
            min="1"
            step="1"
            value={draft.price}
            onChange={(event) =>
              setDraft((current) => ({ ...current, price: event.target.value }))
            }
            required
          />
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
              setDraft((current) => ({
                ...current,
                discountPercent: event.target.value,
              }))
            }
            required
          />
        </label>
      </div>
      <label>
        Название
        <input
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
          required
        />
      </label>
      <label>
        Короткое описание
        <input
          value={draft.shortDesc}
          onChange={(event) =>
            setDraft((current) => ({ ...current, shortDesc: event.target.value }))
          }
          required
        />
      </label>
      <label>
        Единица продажи
        <input
          value={draft.unit}
          onChange={(event) =>
            setDraft((current) => ({ ...current, unit: event.target.value }))
          }
          required
        />
      </label>
      <div className="admin-moysklad-link">
        <label>
          Позиция в МойСклад
          <input
            value={moyskladSearch}
            onChange={(event) => onMoyskladSearchChange(event.target.value)}
            placeholder="Название или код"
            role="combobox"
            aria-autocomplete="list"
            aria-describedby="moysklad-search-hint"
            aria-controls="moysklad-product-suggestions"
            aria-expanded={moyskladProducts.length > 0}
            autoComplete="off"
          />
        </label>
        <p id="moysklad-search-hint">
          Начните вводить название или код — покажу подходящие товары.
        </p>
        {moyskladSearchBusy && <p role="status">Ищем в МойСклад…</p>}
        {moyskladSearchError && (
          <p className="admin-error" role="alert">
            {moyskladSearchError}
          </p>
        )}
        {selectedMoyskladProduct ? (
          <p>
            Связано: {selectedMoyskladProduct.name}
            {selectedMoyskladProduct.code
              ? ` · артикул ${selectedMoyskladProduct.code}`
              : ""}
          </p>
        ) : draft.moyskladAssortmentId ? (
          <p>Связанный товар ID: {draft.moyskladAssortmentId}</p>
        ) : (
          <p>
            Не выбрано. Без связи с товаром нельзя проверить остаток или
            оформить заказ.
          </p>
        )}
        {draft.moyskladAssortmentId && (
          <button
            type="button"
            className="admin-secondary-button"
            onClick={clearMoyskladItem}
          >
            Убрать связь
          </button>
        )}
        {moyskladProducts.length > 0 && (
          <div
            className="admin-moysklad-results"
            id="moysklad-product-suggestions"
            role="listbox"
            aria-label="Товары МойСклад"
          >
            {moyskladProducts.map((product) => (
              <button
                type="button"
                className="admin-secondary-button"
                key={product.id}
                role="option"
                aria-selected={draft.moyskladAssortmentId === product.id}
                onClick={() => selectMoyskladItem(product)}
              >
                <span>{product.name}</span>
                <small>
                  {product.code ? `Артикул: ${product.code}` : "Без артикула"}
                </small>
              </button>
            ))}
          </div>
        )}
        {!moyskladSearchBusy &&
          moyskladSearch.trim().length >= 2 &&
          !moyskladSearchError &&
          moyskladProducts.length === 0 && (
            <p role="status">Подходящих товаров не найдено.</p>
          )}
      </div>
      <label>
        Описание
        <textarea
          rows={5}
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
          required
        />
      </label>
      <label>
        Характеристики (одна строка на пункт, формат: «Название | значение»)
        <textarea
          rows={4}
          value={detailsText}
          onChange={(event) => setDetailsText(event.target.value)}
        />
      </label>
      <div className="admin-image-heading">
        <h3>Фотографии</h3>
        <div className="admin-image-actions">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={openImageLibrary}
            disabled={busy}
          >
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
                if (file) uploadImage(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {mediaOpen && (
        <div className="admin-media-library">
          {mediaImages.length ? (
            mediaImages.map((image) => {
              const isSelected = draft.images.some(
                (item) => item.url === image.url,
              );
              return (
                <div className="admin-media-item" key={image.url}>
                  <button
                    type="button"
                    className="admin-media-image"
                    disabled={isSelected}
                    onClick={() => addImageFromLibrary(image)}
                  >
                    <span>
                      <Image
                        src={image.url}
                        alt={image.alt}
                        fill
                        sizes="100px"
                      />
                    </span>
                    {isSelected ? "Уже выбрано" : "Добавить"}
                  </button>
                  {canDeleteImages && image.uploaded && (
                    <button
                      type="button"
                      className="admin-media-delete"
                      disabled={busy || image.inUse || isSelected}
                      title={
                        image.inUse
                          ? "Сначала удалите фотографию из карточек товаров."
                          : isSelected
                            ? "Сначала уберите фотографию из текущего товара."
                            : "Удалить загруженный файл"
                      }
                      onClick={() => deleteLibraryImage(image)}
                    >
                      {image.inUse
                        ? "Используется в каталоге"
                        : isSelected
                          ? "Выбрано в товаре"
                          : "Удалить файл"}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p>В каталоге пока нет фотографий.</p>
          )}
        </div>
      )}
      {draft.images.length === 0 ? (
        <p className="admin-image-hint">
          Добавьте хотя бы одно фото или выберите существующее из каталога.
        </p>
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
                      .map((item, itemIndex) => ({
                        ...item,
                        sortOrder: itemIndex,
                      }));
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
      {!draft.moyskladAssortmentId && (
        <p className="admin-error" role="alert">
          Чтобы сохранить товар, сначала свяжите его с позицией МойСклад.
        </p>
      )}
      <button
        className="admin-save-button"
        type="submit"
        disabled={busy || !draft.moyskladAssortmentId}
      >
        {busy ? "Сохранение…" : "Сохранить чай"}
      </button>
      {editing && canDeleteTea && (
        <button
          className="admin-delete-button"
          type="button"
          onClick={() => {
            const tea = teas.find((item) => item.id === Number(selectedId));
            if (tea) requestDeleteTea(tea);
          }}
          disabled={busy}
        >
          Удалить товар
        </button>
      )}
    </form>
  );
}
