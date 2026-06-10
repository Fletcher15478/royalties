import type { WeekRange } from "@/lib/dates/weekRange";
import { leadershipNetOverride } from "@/lib/analytics/leadershipWeeklyNet";
import type { LocationSalesSnapshot } from "@/lib/analytics/types";
import { aggregateDeliveryRecords } from "@/lib/square/delivery/aggregate";
import { syncDeliveryRoyaltiesForLocation } from "@/lib/square/delivery/service";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";

/**
 * Leadership workbook net = Square in-store net + third-party delivery net.
 * Gross is in-store gross + delivery merchandise gross so net never exceeds gross.
 */
export async function loadLeadershipSalesSnapshot(
  locationId: string,
  range: WeekRange,
  timeZone: string
): Promise<LocationSalesSnapshot> {
  const override = leadershipNetOverride(range, timeZone, locationId);

  const [detail, { records }] = await Promise.all([
    getLocationWeeklyDetail(locationId, range, { timeZone, forceSquare: true }),
    syncDeliveryRoyaltiesForLocation({ locationId, range, timeZone }),
  ]);
  const delivery = aggregateDeliveryRecords(records);

  const netSales = override ?? detail.netSales + delivery.netRoyaltyEligible;
  const grossSales = detail.grossSales + delivery.grossSales;

  return {
    locationId,
    ordersCount: detail.ordersCount,
    grossSales,
    discounts: detail.discounts,
    refunds: detail.refunds,
    netSales,
  };
}
