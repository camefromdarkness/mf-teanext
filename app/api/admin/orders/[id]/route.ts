import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import {
  getMoyskladCustomerOrderStates,
  MoyskladError,
  setMoyskladCustomerOrderState,
} from "@/lib/moysklad";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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
    !("decision" in body) ||
    (body.decision !== "paid" && body.decision !== "rejected") ||
    !("stateId" in body) ||
    typeof body.stateId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.stateId)
  ) {
    return NextResponse.json(
      { error: "Выберите корректное действие и статус МойСклад." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      moyskladOrderId: true,
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден." }, { status: 404 });
  }
  if (order.status !== "PENDING") {
    return NextResponse.json(
      { error: "Этот заказ уже обработан." },
      { status: 409 },
    );
  }
  if (!order.moyskladOrderId) {
    return NextResponse.json(
      { error: "Заказ ещё не связан с документом МойСклад." },
      { status: 409 },
    );
  }

  try {
    const states = await getMoyskladCustomerOrderStates();
    const selectedState = states.find((state) => state.id === body.stateId);
    if (!selectedState) {
      return NextResponse.json(
        { error: "Выбранный статус не найден в МойСклад. Обновите список." },
        { status: 409 },
      );
    }

    const moyskladStatus = await setMoyskladCustomerOrderState(
      order.moyskladOrderId,
      selectedState.id,
    );
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: body.decision === "paid" ? "PAID" : "REJECTED",
        moyskladStatus: moyskladStatus.name,
        moyskladStatusType: moyskladStatus.type,
      },
      select: { id: true, status: true, moyskladStatus: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(`Не удалось изменить статус заказа ${order.id}.`, error);
    return NextResponse.json(
      {
        error:
          error instanceof MoyskladError
            ? error.message
            : "Не удалось сохранить статус заказа.",
      },
      { status: error instanceof MoyskladError ? 502 : 500 },
    );
  }
}
