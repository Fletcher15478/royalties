import { format } from "date-fns";
import { getSquareClient } from "@/lib/square/client";
import { toIsoNoMillis, type WeekRange } from "@/lib/dates/weekRange";

type Money = { amount?: bigint | number | null } | null | undefined;

function moneyToCents(m: Money): number {
  if (!m?.amount) return 0;
  // Square SDK may represent amounts as bigint in Node.
  const a: any = m.amount;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export type LocationWeeklySummary = {
  locationId: string;
  weekStart: string;
  weekEnd: string;

  ordersCount: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;

  // For spot-checking when Square doesn't have CLOSED_AT/COMPLETED data:
  source: "closed_completed" | "created_all";
};

/**
 * Square-backed weekly summary using Orders Search.
 *
 * Notes / constraints:
 * - Excludes taxes and tips by using `totalGrossSalesMoney` when present.
 * - Discounts: uses order-level `totalDiscountMoney` when present.
 * - Returns: uses order-level `totalRefundedMoney` when present.
 * - Gift card loads: not represented as normal orders; we'll explicitly exclude gift-card-only orders later
 *   when we add line-item inspection (catalog object types).
 */
export async function getLocationWeeklySummary(
  locationId: string,
  range: WeekRange
): Promise<LocationWeeklySummary> {
  const square = getSquareClient();

  async function runSearch(mode: "closed_completed" | "created_all") {
    let cursor: string | undefined;
    let ordersCount = 0;
    let grossCents = 0;
    let discountCents = 0;
    let refundCents = 0;

    do {
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
              sort: { sortField: "CREATED_AT" as const, sortOrder: "ASC" as const },
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
              sort: { sortField: "CLOSED_AT" as const, sortOrder: "ASC" as const },
            };

      const res = await square.orders.search({
        locationIds: [locationId],
        cursor,
        limit: 100,
        query,
        returnEntries: false,
      });

      const orders: any[] =
        (res as any)?.data?.orders ??
        (res as any)?.orders ??
        (res as any)?.result?.orders ??
        [];

      for (const o of orders) {
        ordersCount += 1;
        grossCents += moneyToCents(o?.totalGrossSalesMoney) || moneyToCents(o?.totalMoney);
        discountCents += moneyToCents(o?.totalDiscountMoney);
        refundCents += moneyToCents(o?.totalRefundedMoney);
      }

      cursor =
        (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
    } while (cursor);

    return { ordersCount, grossCents, discountCents, refundCents };
  }

  let source: LocationWeeklySummary["source"] = "closed_completed";
  let { ordersCount, grossCents, discountCents, refundCents } = await runSearch("closed_completed");
  if (ordersCount === 0) {
    // Fallback for debugging/spot-checking when CLOSED_AT/COMPLETED data isn't present.
    source = "created_all";
    ({ ordersCount, grossCents, discountCents, refundCents } = await runSearch("created_all"));
  }

  const netCents = grossCents - discountCents - refundCents;

  return {
    locationId,
    weekStart: format(range.weekStart, "yyyy-MM-dd"),
    weekEnd: format(range.weekEnd, "yyyy-MM-dd"),
    ordersCount,
    grossSales: centsToDollars(grossCents),
    discounts: centsToDollars(discountCents),
    returns: centsToDollars(refundCents),
    netSales: centsToDollars(netCents),
    source,
  };
}

