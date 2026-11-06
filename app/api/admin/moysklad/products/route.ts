import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import {
  getMoyskladProduct,
  MoyskladError,
  searchMoyskladProducts,
} from "@/lib/moysklad";

export async function GET(request: Request) {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const query = url.searchParams.get("q")?.trim();
  if (id) {
    try {
      return NextResponse.json(await getMoyskladProduct(id));
    } catch (error) {
      console.error("Не удалось получить товар из МойСклад.", error);
      return NextResponse.json(
        {
          error:
            error instanceof MoyskladError
              ? error.message
              : "Не удалось получить товар из МойСклад.",
        },
        { status: error instanceof MoyskladError ? 502 : 500 },
      );
    }
  }

  if (!query || query.length > 200) {
    return NextResponse.json(
      { error: "Введите название или артикул товара для поиска." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await searchMoyskladProducts(query));
  } catch (error) {
    console.error("Не удалось найти товары в МойСклад.", error);
    return NextResponse.json(
      {
        error:
          error instanceof MoyskladError
            ? error.message
            : "Не удалось найти товары в МойСклад.",
      },
      { status: error instanceof MoyskladError ? 502 : 500 },
    );
  }
}
