import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { teas } from "../data/tea-seed";

async function main() {
  for (const [sortOrder, tea] of teas.entries()) {
    await prisma.tea.upsert({
      where: { id: tea.id },
      update: {},
      create: {
        id: tea.id,
        type: tea.type,
        name: tea.name,
        shortDesc: tea.shortDesc,
        price: Number(tea.price),
        discountPercent: 20,
        unit: tea.unit,
        description: tea.description,
        details: tea.details as Prisma.InputJsonValue,
        sortOrder,
      },
    });

    const imageCount = await prisma.teaImage.count({ where: { teaId: tea.id } });
    if (imageCount === 0) {
      await prisma.teaImage.createMany({
        data: tea.images.map((url, imageOrder) => ({
          teaId: tea.id,
          url,
          alt: tea.name,
          sortOrder: imageOrder,
          isCover: imageOrder === 0,
          showInGallery: !tea.hideFirstImage || imageOrder !== 0,
        })),
      });
    }
  }

  await prisma.$queryRaw(
    Prisma.sql`SELECT setval(pg_get_serial_sequence('"Tea"', 'id'), COALESCE(MAX("id"), 1), MAX("id") IS NOT NULL) FROM "Tea"`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Не удалось перенести каталог в базу данных.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
