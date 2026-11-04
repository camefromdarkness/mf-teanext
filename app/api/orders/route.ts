import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createMoyskladCustomerOrder,
  findMoyskladCustomerOrder,
  getMoyskladAvailableStock,
  moyskladIsConfigured,
  MoyskladError,
} from "@/lib/moysklad";
import { normalizeRussianPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

type CartItemInput = {
  id: number;
  quantity: number;
};

function isCartItemInput(value: unknown): value is CartItemInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    Number.isSafeInteger(value.id) &&
    "quantity" in value &&
    Number.isInteger(value.quantity) &&
    (value.quantity as number) >= 1 &&
    (value.quantity as number) <= 99
  );
}

function cartMatchesOrder(
  items: CartItemInput[],
  orderItems: { teaId: number | null; quantity: number }[],
) {
  if (orderItems.some((item) => item.teaId === null)) return false;
  const requested = [...items].sort((a, b) => a.id - b.id);
  const saved = [...orderItems]
    .map((item) => ({ id: item.teaId as number, quantity: item.quantity }))
    .sort((a, b) => a.id - b.id);
  return (
    requested.length === saved.length &&
    requested.every(
      (item, index) =>
        item.id === saved[index].id &&
        item.quantity === saved[index].quantity,
    )
  );
}

function validateAvailableStock(
  items: { assortmentId: string; quantity: number }[],
  stock: Map<string, number>,
) {
  for (const item of items) {
    const available = Math.floor(stock.get(item.assortmentId) ?? 0);
    if (item.quantity > available) {
      throw new MoyskladError(
        "Остаток одного из товаров изменился. Обновите каталог и проверьте корзину.",
        409,
      );
    }
  }
}

