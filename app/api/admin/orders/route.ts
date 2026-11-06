import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  getMoyskladCustomerOrderStatus,
  MoyskladError,
} from "@/lib/moysklad";
import { authorizeStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contactName: true,
        phoneNumber: true,
        status: true,
        total: true,
        createdAt: true,
        moyskladOrderId: true,
        moyskladStatus: true,
        moyskladStatusType: true,
        items: {
          select: {
            id: true,
            teaName: true,
            teaUnit: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
    });

    let statusSyncFailed = false;
    const synchronizedOrders = [];
    for (let index = 0; index < orders.length; index += 5) {
      const batch = orders.slice(index, index + 5);
      synchronizedOrders.push(
        ...(await Promise.all(
          batch.map(async (order) => {
            if (!order.moyskladOrderId || order.status !== "PENDING") return order;
            try {
              const externalStatus = await getMoyskladCustomerOrderStatus(
                order.moyskladOrderId,
              );
              if (
                order.moyskladStatus !== externalStatus.name ||
                order.moyskladStatusType !== externalStatus.type ||
                (order.status === "PENDING" &&
                  (externalStatus.type === "Unsuccessful" ||
                    ["Отменен", "Отклонен", "Удален", "Возврат"].includes(
                      externalStatus.name,
                    )))
              ) {
                const externalOrderWasCancelled =
                  externalStatus.type === "Unsuccessful" ||
                  ["Отменен", "Отклонен", "Удален", "Возврат"].includes(
                    externalStatus.name,
                  );
                const status =
                  order.status === "PENDING" && externalOrderWasCancelled
                    ? "REJECTED"
                    : order.status;
                await prisma.order.update({
                  where: { id: order.id },
                  data: {
                    moyskladStatus: externalStatus.name,
                    moyskladStatusType: externalStatus.type,
                    status,
                  },
                });
                return {
                  ...order,
                  moyskladStatus: externalStatus.name,
                  moyskladStatusType: externalStatus.type,
                  status,
                };
              }
            } catch (error) {
              statusSyncFailed = true;
              console.error(
                `Не удалось обновить статус заказа ${order.id} из МойСклад.`,
                error,
              );
            }
            return order;
          }),
        )),
      );
    }

    return NextResponse.json(synchronizedOrders, {
      headers: {
        "Cache-Control": "no-store",
        "X-Moysklad-Status-Sync": statusSyncFailed ? "failed" : "ok",
      },
    });
  } catch (error) {
    console.error("Не удалось загрузить заказы для админ-панели.", error);
    const isMoyskladFailure = error instanceof MoyskladError;
    return NextResponse.json(
      {
        error: isMoyskladFailure
          ? error.message
          : "Не удалось загрузить заказы.",
      },
      { status: isMoyskladFailure ? 502 : 500 },
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
    typeof body.id !== "string" ||
    body.id.length < 1 ||
    body.id.length > 100
  ) {
    return NextResponse.json(
      { error: "Некорректный идентификатор заказа." },
      { status: 400 },
    );
  }

  try {
    await prisma.order.delete({ where: { id: body.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Заказ не найден." }, { status: 404 });
    }
    console.error("Не удалось удалить локальную запись заказа.", error);
    return NextResponse.json(
      { error: "Не удалось удалить запись заказа." },
      { status: 500 },
    );
  }
}
