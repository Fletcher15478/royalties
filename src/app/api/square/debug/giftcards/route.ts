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
    const res = await square.giftCards.activities.list({
      locationId,
      beginTime: toIsoNoMillis(range.weekStart),
      endTime: toIsoNoMillis(range.weekEnd),
      sortOrder: "ASC",
      limit: 100,
    } as any);

    const acts: any[] =
      (res as any)?.data?.giftCardActivities ??
      (res as any)?.giftCardActivities ??
      (res as any)?.result?.giftCardActivities ??
      [];

    const byType: Record<string, number> = {};
    for (const a of acts) {
      const t = String(a?.type ?? "UNKNOWN").toUpperCase();
      byType[t] = (byType[t] ?? 0) + 1;
    }

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
      count: acts.length,
      byType,
      sample: acts.slice(0, 15).map((a) => ({
        id: a.id,
        type: a.type,
        createdAt: a.createdAt,
        locationId: a.locationId,
        activateAmount: moneyAmount(a?.activateActivityDetails?.amountMoney),
        loadAmount: moneyAmount(a?.loadActivityDetails?.amountMoney),
        redeemAmount: moneyAmount(a?.redeemActivityDetails?.amountMoney),
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

