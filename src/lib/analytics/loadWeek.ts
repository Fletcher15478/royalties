import {
  getWeekRangeMondayToMondayInTimeZone,
  type WeekRange,
} from "@/lib/dates/weekRange";
import { aggregateAnalyticsWeek, aggregateSalesWeek } from "@/lib/analytics/aggregate";
import { fetchAnalyticsOrders } from "@/lib/analytics/ordersFetch";
import { getAnalyticsLocations } from "@/lib/analytics/locations";
import type {
  FlavorAggregate,
  LocationProductMetrics,
  LocationSalesSnapshot,
} from "@/lib/analytics/types";

const TZ = "America/New_York";

export type AnalyticsWeekDetail = "full" | "sales";

export type AnalyticsWeekPayload = {
  weekStartYmd: string;
  detail: AnalyticsWeekDetail;
  salesByLocation: Record<string, LocationSalesSnapshot>;
  productsByLocation?: Record<string, LocationProductMetrics>;
  companyFlavors?: FlavorAggregate[];
};

function weekRangeFromMondayYmd(mondayYmd: string): WeekRange {
  const anchor = new Date(`${mondayYmd}T12:00:00.000Z`);
  return getWeekRangeMondayToMondayInTimeZone(anchor, TZ);
}

function mapToRecord<T>(map: Map<string, T>): Record<string, T> {
  return Object.fromEntries(map.entries());
}

/** Load one reporting week from Square — designed for single-week API routes. */
export async function loadAnalyticsWeek(
  weekStartYmd: string,
  detail: AnalyticsWeekDetail
): Promise<AnalyticsWeekPayload> {
  const locations = getAnalyticsLocations();
  const locationIds = locations.map((l) => l.id);
  const range = weekRangeFromMondayYmd(weekStartYmd);
  const orders = await fetchAnalyticsOrders(locationIds, range);

  if (detail === "sales") {
    const { salesByLocation } = aggregateSalesWeek(orders, locationIds);
    return {
      weekStartYmd,
      detail,
      salesByLocation: mapToRecord(salesByLocation),
    };
  }

  const agg = aggregateAnalyticsWeek(orders, locationIds);
  return {
    weekStartYmd,
    detail,
    salesByLocation: mapToRecord(agg.salesByLocation),
    productsByLocation: mapToRecord(agg.productsByLocation),
    companyFlavors: agg.companyFlavors,
  };
}
