import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "Требуется вход администратора." },
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
    !("ids" in body) ||
    !Array.isArray(body.ids) ||
    body.ids.length > 1000 ||
    !body.ids.every(
      (id: unknown) => Number.isSafeInteger(id) && (id as number) > 0,
    ) ||
    new Set(body.ids).size !== body.ids.length
  ) {
    return NextResponse.json(
      { error: "Некорректный порядок товаров." },
      { status: 400 },
    );
  }

  const ids = body.ids as number[];

  try {
    await prisma.$transaction(async (transaction) => {
      const currentTeas = await transaction.tea.findMany({
        select: { id: true },
      });
      if (
        currentTeas.length !== ids.length ||
        currentTeas.some((tea) => !ids.includes(tea.id))
      ) {
        throw new Error("Список товаров изменился. Обновите страницу.");
      }

      for (const [sortOrder, id] of ids.entries()) {
        await transaction.tea.update({
          where: { id },
          data: { sortOrder },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Список товаров изменился. Обновите страницу."
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Не удалось сохранить порядок товаров.", error);
    return NextResponse.json(
      { error: "Не удалось сохранить порядок товаров." },
      { status: 500 },
    );
  }
}
