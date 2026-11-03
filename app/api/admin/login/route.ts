import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminSessionCookieOptions,
  createAdminSession,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length > 256
  ) {
    return NextResponse.json({ error: "Введите пароль." }, { status: 400 });
  }

  const result = verifyAdminPassword(
    body.password,
    request.headers.get("x-real-ip") ?? "unknown",
  );
  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return NextResponse.json(
        {
          error:
            "На сервере не настроены ADMIN_PASSWORD и ADMIN_SESSION_SECRET. Проверьте файл окружения Docker.",
        },
        { status: 503 },
      );
    }
    if (result.reason === "rate-limited") {
      return NextResponse.json(
        { error: "Слишком много попыток. Попробуйте через 15 минут." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Неверный пароль." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    createAdminSession(),
    adminSessionCookieOptions,
  );
  return response;
}
