import { NextResponse } from "next/server";
import {
  getMoyskladCustomerOrderStatus,
  MoyskladError,
} from "@/lib/moysklad";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Требуется вход администратора." },
      { status: 401 },
    );
  }

  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
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

    const synchronizedOrders = [];
    for (let index = 0; index < orders.length; index += 5) {
      const batch = orders.slice(index, index + 5);
      synchronizedOrders.push(
        ...(await Promise.all(
          batch.map(async (order) => {
            if (!order.moyskladOrderId) return order;
            const externalStatus = await getMoyskladCustomerOrderStatus(
              order.moyskladOrderId,
            );
            if (
              order.moyskladStatus !== externalStatus.name ||
              order.moyskladStatusType !== externalStatus.type
            ) {
              await prisma.order.update({
                where: { id: order.id },
                data: {
                  moyskladStatus: externalStatus.name,
                  moyskladStatusType: externalStatus.type,
                },
              });
              return {
                ...order,
                moyskladStatus: externalStatus.name,
                moyskladStatusType: externalStatus.type,
              };
            }
            return order;
          }),
        )),
      );
    }

    return NextResponse.json(synchronizedOrders, {
      headers: { "Cache-Control": "no-store" },
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
