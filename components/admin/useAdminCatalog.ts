"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  draftFromTea,
  EMPTY_DRAFT,
  type AdminTea,
  type Draft,
  type MediaImage,
  type MoyskladProduct,
} from "@/components/admin/types";
import { readResponseError } from "@/components/admin/admin-utils";

export default function useAdminCatalog(initialTeas: AdminTea[]) {
  const [teas, setTeas] = useState(initialTeas);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [detailsText, setDetailsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mediaImages, setMediaImages] = useState<MediaImage[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [moyskladSearch, setMoyskladSearch] = useState("");
  const [moyskladProducts, setMoyskladProducts] = useState<MoyskladProduct[]>([]);
  const [selectedMoyskladProduct, setSelectedMoyskladProduct] =
    useState<MoyskladProduct | null>(null);
  const [moyskladSearchBusy, setMoyskladSearchBusy] = useState(false);
  const [moyskladSearchError, setMoyskladSearchError] = useState("");
  const [draggedTeaId, setDraggedTeaId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [teaPendingDeletion, setTeaPendingDeletion] =
    useState<AdminTea | null>(null);
  const productsListRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{
    teaId: number;
    pointerId: number;
    dropIndex: number;
    clientY: number;
  } | null>(null);
  const editing = selectedId !== "";
  const categories = useMemo(
    () =>
      [...new Set(teas.map((tea) => tea.type.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ru"),
      ),
    [teas],
  );

  useEffect(() => {
    if (!teaPendingDeletion) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setTeaPendingDeletion(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [teaPendingDeletion, busy]);

  useEffect(() => {
    const query = moyskladSearch.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setMoyskladSearchBusy(true);
      setMoyskladSearchError("");
      try {
        const response = await fetch(
          `/api/admin/moysklad/products?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setMoyskladSearchError(await readResponseError(response));
          return;
        }
        setMoyskladProducts((await response.json()) as MoyskladProduct[]);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        console.error("Не удалось выполнить поиск в МойСклад.", requestError);
        setMoyskladSearchError("Не удалось подключиться к МойСклад.");
      } finally {
        if (!controller.signal.aborted) setMoyskladSearchBusy(false);
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [moyskladSearch]);

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
        setError(await readResponseError(response));
        return;
      }
      const result = (await response.json()) as { url: string };
      setMediaImages((current) =>
        current.some((image) => image.url === result.url)
          ? current
          : [...current, { url: result.url, alt: draft.name, uploaded: true }],
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
    if (!draft.moyskladAssortmentId) {
      setError("Сначала выберите позицию в МойСклад.");
      return;
    }
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
        setError(await readResponseError(response));
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

  function selectMoyskladItem(product: MoyskladProduct) {
    setSelectedMoyskladProduct(product);
    setDraft((current) => ({
      ...current,
      moyskladAssortmentId: product.id,
    }));
    setMoyskladProducts([]);
  }

  function clearMoyskladItem() {
    setDraft((current) => ({ ...current, moyskladAssortmentId: null }));
    setSelectedMoyskladProduct(null);
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
        setError(await readResponseError(response));
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

  async function deleteTea(tea: AdminTea) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tea.id }),
      });
      if (!response.ok) {
        setError(await readResponseError(response));
        return;
      }

      setTeas((current) => current.filter((item) => item.id !== tea.id));
      setSelectedId("");
      setDraft(EMPTY_DRAFT);
      setDetailsText("");
      setSelectedMoyskladProduct(null);
      setMoyskladProducts([]);
      setMoyskladSearch("");
      setCreatingCategory(false);
      setTeaPendingDeletion(null);
    } catch (requestError) {
      console.error("Не удалось удалить товар из каталога.", requestError);
      setError("Не удалось удалить товар.");
    } finally {
      setBusy(false);
    }
  }

  async function reorderTea(sourceId: number, targetIndex: number) {
    if (busy) return;
    const previousTeas = teas;
    const sourceIndex = teas.findIndex((tea) => tea.id === sourceId);
    if (sourceIndex < 0) return;

    const reordered = [...teas];
    const [movedTea] = reordered.splice(sourceIndex, 1);
    const insertionIndex = Math.max(
      0,
      Math.min(
        targetIndex > sourceIndex ? targetIndex - 1 : targetIndex,
        reordered.length,
      ),
    );
    if (insertionIndex === sourceIndex) return;
    reordered.splice(insertionIndex, 0, movedTea);
    const orderedTeas = reordered.map((tea, sortOrder) => ({
      ...tea,
      sortOrder,
    }));
    setTeas(orderedTeas);
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/teas/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedTeas.map((tea) => tea.id) }),
      });
      if (!response.ok) {
        setTeas(previousTeas);
        setError(await readResponseError(response));
        return;
      }
    } catch (requestError) {
      console.error("Не удалось сохранить порядок товаров.", requestError);
      setTeas(previousTeas);
      setError("Не удалось сохранить порядок товаров.");
    } finally {
      setBusy(false);
    }
  }

  const getDropIndex = useCallback(
    (clientY: number) => {
      const rows = productsListRef.current?.querySelectorAll<HTMLElement>(
        "[data-tea-id]",
      );
      if (!rows) return teas.length;

      for (let index = 0; index < rows.length; index += 1) {
        const bounds = rows[index].getBoundingClientRect();
        if (clientY < bounds.top + bounds.height / 2) return index;
      }
      return rows.length;
    },
    [teas.length],
  );

  function startDraggingTea(event: PointerEvent<HTMLButtonElement>, teaId: number) {
    if (busy || event.button !== 0) return;
    event.preventDefault();
    const index = getDropIndex(event.clientY);
    dragStateRef.current = {
      teaId,
      pointerId: event.pointerId,
      dropIndex: index,
      clientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedTeaId(teaId);
    setDropIndex(index);
  }

  function moveDraggedTea(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.clientY = event.clientY;
    drag.dropIndex = getDropIndex(event.clientY);
    setDropIndex(drag.dropIndex);
  }

  function finishDraggingTea(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDraggedTeaId(null);
    setDropIndex(null);
    void reorderTea(drag.teaId, drag.dropIndex);
  }

  function cancelDraggingTea(event: PointerEvent<HTMLButtonElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDraggedTeaId(null);
    setDropIndex(null);
  }

  useEffect(() => {
    if (draggedTeaId === null) return;

    function scrollDuringDrag(event: WheelEvent) {
      const list = productsListRef.current;
      const drag = dragStateRef.current;
      if (!list || !drag) return;
      event.preventDefault();
      list.scrollTop += event.deltaY;
      drag.dropIndex = getDropIndex(drag.clientY);
      setDropIndex(drag.dropIndex);
    }

    window.addEventListener("wheel", scrollDuringDrag, { passive: false });
    return () => window.removeEventListener("wheel", scrollDuringDrag);
  }, [draggedTeaId, getDropIndex]);

  function startNewTea() {
    setSelectedId("");
    setDraft(EMPTY_DRAFT);
    setDetailsText("");
    setSelectedMoyskladProduct(null);
    setMoyskladProducts([]);
    setMoyskladSearch("");
  }

  function selectTea(tea: AdminTea) {
    setSelectedId(String(tea.id));
    setDraft(draftFromTea(tea));
    setDetailsText(tea.details.map(([key, value]) => `${key} | ${value}`).join("\n"));
    setSelectedMoyskladProduct(null);
    setMoyskladProducts([]);
    setMoyskladSearch("");
    if (tea.moyskladAssortmentId) {
      void fetch(
        `/api/admin/moysklad/products?id=${encodeURIComponent(tea.moyskladAssortmentId)}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(await readResponseError(response));
          const product = (await response.json()) as MoyskladProduct;
          setSelectedMoyskladProduct(product);
        })
        .catch((requestError: unknown) => {
          console.error("Не удалось получить привязанный товар МойСклад.", requestError);
          setError("Не удалось загрузить связанную позицию из МойСклад.");
        });
    }
  }

  async function openImageLibrary() {
    setMediaOpen((open) => !open);
    if (mediaImages.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/images");
      if (!response.ok) {
        setError(await readResponseError(response));
        return;
      }
      setMediaImages((await response.json()) as MediaImage[]);
    } catch (requestError) {
      console.error("Не удалось получить каталог изображений.", requestError);
      setError("Не удалось загрузить список фотографий.");
    } finally {
      setBusy(false);
    }
  }

  function addImageFromLibrary(image: MediaImage) {
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

  async function deleteLibraryImage(image: MediaImage) {
    if (!image.uploaded || image.inUse) return;
    if (!window.confirm("Удалить загруженную фотографию? Это действие нельзя отменить.")) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: image.url }),
      });
      if (!response.ok) {
        setError(await readResponseError(response));
        return;
      }
      setMediaImages((current) =>
        current.filter((item) => item.url !== image.url),
      );
    } catch (requestError) {
      console.error("Не удалось удалить фотографию.", requestError);
      setError("Не удалось удалить фотографию.");
    } finally {
      setBusy(false);
    }
  }

  return {
    teas,
    selectedId,
    draft,
    setDraft,
    creatingCategory,
    setCreatingCategory,
    detailsText,
    setDetailsText,
    busy,
    error,
    mediaImages,
    mediaOpen,
    moyskladSearch,
    setMoyskladSearch,
    moyskladProducts,
    moyskladSearchBusy,
    setMoyskladSearchBusy,
    moyskladSearchError,
    setMoyskladSearchError,
    selectedMoyskladProduct,
    draggedTeaId,
    dropIndex,
    productsListRef,
    teaPendingDeletion,
    setTeaPendingDeletion,
    categories,
    setMoyskladProducts,
    setError,
    uploadImage,
    saveTea,
    selectMoyskladItem,
    clearMoyskladItem,
    toggleTea,
    deleteTea,
    startDraggingTea,
    moveDraggedTea,
    finishDraggingTea,
    cancelDraggingTea,
    startNewTea,
    selectTea,
    openImageLibrary,
    addImageFromLibrary,
    deleteLibraryImage,
  };
}
