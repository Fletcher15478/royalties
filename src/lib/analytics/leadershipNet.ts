import type { WeekRange } from "@/lib/dates/weekRange";
import { leadershipNetOverride } from "@/lib/analytics/leadershipWeeklyNet";
import type { LocationSalesSnapshot } from "@/lib/analytics/types";
import { loadLocationRoyaltyBundle } from "@/lib/royalties/locationBundle";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";

/**
 * Leadership workbook net = Square in-store net + third-party delivery net.
 * Uses workbook overrides when loaded for that ET week; otherwise live Square via royalty bundle.
 */
export async function loadLeadershipSalesSnapshot(
  locationId: string,
  range: WeekRange,
  timeZone: string
): Promise<LocationSalesSnapshot> {
  const override = leadershipNetOverride(range, timeZone, locationId);

  const [detail, bundle] = await Promise.all([
    getLocationWeeklyDetail(locationId, range, { timeZone, forceSquare: true }),
    override == null
      ? loadLocationRoyaltyBundle({ locationId, range, timeZone })
      : Promise.resolve(null),
  ]);

  const netSales = override ?? bundle!.combinedNetSales;

  return {
    locationId,
    ordersCount: detail.ordersCount,
    grossSales: detail.grossSales,
    discounts: detail.discounts,
    refunds: detail.refunds,
    netSales,
  };
}
