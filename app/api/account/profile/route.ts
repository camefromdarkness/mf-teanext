import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizeRussianPhone } from "@/lib/phone";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, phoneNumber: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Аккаунт не найден." }, { status: 404 });
  }

  return NextResponse.json(user, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
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
    !("name" in body) ||
    typeof body.name !== "string" ||
    !("phoneNumber" in body) ||
    typeof body.phoneNumber !== "string"
  ) {
    return NextResponse.json(
      { error: "Укажите имя и номер телефона." },
      { status: 400 },
    );
  }

  const name = body.name.trim();
  const rawPhoneNumber = body.phoneNumber.trim();
  if (name.length > 120) {
    return NextResponse.json(
      { error: "Имя должно быть не длиннее 120 символов." },
      { status: 400 },
    );
  }
  const phoneNumber = rawPhoneNumber
    ? normalizeRussianPhone(rawPhoneNumber)
    : "";
  if (rawPhoneNumber && !phoneNumber) {
    return NextResponse.json(
      {
        error:
          "Введите корректный российский номер: 10 цифр, начиная с 3–9. Подойдут форматы +7, 8 или номер без кода страны.",
      },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: name || null,
        phoneNumber: phoneNumber || null,
      },
      select: { name: true, phoneNumber: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("Не удалось обновить профиль пользователя.", error);
    return NextResponse.json(
      { error: "Не удалось сохранить профиль. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
