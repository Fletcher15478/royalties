import type { WeekRange } from "@/lib/dates/weekRange";
import { LEADERSHIP_WEEKLY_NET } from "@/lib/analytics/leadershipWeeklyNet";
import type { LocationSalesSnapshot } from "@/lib/analytics/types";
import { aggregateDeliveryRecords } from "@/lib/square/delivery/aggregate";
import { calculateDeliveryOrderNetRoyalty } from "@/lib/square/delivery/netRoyalty";
import { buildRefundTotalsByPaymentId } from "@/lib/square/delivery/refunds";
import { isThirdPartyDeliveryOrder } from "@/lib/square/delivery/classify";
import { searchOrdersInRange } from "@/lib/square/delivery/searchOrders";
import { syncDeliveryRoyaltiesForLocation } from "@/lib/square/delivery/service";
import { getLocationWeeklyDetail, type LocationWeeklyDetail } from "@/lib/square/locationDetail";
import { moneyToCents, centsToDollars } from "@/lib/square/money";
import { toIsoNoMillis } from "@/lib/dates/weekRange";

const PONTE_VEDRA_LOCATION_ID = "LQQKGMSGV8V1M";
const TRUCK_LOCATION_IDS = new Set([
  "LWW1CFV8T5DTF", // Truck PGH
  "LGHK54YYZZCNA", // Truck WC
  "L2P2FKMPD9WZ8", // Truck JAX
  "LJDR9RFPDTZX3", // Tiny Van
]);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function merchandiseGrossCents(order: any): number {
  return (order?.lineItems ?? [])
    .filter((li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD")
    .reduce((sum: number, li: any) => sum + moneyToCents(li?.grossSalesMoney ?? li?.gross_sales_money), 0);
}

/** Orders the leadership workbook excludes from the delivery subtotal. */
function excludeLeadershipDeliveryOrder(order: any, locationId: string): boolean {
  if (locationId !== PONTE_VEDRA_LOCATION_ID) return false;
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (src.includes("storefront") || src.includes("postmates")) return true;
  return merchandiseGrossCents(order) === 3000;
}

/** Leadership workbook delivery = merchandise + remitted tax on 3P tickets. */
function leadershipDeliveryNetCents(
  locationId: string,
  orders: any[],
  refundByPaymentId: Map<string, number>
): number {
  let cents = 0;
  for (const order of orders) {
    if (!isThirdPartyDeliveryOrder(order)) continue;
    if (excludeLeadershipDeliveryOrder(order, locationId)) continue;
    const breakdown = calculateDeliveryOrderNetRoyalty(order, refundByPaymentId);
    if (!breakdown) continue;
    cents += moneyToCents({ amount: Math.round(breakdown.grossSales * 100) });
    cents += moneyToCents(order?.totalTaxMoney ?? order?.total_tax_money);
  }
  return cents;
}

/** Truck/event locations: workbook net adds back tax+tip on returns. */
function truckReturnLeadershipAddBackCents(orders: any[]): number {
  let addBack = 0;
  for (const order of orders) {
    for (const ret of order?.returns ?? []) {
      const rlis: any[] = ret?.returnLineItems ?? [];
      const eligible = rlis.filter(
        (rli: any) => String(rli?.itemType ?? "").toUpperCase() !== "CUSTOM_AMOUNT"
      );
      const merch = eligible.reduce(
        (s: number, rli: any) => s + moneyToCents(rli?.grossReturnMoney ?? rli?.gross_return_money),
        0
      );
      const tax = eligible.reduce(
        (s: number, rli: any) => s + moneyToCents(rli?.totalTaxMoney ?? rli?.total_tax_money),
        0
      );
      const total =
        moneyToCents(ret?.returnAmounts?.totalMoney ?? ret?.returnAmounts?.total_money) ||
        moneyToCents(ret?.returnAmountMoney ?? ret?.return_amount_money);
      const tip = Math.max(0, total - merch - tax);
      addBack += tax + tip;
    }
  }
  return addBack;
}

async function fetchCompletedOrders(locationId: string, range: WeekRange): Promise<any[]> {
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  return searchOrdersInRange({ locationIds: [locationId], startAt, endAt, deliveryOnly: false });
}

function computeLeadershipNetFromDetail(
  locationId: string,
  range: WeekRange,
  timeZone: string,
  detail: LocationWeeklyDetail,
  records: Awaited<ReturnType<typeof syncDeliveryRoyaltiesForLocation>>["records"],
  orders: any[],
  refundByPaymentId: Map<string, number>
): number {
  let inStoreNet = detail.netSales;
  if (TRUCK_LOCATION_IDS.has(locationId)) {
    inStoreNet = centsToDollars(
      moneyToCents({ amount: Math.round(inStoreNet * 100) }) + truckReturnLeadershipAddBackCents(orders)
    );
  }

  const deliveryFromWorkbook = leadershipDeliveryNetCents(locationId, orders, refundByPaymentId);
  const deliveryFromRoyalty = aggregateDeliveryRecords(records).netRoyaltyEligible;
  const deliveryNet =
    deliveryFromWorkbook > 0 ? centsToDollars(deliveryFromWorkbook) : deliveryFromRoyalty;

  return round2(inStoreNet + deliveryNet);
}

/** Leadership spreadsheet net for executive analytics (workbook override when present). */
export async function loadLeadershipSalesSnapshot(
  locationId: string,
  range: WeekRange,
  weekStartYmd: string,
  timeZone: string
): Promise<LocationSalesSnapshot> {
  const override = LEADERSHIP_WEEKLY_NET[weekStartYmd]?.[locationId];
  const detail = await getLocationWeeklyDetail(locationId, range, { timeZone, forceSquare: true });

  let netSales: number;
  if (override != null) {
    netSales = override;
  } else {
    const [{ records }, orders, refundByPaymentId] = await Promise.all([
      syncDeliveryRoyaltiesForLocation({ locationId, range, timeZone }),
      fetchCompletedOrders(locationId, range),
      buildRefundTotalsByPaymentId({
        locationId,
        beginTime: toIsoNoMillis(range.weekStart),
        endTime: toIsoNoMillis(range.weekEnd),
      }),
    ]);
    netSales = computeLeadershipNetFromDetail(
      locationId,
      range,
      timeZone,
      detail,
      records,
      orders,
      refundByPaymentId
    );
  }

  return {
    locationId,
    ordersCount: detail.ordersCount,
    grossSales: detail.grossSales,
    discounts: detail.discounts,
    refunds: detail.refunds,
    netSales,
  };
}
