import type { WeekRange } from "@/lib/dates/weekRange";
import { computeRoyalties, type RoyaltyLine } from "@/lib/royalties/calc";
import { getLocationWeeklyDetail, type LocationWeeklyDetail } from "@/lib/square/locationDetail";
import { aggregateDeliveryRecords } from "@/lib/square/delivery/aggregate";
import { syncDeliveryRoyaltiesForLocation } from "@/lib/square/delivery/service";
import type { DeliveryRoyaltyRecord, DeliveryWeekTotals } from "@/lib/square/delivery/types";

export type LocationRoyaltyBundle = {
  detail: LocationWeeklyDetail;
  deliveryRecords: DeliveryRoyaltyRecord[];
  delivery: DeliveryWeekTotals;
  inStoreNetSales: number;
  deliveryNetSales: number;
  combinedNetSales: number;
  royalty: RoyaltyLine;
};

/**
 * In-store Square detail + third-party delivery (live from Square) + royalty on combined net.
 */
export async function loadLocationRoyaltyBundle(params: {
  locationId: string;
  range: WeekRange;
  timeZone?: string;
}): Promise<LocationRoyaltyBundle> {
  const tz = params.timeZone ?? "America/New_York";
  const detail = await getLocationWeeklyDetail(params.locationId, params.range, { timeZone: tz });
  const { records } = await syncDeliveryRoyaltiesForLocation({
    locationId: params.locationId,
    range: params.range,
    timeZone: tz,
  });
  const delivery = aggregateDeliveryRecords(records);
  const inStoreNetSales = detail.netSales;
  const deliveryNetSales = delivery.netRoyaltyEligible;
  const combinedNetSales = inStoreNetSales + deliveryNetSales;

  const royalty = computeRoyalties(params.locationId, combinedNetSales, {
    weekStartYmd: detail.weekStart,
    weekEndYmd: detail.weekEnd,
    techFeeCadence: "monthly",
    inStoreNetSales,
    deliveryNetSales,
    delivery,
  });

  return {
    detail,
    deliveryRecords: records,
    delivery,
    inStoreNetSales,
    deliveryNetSales,
    combinedNetSales,
    royalty,
  };
}
