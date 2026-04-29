import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMonday, toIsoNoMillis } from "@/lib/dates/weekRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function moneyToCents(m: any): number {
  const a = m?.amount;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  if (!locationId) return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });

  const grossCents = Number(url.searchParams.get("grossCents") ?? "0");
  const tipCents = Number(url.searchParams.get("tipCents") ?? "0");
  const taxCents = Number(url.searchParams.get("taxCents") ?? "0");

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  const square = getSquareClient();
  let cursor: string | undefined;
  const matches: any[] = [];

  do {
    const res = await square.orders.search({
      locationIds: [locationId],
      cursor,
      limit: 100,
      query: {
        filter: { dateTimeFilter: { closedAt: { startAt, endAt } }, stateFilter: { states: ["COMPLETED"] } },
        sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
      },
      returnEntries: false,
    });

    const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];
    for (const o of orders) {
      const lineItems: any[] = o?.lineItems ?? [];
      const regular = lineItems.filter((li) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD");
      const g = regular.reduce((s, li) => s + moneyToCents(li?.grossSalesMoney), 0);
      const tip = moneyToCents(o?.totalTipMoney);
      const tax = moneyToCents(o?.totalTaxMoney);
      if (grossCents && g !== grossCents) continue;
      if (tipCents && tip !== tipCents) continue;
      if (taxCents && tax !== taxCents) continue;

      matches.push({
        id: o?.id,
        closedAt: o?.closedAt,
        source: o?.source?.name,
        fulfillments: (o?.fulfillments ?? []).map((f: any) => f?.type),
        tenders: Array.isArray(o?.tenders) ? o.tenders.map((t: any) => ({ type: t?.type, amount: moneyToCents(t?.amountMoney) })) : [],
        paymentIds: o?.paymentIds ?? [],
        tenderIds: o?.tenderIds ?? [],
        gross: g,
        tip,
        tax,
        total: moneyToCents(o?.totalMoney),
      });
      if (matches.length >= 20) break;
    }

    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
  } while (cursor && matches.length < 20);

  return NextResponse.json({ ok: true, locationId, range: { startAt, endAt }, query: { grossCents, tipCents, taxCents }, count: matches.length, matches });
}

