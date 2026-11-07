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
      throw new StockChangedError(
        "Остаток одного из товаров изменился. Обновите каталог и проверьте корзину.",
        409,
      );
    }
  }
}

class PendingOrderLimitError extends Error {}
class StockChangedError extends MoyskladError {}

const MAX_PENDING_ORDERS_PER_USER = 3;

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

  const checkoutKey = body.checkoutKey;

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

      const userId = session.user.id;

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
        order = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(846210, hashtext(${userId})) IS NULL`;
          const retry = await tx.order.findUnique({ where: { checkoutKey }, include: { items: true } });
          if (retry) return retry;
          const pendingCount = await tx.order.count({ where: { userId, status: "PENDING" } });
          if (pendingCount >= MAX_PENDING_ORDERS_PER_USER) {
            throw new PendingOrderLimitError();
          }
          return tx.order.create({
            data: { checkoutKey, moyskladSyncRequired: true, userId, contactName, phoneNumber, total, items: { create: preparedItems } },
            include: { items: true },
          });
        }) as NonNullable<typeof order>;
      } catch (error) {
        if (error instanceof PendingOrderLimitError) {
          return NextResponse.json(
            {
              error:
                "У вас уже есть 2 неподтверждённых заказа. Дождитесь подтверждения или попросите магазин отменить один из них.",
              code: "PENDING_ORDER_LIMIT",
            },
            { status: 429 },
          );
        }
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

    order = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(846211, 1) IS NULL`;
      const currentOrder = await tx.order.findUniqueOrThrow({ where: { id: order!.id }, include: { items: true } });
      if (currentOrder.moyskladOrderId) return currentOrder;
      const externalCode = `mf-web-${checkoutKey}`;
      let moyskladOrder = await findMoyskladCustomerOrder(externalCode);
      if (!moyskladOrder) {
        const orderItems = currentOrder.items.map((item) => {
          if (!item.moyskladAssortmentId) throw new MoyskladError("У заказа нет сохранённой связи с товаром МойСклад.");
          return { assortmentId: item.moyskladAssortmentId, quantity: item.quantity, unitPrice: item.unitPrice };
        });
        const stock = await getMoyskladAvailableStock(orderItems.map((item) => item.assortmentId));
        validateAvailableStock(orderItems, stock);
        moyskladOrder = await createMoyskladCustomerOrder({ externalCode, localOrderId: currentOrder.id, contactName: currentOrder.contactName, phoneNumber: currentOrder.phoneNumber, items: orderItems });
      }
      return tx.order.update({ where: { id: currentOrder.id }, data: { moyskladOrderId: moyskladOrder.id }, include: { items: true } });
    }, { maxWait: 10_000, timeout: 90_000 });

    return NextResponse.json(orderResponse(order));
  } catch (error) {
    if (error instanceof StockChangedError) {
      await prisma.order.updateMany({
        where: { checkoutKey: (body as { checkoutKey?: string }).checkoutKey, status: "PENDING", moyskladOrderId: null },
        data: { status: "REJECTED", moyskladSyncRequired: false },
      }).catch(() => undefined);
    }
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