function orderResponse(order: {
  id: string;
  total: number;
  contactName: string | null;
  phoneNumber: string;
  items: {
    teaName: string;
    teaUnit: string;
    quantity: number;
    unitPrice: number;
  }[];
}) {
  return {
    orderId: order.id,
    total: order.total,
    name: order.contactName,
    phoneNumber: order.phoneNumber,
    items: order.items.map((item) => ({
      name: item.teaName,
      unit: item.teaUnit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

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
    body.items.length > 30 ||
    !("checkoutKey" in body) ||
    typeof body.checkoutKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.checkoutKey,
    )
  ) {
    return NextResponse.json(
      { error: "Корзина пуста или содержит некорректные данные." },
      { status: 400 },
    );
  }

  const items = body.items;
  if (!items.every(isCartItemInput)) {
    return NextResponse.json(
      { error: "Проверьте товары и их количество в корзине." },
      { status: 400 },
    );
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return NextResponse.json(
      { error: "В корзине есть повторяющиеся товары. Обновите страницу." },
      { status: 400 },
    );
  }

  if (!moyskladIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Интеграция с МойСклад не настроена. Обратитесь к администратору магазина.",
        code: "MOYSKLAD_NOT_CONFIGURED",
      },
      { status: 503 },
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
    const contactName = user.name;
    const phoneNumber = normalizeRussianPhone(user.phoneNumber);
    if (!phoneNumber) {
      return NextResponse.json(
        {
          error:
            "Обновите номер телефона в профиле. Укажите корректный российский номер.",
          code: "PROFILE_REQUIRED",
        },
        { status: 409 },
      );
    }

    let order = await prisma.order.findUnique({
      where: { checkoutKey: body.checkoutKey },
      include: { items: true },
    });
    if (order && order.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Не удалось проверить этот заказ. Обновите страницу." },
        { status: 409 },
      );
    }
    if (order && !cartMatchesOrder(items, order.items)) {
      return NextResponse.json(
        { error: "Корзина изменилась. Повторите оформление заказа." },
        { status: 409 },
      );
    }
    if (order?.status === "REJECTED") {
      return NextResponse.json(
        { error: "Этот заказ был отклонён. Создайте новый заказ из корзины." },
        { status: 409 },
      );
    }

    if (!order) {
      const teas = await prisma.tea.findMany({
        where: {
          id: { in: items.map((item) => item.id) },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          unit: true,
          price: true,
          discountPercent: true,
          moyskladAssortmentId: true,
        },
      });
      if (teas.length !== items.length) {
        return NextResponse.json(
          { error: "Один из товаров больше недоступен. Обновите корзину." },
          { status: 409 },
        );
      }
      if (teas.some((tea) => !tea.moyskladAssortmentId)) {
        return NextResponse.json(
          {
            error:
              "У одного из товаров не настроена связь с МойСклад. Сообщите администратору магазина.",
            code: "MOYSKLAD_PRODUCT_NOT_LINKED",
          },
          { status: 409 },
        );
      }

      const teaById = new Map(teas.map((tea) => [tea.id, tea]));
      const preparedItems = items.map((item) => {
        const tea = teaById.get(item.id);
        if (!tea?.moyskladAssortmentId) {
          throw new Error("Состав заказа не совпал с каталогом.");
        }
        return {
          teaId: tea.id,
          moyskladAssortmentId: tea.moyskladAssortmentId,
          teaName: tea.name,
          teaUnit: tea.unit,
          quantity: item.quantity,
          unitPrice: Math.round(
            tea.price * (1 - tea.discountPercent / 100),
          ),
        };
      });
      const total = preparedItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
        return NextResponse.json(
          { error: "Сумма заказа превышает допустимое значение." },
          { status: 400 },
        );
      }

      const stock = await getMoyskladAvailableStock(
        preparedItems.map((item) => item.moyskladAssortmentId),
      );
      validateAvailableStock(
        preparedItems.map((item) => ({
          assortmentId: item.moyskladAssortmentId,
          quantity: item.quantity,
        })),
        stock,
      );

      try {
        order = await prisma.order.create({
          data: {
            checkoutKey: body.checkoutKey,
            moyskladSyncRequired: true,
            userId: session.user.id,
            contactName,
            phoneNumber,
            total,
            items: { create: preparedItems },
          },
          include: { items: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          order = await prisma.order.findUnique({
            where: { checkoutKey: body.checkoutKey },
            include: { items: true },
          });
        } else {
          throw error;
        }
      }
      if (!order || order.userId !== session.user.id) {
        throw new Error("Не удалось сохранить заказ.");
      }
    }

    if (!order.moyskladOrderId) {
      const externalCode = `mf-web-${body.checkoutKey}`;
      let moyskladOrder = await findMoyskladCustomerOrder(externalCode);
      if (!moyskladOrder) {
        const orderItems = order.items.map((item) => {
          if (!item.moyskladAssortmentId) {
            throw new MoyskladError(
              "У заказа нет сохранённой связи с товаром МойСклад.",
            );
          }
          return {
            assortmentId: item.moyskladAssortmentId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          };
        });
        const stock = await getMoyskladAvailableStock(
          orderItems.map((item) => item.assortmentId),
        );
        validateAvailableStock(orderItems, stock);
        moyskladOrder = await createMoyskladCustomerOrder({
          externalCode,
          localOrderId: order.id,
          contactName: order.contactName,
          phoneNumber: order.phoneNumber,
          items: orderItems,
        });
      }

      order = await prisma.order.update({
        where: { id: order.id },
        data: { moyskladOrderId: moyskladOrder.id },
        include: { items: true },
      });
    }

    return NextResponse.json(orderResponse(order));
  } catch (error) {
    console.error("Не удалось записать заказ в МойСклад.", error);
    const isMoyskladFailure = error instanceof MoyskladError;
    return NextResponse.json(
      {
        error: isMoyskladFailure
          ? error.message
          : "Не удалось оформить заказ. Проверьте соединение и попробуйте ещё раз.",
        code: isMoyskladFailure ? "MOYSKLAD_SYNC_FAILED" : "ORDER_FAILED",
      },
      { status: isMoyskladFailure && error.status === 409 ? 409 : 502 },
    );
  }
}
