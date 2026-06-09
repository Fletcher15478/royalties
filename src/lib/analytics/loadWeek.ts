import { getWeekRangeMondayToMondayInTimeZone, type WeekRange } from "@/lib/dates/weekRange";
import { aggregateAnalyticsWeek, aggregateSalesWeek } from "@/lib/analytics/aggregate";
import { shouldExcludeFromInStoreSales } from "@/lib/analytics/exclusions";
import { fetchAnalyticsOrders, mapLimit } from "@/lib/analytics/ordersFetch";
import { getAnalyticsLocations } from "@/lib/analytics/locations";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";
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
  const weeklyDetail = await getLocationWeeklyDetail(locationId, range, {
    timeZone: TZ,
    forceSquare: true,
  });

  const salesByLocation: Record<string, LocationSalesSnapshot> = {
    [locationId]: snapshotFromDetail(locationId, weeklyDetail),
  };

  if (detail === "sales") {
    return { weekStartYmd, detail, salesByLocation };
  }

  const orders = await fetchAnalyticsOrders([locationId], range);
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

export function mergeLocationWeekPayloads(
  weekStartYmd: string,
  detail: AnalyticsWeekDetail,
  parts: AnalyticsWeekPayload[]
): AnalyticsWeekPayload {
  const salesByLocation: Record<string, LocationSalesSnapshot> = {};
  const productsByLocation: Record<string, LocationProductMetrics> = {};
  const flavorMap = new Map<string, FlavorAggregate>();

  for (const part of parts) {
    Object.assign(salesByLocation, part.salesByLocation);
    if (part.productsByLocation) Object.assign(productsByLocation, part.productsByLocation);
    for (const f of part.companyFlavors ?? []) {
      const cur = flavorMap.get(f.name) ?? { name: f.name, units: 0, revenue: 0 };
      cur.units += f.units;
      cur.revenue += f.revenue;
      flavorMap.set(f.name, cur);
    }
  }

  return {
    weekStartYmd,
    detail,
    salesByLocation,
    productsByLocation: detail === "full" ? productsByLocation : undefined,
    companyFlavors:
      detail === "full" ? [...flavorMap.values()].sort((a, b) => b.units - a.units) : undefined,
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
