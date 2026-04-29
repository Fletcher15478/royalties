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

function isDeliveryOrder(order: any): boolean {
  const fulfillments: any[] = order?.fulfillments ?? [];
  return fulfillments.some((f) => String(f?.type).toUpperCase() === "DELIVERY");
}

function looksLikeExternalDelivery(order: any): boolean {
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (src.includes("doordash") || src.includes("uber") || src.includes("grubhub")) return true;
  const serviceCharges: any[] = order?.serviceCharges ?? [];
  const scText = serviceCharges.map((s) => String(s?.name ?? "")).join(" ").toLowerCase();
  if (scText.includes("doordash") || scText.includes("uber") || scText.includes("grubhub")) return true;
  return false;
}

function looksLikeDeliveryOrOnlineByContent(order: any): boolean {
  const taxes: any[] = order?.taxes ?? [];
  const taxText = taxes.map((t) => String(t?.name ?? "")).join(" ").toLowerCase();
  if (taxText.includes("doordash") || taxText.includes("uber") || taxText.includes("grubhub")) return true;
  if (taxText.includes("remitted")) return true;
  return false;
}

function shouldExcludeSquareOnlineOrder(order: any, locationId: string): boolean {
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (!src.includes("square online")) return false;
  const SOUTH_FAYETTE_LOCATION_ID = "LZGJ6T9JYFG7W";
  if (locationId !== SOUTH_FAYETTE_LOCATION_ID) return false;
  const tipCents = moneyToCents(order?.totalTipMoney);
  if (tipCents > 0) return true;
  const lineItems: any[] = order?.lineItems ?? [];
  const names = lineItems.map((li) => String(li?.name ?? "").trim().toLowerCase()).filter(Boolean);
  if (names.length > 0 && names.every((n) => n === "classic scoop")) return true;
  return false;
}

function isPaidOrder(order: any): boolean {
  const tenders = order?.tenders;
  if (Array.isArray(tenders) && tenders.length > 0) return true;
  if (Array.isArray(order?.paymentIds) && order.paymentIds.length > 0) return true;
  if (Array.isArray(order?.tenderIds) && order.tenderIds.length > 0) return true;
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  const square = getSquareClient();
  let cursor: string | undefined;

  const excluded: Record<string, { count: number; grossCents: number; sampleIds: string[] }> = {
    deliveryOrExternal: { count: 0, grossCents: 0, sampleIds: [] },
    byTaxContent: { count: 0, grossCents: 0, sampleIds: [] },
    squareOnlineHeuristic: { count: 0, grossCents: 0, sampleIds: [] },
    unpaid: { count: 0, grossCents: 0, sampleIds: [] },
  };

  const included = { count: 0, grossCents: 0 };

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

      const ex1 = isDeliveryOrder(o) || looksLikeExternalDelivery(o);
      const ex2 = looksLikeDeliveryOrOnlineByContent(o);
      const ex3 = shouldExcludeSquareOnlineOrder(o, locationId);
      const paid = isPaidOrder(o);

      const add = (key: keyof typeof excluded) => {
        excluded[key].count += 1;
        excluded[key].grossCents += g;
        if (excluded[key].sampleIds.length < 10 && o?.id) excluded[key].sampleIds.push(String(o.id));
      };

      if (ex1) add("deliveryOrExternal");
      else if (ex2) add("byTaxContent");
      else if (ex3) add("squareOnlineHeuristic");
      else if (!paid) add("unpaid");
      else {
        included.count += 1;
        included.grossCents += g;
      }
    }

    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
  } while (cursor);

  return NextResponse.json({
    ok: true,
    locationId,
    range: { startAt, endAt },
    included: { ...included, gross: included.grossCents / 100 },
    excluded: Object.fromEntries(
      Object.entries(excluded).map(([k, v]) => [k, { ...v, gross: v.grossCents / 100 }])
    ),
  });
}

