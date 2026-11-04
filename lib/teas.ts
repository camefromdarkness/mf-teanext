import "server-only";
import { prisma } from "@/lib/prisma";
import type { Tea } from "@/data/teas";
import { getMoyskladAvailableStock } from "@/lib/moysklad";

type TeaRecord = Awaited<ReturnType<typeof findTeas>>[number];

async function findTeas(includeInactive: boolean) {
  return prisma.tea.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export function toTea(record: TeaRecord): Tea {
  const details = Array.isArray(record.details)
    ? record.details.flatMap((item) =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === "string" &&
        typeof item[1] === "string"
          ? [[item[0], item[1]] as [string, string]]
          : [],
      )
    : [];

  return {
    id: record.id,
    moyskladAssortmentId: record.moyskladAssortmentId,
    type: record.type,
    name: record.name,
    shortDesc: record.shortDesc,
    price: String(record.price),
    discountPercent: record.discountPercent,
    unit: record.unit,
    description: record.description,
    details,
    isActive: record.isActive,
    sortOrder: record.sortOrder,
    images: record.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      sortOrder: image.sortOrder,
      isCover: image.isCover,
      showInGallery: image.showInGallery,
    })),
  };
}

export async function getTeas() {
  const teas = (await findTeas(false)).map(toTea);
  const assortmentIds = teas.flatMap((tea) =>
    tea.moyskladAssortmentId ? [tea.moyskladAssortmentId] : [],
  );
  const stock = await getMoyskladAvailableStock(assortmentIds);

  return teas.map((tea) => ({
    ...tea,
    availableStock: tea.moyskladAssortmentId
      ? stock.get(tea.moyskladAssortmentId) ?? 0
      : null,
  }));
}

export async function getAllTeas() {
  return (await findTeas(true)).map(toTea);
}
