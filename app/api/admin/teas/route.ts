import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { toTea } from "@/lib/teas";

type TeaInput = {
  id?: number;
  moyskladAssortmentId: string | null;
  type: string;
  name: string;
  shortDesc: string;
  price: number;
  discountPercent: number;
  unit: string;
  description: string;
  details: [string, string][];
  images: {
    url: string;
    alt: string;
    isCover: boolean;
    showInGallery: boolean;
  }[];
};

function parseTeaInput(value: unknown): TeaInput | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const requiredText = ["type", "name", "shortDesc", "unit", "description"];
  if (
    requiredText.some(
      (key) =>
        typeof input[key] !== "string" ||
        (input[key] as string).trim().length === 0,
    ) ||
    (input.type as string).length > 100 ||
    (input.name as string).length > 200 ||
    (input.shortDesc as string).length > 300 ||
    (input.unit as string).length > 60 ||
    (input.description as string).length > 10_000 ||
    typeof input.moyskladAssortmentId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(input.moyskladAssortmentId) ||
    !Number.isSafeInteger(input.price) ||
    (input.price as number) < 1 ||
    (input.price as number) > 10_000_000 ||
    !Number.isInteger(input.discountPercent) ||
    (input.discountPercent as number) < 0 ||
    (input.discountPercent as number) > 100 ||
    (input.id !== undefined &&
      (!Number.isSafeInteger(input.id) || (input.id as number) < 1)) ||
    !Array.isArray(input.details) ||
    input.details.length > 30 ||
    !input.details.every(
      (item) =>
        Array.isArray(item) &&
        item.length === 2 &&
        item.every(
          (part) => typeof part === "string" && part.length <= 300,
        ),
    ) ||
    !Array.isArray(input.images) ||
    input.images.length < 1 ||
    input.images.length > 30
  ) {
    return null;
  }

  const images = input.images as TeaInput["images"];
  if (
    images.some(
      (image) =>
        typeof image !== "object" ||
        image === null ||
        typeof image.url !== "string" ||
        !/^\/(?:images|uploads\/teas|api\/uploads\/teas)\/[A-Za-z0-9._/-]+$/.test(image.url) ||
        image.url.includes("..") ||
        typeof image.alt !== "string" ||
        image.alt.length > 300 ||
        typeof image.isCover !== "boolean" ||
        typeof image.showInGallery !== "boolean",
    ) ||
    new Set(images.map((image) => image.url)).size !== images.length ||
    images.filter((image) => image.isCover).length !== 1
  ) {
    return null;
  }

  return {
    ...(input.id === undefined ? {} : { id: input.id as number }),
    moyskladAssortmentId: input.moyskladAssortmentId as string,
    type: (input.type as string).trim(),
    name: (input.name as string).trim(),
    shortDesc: (input.shortDesc as string).trim(),
    price: input.price as number,
    discountPercent: input.discountPercent as number,
    unit: (input.unit as string).trim(),
    description: (input.description as string).trim(),
    details: input.details as [string, string][],
    images,
  };
}

export async function POST(request: Request) {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const input = parseTeaInput(body);
  if (!input) {
    if (
      typeof body === "object" &&
      body !== null &&
      (!("moyskladAssortmentId" in body) ||
        typeof body.moyskladAssortmentId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.moyskladAssortmentId))
    ) {
      return NextResponse.json(
        { error: "Выберите позицию МойСклад для этого товара." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Проверьте поля и фотографии товара." },
      { status: 400 },
    );
  }
  const teaData = {
    moyskladAssortmentId: input.moyskladAssortmentId,
    type: input.type,
    name: input.name,
    shortDesc: input.shortDesc,
    price: input.price,
    discountPercent: input.discountPercent,
    unit: input.unit,
    description: input.description,
    details: input.details as Prisma.InputJsonValue,
  };

  try {
    const tea = await prisma.$transaction(async (transaction) => {
      const saved = input.id
        ? await transaction.tea.update({
            where: { id: input.id },
            data: teaData,
          })
        : await transaction.tea.create({
            data: {
              ...teaData,
              sortOrder:
                ((await transaction.tea.findFirst({
                  orderBy: { sortOrder: "desc" },
                  select: { sortOrder: true },
                }))?.sortOrder ?? -1) + 1,
            },
          });

      await transaction.teaImage.deleteMany({ where: { teaId: saved.id } });
      await transaction.teaImage.createMany({
        data: input.images.map((image, sortOrder) => ({
          teaId: saved.id,
          url: image.url,
          alt: image.alt,
          isCover: image.isCover,
          showInGallery: image.showInGallery,
          sortOrder,
        })),
      });

      return transaction.tea.findUniqueOrThrow({
        where: { id: saved.id },
        include: { images: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json(toTea(tea));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Этот товар МойСклад уже привязан к другой позиции сайта." },
        { status: 409 },
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Чай не найден." }, { status: 404 });
    }
    console.error("Не удалось сохранить чай.", error);
    return NextResponse.json(
      { error: "Не удалось сохранить изменения в базе данных." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !Number.isSafeInteger(body.id) ||
    !("isActive" in body) ||
    typeof body.isActive !== "boolean"
  ) {
    return NextResponse.json({ error: "Некорректный статус товара." }, { status: 400 });
  }

  try {
    const record = await prisma.tea.update({
      where: { id: body.id as number },
      data: { isActive: body.isActive },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json(toTea(record));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Чай не найден." }, { status: 404 });
    }
    console.error("Не удалось изменить видимость чая.", error);
    return NextResponse.json(
      { error: "Не удалось изменить статус товара." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await authorizeStaff(["ADMIN", "SUPER_ADMIN"]);
  if (!access.authorized) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !Number.isSafeInteger(body.id) ||
    (body.id as number) < 1
  ) {
    return NextResponse.json({ error: "Некорректный идентификатор товара." }, { status: 400 });
  }

  try {
    await prisma.tea.delete({ where: { id: body.id as number } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Товар не найден." }, { status: 404 });
    }
    console.error("Не удалось удалить товар из каталога.", error);
    return NextResponse.json(
      { error: "Не удалось удалить товар из каталога." },
      { status: 500 },
    );
  }
}
