import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import {
  getMoyskladCustomerOrderStates,
  MoyskladError,
} from "@/lib/moysklad";

export async function GET() {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  try {
    return NextResponse.json(await getMoyskladCustomerOrderStates(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Не удалось загрузить статусы заказов МойСклад.", error);
    return NextResponse.json(
      {
        error:
          error instanceof MoyskladError
            ? error.message
            : "Не удалось загрузить статусы заказов из МойСклад.",
      },
      { status: error instanceof MoyskladError ? 502 : 500 },
    );
  }
}
