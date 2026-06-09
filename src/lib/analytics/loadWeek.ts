import "server-only";

import { getWeekRangeMondayToMondayInTimeZone, type WeekRange } from "@/lib/dates/weekRange";
import { aggregateAnalyticsWeek, aggregateSalesWeek } from "@/lib/analytics/aggregate";
import { shouldExcludeFromInStoreSales } from "@/lib/analytics/exclusions";
import { fetchAnalyticsOrders, mapLimit } from "@/lib/analytics/ordersFetch";
import { getAnalyticsLocations } from "@/lib/analytics/locations";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";
import {
  mergeLocationWeekPayloads,
  type AnalyticsWeekDetail,
  type AnalyticsWeekPayload,
} from "@/lib/analytics/weekPayload";
import type { LocationSalesSnapshot } from "@/lib/analytics/types";

export type { AnalyticsWeekDetail, AnalyticsWeekPayload } from "@/lib/analytics/weekPayload";
export { mergeLocationWeekPayloads } from "@/lib/analytics/weekPayload";

const TZ = "America/New_York";

function weekRangeFromMondayYmd(mondayYmd: string): WeekRange {
  const anchor = new Date(`${mondayYmd}T12:00:00.000Z`);
  return getWeekRangeMondayToMondayInTimeZone(anchor, TZ);
}

function snapshotFromDetail(
  locationId: string,
  detail: Awaited<ReturnType<typeof getLocationWeeklyDetail>>
): LocationSalesSnapshot {
  return {
    locationId,
    ordersCount: detail.ordersCount,
    grossSales: detail.grossSales,
    discounts: detail.discounts,
    refunds: detail.refunds,
    netSales: detail.netSales,
  };
}

/** One location, one week — in-store net sales aligned to leadership spreadsheet. */
export async function loadAnalyticsLocationWeek(
  locationId: string,
  weekStartYmd: string,
  detail: AnalyticsWeekDetail
): Promise<AnalyticsWeekPayload> {
  const range = weekRangeFromMondayYmd(weekStartYmd);

  if (detail === "sales") {
    const weeklyDetail = await getLocationWeeklyDetail(locationId, range, {
      timeZone: TZ,
      forceSquare: true,
    });
    return {
      weekStartYmd,
      detail,
      salesByLocation: { [locationId]: snapshotFromDetail(locationId, weeklyDetail) },
    };
  }

  const [weeklyDetail, orders] = await Promise.all([
    getLocationWeeklyDetail(locationId, range, { timeZone: TZ, forceSquare: true }),
    fetchAnalyticsOrders([locationId], range),
  ]);

  const salesByLocation: Record<string, LocationSalesSnapshot> = {
    [locationId]: snapshotFromDetail(locationId, weeklyDetail),
  };

  const inStoreOrders = orders.filter((o) => !shouldExcludeFromInStoreSales(o, locationId));
  const agg = aggregateAnalyticsWeek(inStoreOrders, [locationId]);
  const products = agg.productsByLocation.get(locationId);

  return {
    weekStartYmd,
    detail,
    salesByLocation,
    productsByLocation: products ? { [locationId]: products } : undefined,
    companyFlavors: agg.companyFlavors,
  };
}

/** Batched trend week with in-store order exclusions. */
export async function loadAnalyticsTrendWeek(weekStartYmd: string): Promise<AnalyticsWeekPayload> {
  const locations = getAnalyticsLocations();
  const locationIds = locations.map((l) => l.id);
  const range = weekRangeFromMondayYmd(weekStartYmd);
  const orders = await fetchAnalyticsOrders(locationIds, range);

  const inStoreOrders: any[] = [];
  for (const order of orders) {
    const locationId = String(order?.locationId ?? order?.location_id ?? "");
    if (!locationIds.includes(locationId)) continue;
    if (shouldExcludeFromInStoreSales(order, locationId)) continue;
    inStoreOrders.push(order);
  }

  const { salesByLocation } = aggregateSalesWeek(inStoreOrders, locationIds);
  return {
    weekStartYmd,
    detail: "sales",
    salesByLocation: Object.fromEntries(salesByLocation.entries()),
  };
}

export async function loadAnalyticsWeekMerged(
  weekStartYmd: string,
  detail: AnalyticsWeekDetail
): Promise<AnalyticsWeekPayload> {
  const locations = getAnalyticsLocations();
  const parts = await mapLimit(locations, 3, (loc) =>
    loadAnalyticsLocationWeek(loc.id, weekStartYmd, detail)
  );
  return mergeLocationWeekPayloads(weekStartYmd, detail, parts);
}

/** @deprecated Use loadAnalyticsLocationWeek from the location-week API. */
export async function loadAnalyticsWeek(
  weekStartYmd: string,
  detail: AnalyticsWeekDetail
): Promise<AnalyticsWeekPayload> {
  return loadAnalyticsWeekMerged(weekStartYmd, detail);
}
