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

function jsonSafe(value: any): any {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd (monday)
  const mode = url.searchParams.get("mode") ?? "closed_completed"; // closed_completed | created_all
  const includeRaw = url.searchParams.get("raw") === "1";

  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);

  try {
    const square = getSquareClient();
    const query =
      mode === "created_all"
        ? {
            filter: {
              dateTimeFilter: {
                createdAt: {
                  startAt: toIsoNoMillis(range.weekStart),
                  endAt: toIsoNoMillis(range.weekEnd),
                },
              },
            },
            sort: { sortField: "CREATED_AT" as const, sortOrder: "DESC" as const },
          }
        : {
            filter: {
              dateTimeFilter: {
                closedAt: {
                  startAt: toIsoNoMillis(range.weekStart),
                  endAt: toIsoNoMillis(range.weekEnd),
                },
              },
              stateFilter: { states: ["COMPLETED" as const] },
            },
            sort: { sortField: "CLOSED_AT" as const, sortOrder: "DESC" as const },
          };

    const res = await square.orders.search({
      locationIds: [locationId],
      limit: 5,
      query,
      returnEntries: false,
    });

    const orders: any[] =
      (res as any)?.data?.orders ??
      (res as any)?.orders ??
      (res as any)?.result?.orders ??
      [];

    const rawSample = orders[0];
    return NextResponse.json({
      ok: true,
      locationId,
      mode,
      range: {
        weekStart: range.weekStart.toISOString(),
        weekEnd: range.weekEnd.toISOString(),
        startAt: toIsoNoMillis(range.weekStart),
        endAt: toIsoNoMillis(range.weekEnd),
      },
      responseDebug: {
        typeof: typeof res,
        ctor: (res as any)?.constructor?.name,
        topKeys: Object.keys((res as any) ?? {}),
        hasData: Boolean((res as any)?.data),
        dataKeys: Object.keys((res as any)?.data ?? {}),
        hasResult: Boolean((res as any)?.result),
        resultKeys: Object.keys((res as any)?.result ?? {}),
      },
      sampleCount: orders.length,
      sample: orders.map((o) => ({
        id: o.id,
        state: o.state,
        createdAt: o.createdAt,
        closedAt: o.closedAt,
        tenders: Array.isArray(o.tenders) ? o.tenders.length : undefined,
        tenderIds: o.tenderIds,
        paymentIds: o.paymentIds,
        totalMoney: moneyAmount(o.totalMoney),
        totalGrossSalesMoney: moneyAmount(o.totalGrossSalesMoney),
        totalDiscountMoney: moneyAmount(o.totalDiscountMoney),
        totalRefundedMoney: moneyAmount(o.totalRefundedMoney),
        totalTaxMoney: moneyAmount(o.totalTaxMoney),
        totalTipMoney: moneyAmount(o.totalTipMoney),
        source: o.source,
      })),
      rawKeys: includeRaw && rawSample ? Object.keys(rawSample) : undefined,
      raw: includeRaw ? jsonSafe(rawSample) : undefined,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

