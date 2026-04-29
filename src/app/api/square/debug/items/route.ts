import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } from "@/lib/dates/weekRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Money = { amount?: bigint | number | null } | null | undefined;

function moneyToCents(m: Money): number {
  const a: any = (m as any)?.amount;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function keyForLineItem(li: any): string {
  const name = String(li?.name ?? "").trim() || "(Unnamed item)";
  const variation = String(li?.variationName ?? li?.variation_name ?? "").trim();
  const catalogObjectId = String(li?.catalogObjectId ?? li?.catalog_object_id ?? "").trim();
  // Prefer catalog object id when present to avoid name collisions.
  const base = catalogObjectId ? `${name} [${catalogObjectId}]` : name;
  return variation ? `${base} — ${variation}` : base;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd (Monday)
  const tz = url.searchParams.get("tz") ?? "America/New_York";
  const includeGiftCards = url.searchParams.get("includeGiftCards") === "1";

  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, tz);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  try {
    const square = getSquareClient();
    let cursor: string | undefined;

    const byKey: Record<
      string,
      {
        key: string;
        name: string;
        variationName?: string;
        catalogObjectId?: string;
        qty: number;
        orders: number;
        grossCents: number;
        discountCents: number;
        netCents: number;
      }
    > = {};

    const ordersSeen = new Set<string>();
    let completedOrders = 0;
    let lineItemsCount = 0;

    do {
      const res = await square.orders.search({
        locationIds: [locationId],
        cursor,
        limit: 100,
        query: {
          filter: {
            dateTimeFilter: { closedAt: { startAt, endAt } },
            stateFilter: { states: ["COMPLETED" as const] },
          },
          sort: { sortField: "CLOSED_AT" as const, sortOrder: "ASC" as const },
        },
        returnEntries: false,
      });

      const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];

      for (const o of orders) {
        completedOrders += 1;
        if (o?.id) ordersSeen.add(String(o.id));

        const lineItems: any[] = o?.lineItems ?? [];
        for (const li of lineItems) {
          const itemType = String(li?.itemType ?? li?.item_type ?? "").toUpperCase();
          if (!includeGiftCards && itemType === "GIFT_CARD") continue;

          const key = keyForLineItem(li);
          const qtyStr = String(li?.quantity ?? "0");
          const qty = Number(qtyStr);
          const qtySafe = Number.isFinite(qty) ? qty : 0;

          const grossCents = moneyToCents(li?.grossSalesMoney ?? li?.gross_sales_money);
          const discountCents = moneyToCents(li?.totalDiscountMoney ?? li?.total_discount_money);
          const netCents = grossCents - discountCents;

          const name = String(li?.name ?? "").trim() || "(Unnamed item)";
          const variationName = String(li?.variationName ?? li?.variation_name ?? "").trim() || undefined;
          const catalogObjectId = String(li?.catalogObjectId ?? li?.catalog_object_id ?? "").trim() || undefined;

          const cur =
            byKey[key] ??
            (byKey[key] = {
              key,
              name,
              variationName,
              catalogObjectId,
              qty: 0,
              orders: 0,
              grossCents: 0,
              discountCents: 0,
              netCents: 0,
            });

          cur.qty += qtySafe;
          cur.grossCents += grossCents;
          cur.discountCents += discountCents;
          cur.netCents += netCents;
          lineItemsCount += 1;

          // Count distinct orders per item key.
          // If an order has multiple lines with same key, still count as 1 order.
          const orderKey = `${String(o?.id ?? "")}:${key}`;
          if (!(cur as any)._orderKeys) (cur as any)._orderKeys = new Set<string>();
          const s: Set<string> = (cur as any)._orderKeys;
          if (!s.has(orderKey)) {
            s.add(orderKey);
            cur.orders += 1;
          }
        }
      }

      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
    } while (cursor);

    const items = Object.values(byKey)
      .map((x) => ({
        key: x.key,
        name: x.name,
        variationName: x.variationName,
        catalogObjectId: x.catalogObjectId,
        qty: x.qty,
        orders: x.orders,
        gross: centsToDollars(x.grossCents),
        discounts: centsToDollars(x.discountCents),
        net: centsToDollars(x.netCents),
      }))
      .sort((a, b) => b.gross - a.gross);

    return NextResponse.json({
      ok: true,
      locationId,
      tz,
      range: { startAt, endAt },
      includeGiftCards,
      totals: {
        completedOrders,
        distinctOrderIds: ordersSeen.size,
        lineItemsCount,
        uniqueItems: items.length,
        gross: centsToDollars(items.reduce((s, x) => s + Math.round(x.gross * 100), 0)),
      },
      items,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

