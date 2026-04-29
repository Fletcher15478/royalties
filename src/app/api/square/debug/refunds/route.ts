import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMonday, toIsoNoMillis } from "@/lib/dates/weekRange";

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
  const week = url.searchParams.get("week"); // yyyy-MM-dd (monday)

  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);

  try {
    const square = getSquareClient();
    const res = await square.refunds.list({
      locationId,
      beginTime: toIsoNoMillis(range.weekStart),
      endTime: toIsoNoMillis(range.weekEnd),
      sortOrder: "DESC",
      limit: 20,
    } as any);

    const refunds: any[] =
      (res as any)?.data?.refunds ??
      (res as any)?.refunds ??
      (res as any)?.result?.refunds ??
      [];

    return NextResponse.json({
      ok: true,
      locationId,
      range: {
        weekStart: range.weekStart.toISOString(),
        weekEnd: range.weekEnd.toISOString(),
        beginTime: toIsoNoMillis(range.weekStart),
        endTime: toIsoNoMillis(range.weekEnd),
      },
      responseDebug: { topKeys: Object.keys((res as any) ?? {}) },
      count: refunds.length,
      sample: refunds.slice(0, 10).map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        amountMoney: moneyAmount(r.amountMoney),
        paymentId: r.paymentId,
        orderId: r.orderId,
      })),
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

