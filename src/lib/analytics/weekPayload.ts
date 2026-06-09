import type {
  FlavorAggregate,
  LocationProductMetrics,
  LocationSalesSnapshot,
} from "@/lib/analytics/types";

export type AnalyticsWeekDetail = "full" | "sales";

export type AnalyticsWeekPayload = {
  weekStartYmd: string;
  detail: AnalyticsWeekDetail;
  salesByLocation: Record<string, LocationSalesSnapshot>;
  productsByLocation?: Record<string, LocationProductMetrics>;
  companyFlavors?: FlavorAggregate[];
};

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
