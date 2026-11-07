import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const editableRoles = ["CUSTOMER", "MANAGER", "ADMIN"] as const;
type EditableRole = (typeof editableRoles)[number];

export async function GET() {
  const access = await authorizeStaff(["ADMIN", "SUPER_ADMIN"]);
  if (!access.authorized) return access.response;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json(users, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Не удалось загрузить пользователей для админ-панели.", error);
    return NextResponse.json(
      { error: "Не удалось загрузить список пользователей." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
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
    !("userId" in body) ||
    typeof body.userId !== "string" ||
    !("role" in body) ||
    typeof body.role !== "string" ||
    !editableRoles.includes(body.role as EditableRole)
  ) {
    return NextResponse.json(
      { error: "Выберите корректную роль пользователя." },
      { status: 400 },
    );
  }

  if (body.userId === access.staff.id) {
    return NextResponse.json(
      { error: "Нельзя менять собственную роль." },
      { status: 409 },
    );
  }
  if (
    access.staff.role === "ADMIN" &&
    body.role !== "MANAGER" &&
    body.role !== "CUSTOMER"
  ) {
    return NextResponse.json(
      { error: "Администратор может назначать только менеджеров." },
      { status: 403 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "Пользователь не найден." },
      { status: 404 },
    );
  }
  if (target.role === "SUPER_ADMIN" && access.staff.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Только супер-администратор может изменить роль другого супер-администратора." },
      { status: 403 },
    );
  }
  if (access.staff.role === "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Администратор не может менять роль другого администратора." },
      { status: 403 },
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.role as EditableRole },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error(`Не удалось изменить роль пользователя ${target.id}.`, error);
    return NextResponse.json(
      { error: "Не удалось изменить роль пользователя." },
      { status: 500 },
    );
  }
}
