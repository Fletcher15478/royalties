import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } from "@/lib/dates/weekRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function moneyAmount(m: any) {
  const a = m?.amount;
  if (a == null) return null;
  return typeof a === "bigint" ? a.toString() : Number(a);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  const tz = url.searchParams.get("tz") ?? "America/New_York";
  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, tz);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  try {
    const square = getSquareClient();
    const res = await square.orders.calculate({
      locationIds: [locationId],
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    } as any);

    const calc = (res as any)?.data ?? (res as any)?.result ?? res;
    return NextResponse.json({
      ok: true,
      locationId,
      tz,
      range: { startAt, endAt },
      topKeys: Object.keys((res as any) ?? {}),
      calcKeys: Object.keys((calc as any) ?? {}),
      calculation: {
        totalOrders: calc?.ordersCount ?? calc?.orderCount ?? calc?.count,
        totalMoney: moneyAmount(calc?.totalMoney),
        totalTaxMoney: moneyAmount(calc?.totalTaxMoney),
        totalTipMoney: moneyAmount(calc?.totalTipMoney),
        totalDiscountMoney: moneyAmount(calc?.totalDiscountMoney),
        totalServiceChargeMoney: moneyAmount(calc?.totalServiceChargeMoney),
        // Some variants
        netAmounts: calc?.netAmounts ? Object.keys(calc.netAmounts) : undefined,
      },
      raw: calc,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

