import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type CartItemInput = {
  id: number;
  quantity: number;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Войдите в аккаунт, чтобы оформить заказ.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("items" in body) ||
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 30
  ) {
    return NextResponse.json(
      { error: "Корзина пуста или содержит слишком много товаров." },
      { status: 400 },
    );
  }

  const items: CartItemInput[] = [];
  for (const item of body.items) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !Number.isSafeInteger(item.id) ||
      !("quantity" in item) ||
      !Number.isInteger(item.quantity) ||
      (item.quantity as number) < 1 ||
      (item.quantity as number) > 99
    ) {
      return NextResponse.json(
        { error: "Проверьте товары и их количество в корзине." },
        { status: 400 },
      );
    }
    items.push({ id: item.id as number, quantity: item.quantity as number });
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return NextResponse.json(
      { error: "В корзине есть повторяющиеся товары. Обновите страницу." },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, phoneNumber: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Аккаунт не найден. Войдите снова.", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
    if (!user.phoneNumber) {
      return NextResponse.json(
        {
          error: "Добавьте номер телефона в профиле — он нужен для связи по заказу.",
          code: "PROFILE_REQUIRED",
        },
        { status: 409 },
      );
    }

    const teaIds = items.map((item) => item.id);
    const teas = await prisma.tea.findMany({
      where: { id: { in: teaIds }, isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        price: true,
        discountPercent: true,
      },
    });
    if (teas.length !== items.length) {
      return NextResponse.json(
        { error: "Один из товаров больше недоступен. Обновите корзину." },
        { status: 409 },
      );
    }

    const teaById = new Map(teas.map((tea) => [tea.id, tea]));
    const orderItems = items.map((item) => {
      const tea = teaById.get(item.id);
      if (!tea) throw new Error("Состав заказа не совпал с каталогом.");
      return {
        teaName: tea.name,
        teaUnit: tea.unit,
        quantity: item.quantity,
        unitPrice: Math.round(
          tea.price * (1 - tea.discountPercent / 100),
        ),
      };
    });
    const total = orderItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      return NextResponse.json(
        { error: "Сумма заказа превышает допустимое значение." },
        { status: 400 },
      );
    }

    const order = await prisma.order.create({
      data: {
        userId: session.user.id,
        contactName: user.name,
        phoneNumber: user.phoneNumber,
        total,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    return NextResponse.json({
      orderId: order.id,
      total: order.total,
      name: user.name,
      phoneNumber: user.phoneNumber,
      items: order.items.map((item) => ({
        name: item.teaName,
        unit: item.teaUnit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
  } catch (error) {
    console.error("Не удалось создать заказ.", error);
    return NextResponse.json(
      { error: "Не удалось сохранить заказ. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
