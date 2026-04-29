import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMonday, toIsoNoMillis } from "@/lib/dates/weekRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cents(m: any): number {
  const a = m?.amount;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  const endPadMinutes = Number(url.searchParams.get("endPadMinutes") ?? "0");
  const mode = url.searchParams.get("mode") ?? "closed"; // closed | created
  if (!locationId) return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(new Date(range.weekEnd.getTime() + endPadMinutes * 60 * 1000));

  const square = getSquareClient();
  let cursor: string | undefined;

  let orders = 0;
  let sumLineGross = 0;
  let sumDerivedGross = 0;
  let sumTotal = 0;
  let sumTax = 0;
  let sumTip = 0;
  let sumDiscount = 0;

  do {
    const res = await square.orders.search({
      locationIds: [locationId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter:
            mode === "created" ? { createdAt: { startAt, endAt } } : { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
        sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
      },
      returnEntries: false,
    });

    const os: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];
    for (const o of os) {
      orders += 1;
      const lineItems: any[] = o?.lineItems ?? [];
      const regular = lineItems.filter((li) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD");
      const gLine = regular.reduce((s, li) => s + cents(li?.grossSalesMoney), 0);
      const total = cents(o?.totalMoney);
      const tax = cents(o?.totalTaxMoney);
      const tip = cents(o?.totalTipMoney);
      const disc = cents(o?.totalDiscountMoney);

      // Derived gross: remove tax+tip, add discounts back.
      const gDerived = total - tax - tip + disc;

      sumLineGross += gLine;
      sumDerivedGross += gDerived;
      sumTotal += total;
      sumTax += tax;
      sumTip += tip;
      sumDiscount += disc;
    }

    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
  } while (cursor);

  return NextResponse.json({
    ok: true,
    locationId,
    range: { startAt, endAt, endPadMinutes, mode },
    orders,
    sums: {
      lineGross: sumLineGross / 100,
      derivedGross: sumDerivedGross / 100,
      total: sumTotal / 100,
      tax: sumTax / 100,
      tip: sumTip / 100,
      discount: sumDiscount / 100,
    },
  });
}

