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
    const res = await square.payments.list({
      locationId,
      beginTime: toIsoNoMillis(range.weekStart),
      endTime: toIsoNoMillis(range.weekEnd),
      sortOrder: "DESC",
      limit: 5,
    });

    const payments: any[] =
      (res as any)?.data?.payments ??
      (res as any)?.payments ??
      (res as any)?.result?.payments ??
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
      responseDebug: {
        topKeys: Object.keys((res as any) ?? {}),
      },
      sampleCount: payments.length,
      sample: payments.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        status: p.status,
        sourceType: p.sourceType,
        amountMoney: moneyAmount(p.amountMoney),
        tipMoney: moneyAmount(p.tipMoney),
        totalMoney: moneyAmount(p.totalMoney),
        refundedMoney: moneyAmount(p.refundedMoney),
        orderId: p.orderId,
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

