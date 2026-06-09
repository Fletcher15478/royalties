import "server-only";

import { getWeekRangeMondayToMondayInTimeZone, type WeekRange } from "@/lib/dates/weekRange";
import { aggregateAnalyticsWeek } from "@/lib/analytics/aggregate";
import { shouldExcludeFromInStoreSales } from "@/lib/analytics/exclusions";
import { fetchAnalyticsOrders, mapLimit } from "@/lib/analytics/ordersFetch";
import { getAnalyticsLocations } from "@/lib/analytics/locations";
import { loadLeadershipSalesSnapshot } from "@/lib/analytics/leadershipNet";
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

function loadLeadershipSalesSnapshotForWeek(
  locationId: string,
  range: WeekRange,
  weekStartYmd: string
): Promise<LocationSalesSnapshot> {
  return loadLeadershipSalesSnapshot(locationId, range, weekStartYmd, TZ);
}

/** One location, one week — net sales aligned to the Monday leadership spreadsheet. */
export async function loadAnalyticsLocationWeek(
  locationId: string,
  weekStartYmd: string,
  detail: AnalyticsWeekDetail
): Promise<AnalyticsWeekPayload> {
  const range = weekRangeFromMondayYmd(weekStartYmd);

  if (detail === "sales") {
    const sales = await loadLeadershipSalesSnapshotForWeek(locationId, range, weekStartYmd);
    return {
      weekStartYmd,
      detail,
      salesByLocation: { [locationId]: sales },
    };
  }

  const [sales, orders] = await Promise.all([
    loadLeadershipSalesSnapshotForWeek(locationId, range, weekStartYmd),
    fetchAnalyticsOrders([locationId], range),
  ]);

  const salesByLocation: Record<string, LocationSalesSnapshot> = {
    [locationId]: sales,
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

/** Batched trend week — leadership net (in-store + third-party delivery) per location. */
export async function loadAnalyticsTrendWeek(weekStartYmd: string): Promise<AnalyticsWeekPayload> {
  const locations = getAnalyticsLocations();
  const range = weekRangeFromMondayYmd(weekStartYmd);
  const snapshots = await mapLimit(locations, 3, (loc) =>
    loadLeadershipSalesSnapshotForWeek(loc.id, range, weekStartYmd)
  );
  return {
    weekStartYmd,
    detail: "sales",
    salesByLocation: Object.fromEntries(snapshots.map((s) => [s.locationId, s])),
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
