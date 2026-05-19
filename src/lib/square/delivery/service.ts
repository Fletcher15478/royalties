import { formatWeekParam, getWeekRangeMondayToMondayInTimeZone } from "@/lib/dates/weekRange";
import { toIsoNoMillis, type WeekRange } from "@/lib/dates/weekRange";
import { calculateDeliveryOrderNetRoyalty } from "@/lib/square/delivery/netRoyalty";
import { buildRefundTotalsByPaymentId } from "@/lib/square/delivery/refunds";
import { searchOrdersInRange, fetchOrderById } from "@/lib/square/delivery/searchOrders";
import { deliveryLog } from "@/lib/square/delivery/logger";
import type { DeliveryLocationSyncSummary, DeliveryRoyaltyRecord } from "@/lib/square/delivery/types";
import type { ThirdPartyDeliveryPlatform } from "@/lib/square/delivery/types";

export type SyncDeliveryRoyaltiesParams = {
  locationId: string;
  range: WeekRange;
  timeZone?: string;
};

/**
 * Pull third-party delivery orders from Square for a location/week and compute net royalty-eligible sales.
 * No database — numbers are always derived live from Square (same as the main dashboard).
 */
export async function syncDeliveryRoyaltiesForLocation(
  params: SyncDeliveryRoyaltiesParams
): Promise<{ summary: DeliveryLocationSyncSummary; records: DeliveryRoyaltyRecord[] }> {
  const tz = params.timeZone ?? "America/New_York";
  const effectiveRange = getWeekRangeMondayToMondayInTimeZone(params.range.weekStart, tz);
  const startAt = toIsoNoMillis(effectiveRange.weekStart);
  const endAt = toIsoNoMillis(effectiveRange.weekEnd);

  const refundByPaymentId = await buildRefundTotalsByPaymentId({
    locationId: params.locationId,
    beginTime: startAt,
    endTime: endAt,
  });

  const orders = await searchOrdersInRange({
    locationIds: [params.locationId],
    startAt,
    endAt,
    deliveryOnly: true,
  });

  const byPlatform: DeliveryLocationSyncSummary["byPlatform"] = {
    doordash: { count: 0, netRoyaltyEligible: 0 },
    uber_eats: { count: 0, netRoyaltyEligible: 0 },
    grubhub: { count: 0, netRoyaltyEligible: 0 },
    unknown: { count: 0, netRoyaltyEligible: 0 },
  };

  const records: DeliveryRoyaltyRecord[] = [];
  let totalNet = 0;
  const weekStartYmd = formatWeekParam(effectiveRange.weekStart);

  for (const order of orders) {
    const breakdown = calculateDeliveryOrderNetRoyalty(order, refundByPaymentId);
    if (!breakdown) continue;

    const record: DeliveryRoyaltyRecord = {
      ...breakdown,
      weekStartYmd,
      updatedAt: new Date().toISOString(),
      squareOrderVersion: order?.version != null ? Number(order.version) : undefined,
    };

    records.push(record);
    totalNet += breakdown.netRoyaltyEligible;
    const bucket = byPlatform[breakdown.platform as ThirdPartyDeliveryPlatform];
    bucket.count += 1;
    bucket.netRoyaltyEligible += breakdown.netRoyaltyEligible;
  }

  const summary: DeliveryLocationSyncSummary = {
    locationId: params.locationId,
    startAt,
    endAt,
    ordersProcessed: orders.length,
    deliveryOrders: records.length,
    totalNetRoyaltyEligible: Math.round(totalNet * 100) / 100,
    byPlatform,
  };

  deliveryLog.info("Square delivery sync complete", summary);
  return { summary, records };
}

/**
 * Recompute one order from Square (e.g. after order.updated webhook). Does not persist anywhere.
 */
export async function computeDeliveryRoyaltyForOrder(params: {
  orderId: string;
  locationId?: string;
  timeZone?: string;
}): Promise<DeliveryRoyaltyRecord | null> {
  const order = await fetchOrderById(params.orderId);
  if (!order) {
    deliveryLog.warn("Order not found", { orderId: params.orderId });
    return null;
  }

  const locationId = params.locationId ?? String(order?.locationId ?? order?.location_id ?? "");
  const closedAt = order?.closedAt ?? order?.closed_at;
  const tz = params.timeZone ?? "America/New_York";

  const beginTime = closedAt
    ? toIsoNoMillis(new Date(new Date(closedAt).getTime() - 7 * 24 * 60 * 60 * 1000))
    : toIsoNoMillis(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const endTime = closedAt
    ? toIsoNoMillis(new Date(new Date(closedAt).getTime() + 7 * 24 * 60 * 60 * 1000))
    : toIsoNoMillis(new Date());

  const refundByPaymentId = await buildRefundTotalsByPaymentId({
    locationId,
    beginTime,
    endTime,
  });

  const breakdown = calculateDeliveryOrderNetRoyalty(order, refundByPaymentId);
  if (!breakdown) {
    deliveryLog.info("Not a third-party delivery order", { orderId: params.orderId });
    return null;
  }

  const range = getWeekRangeMondayToMondayInTimeZone(closedAt ? new Date(closedAt) : new Date(), tz);

  return {
    ...breakdown,
    weekStartYmd: formatWeekParam(range.weekStart),
    updatedAt: new Date().toISOString(),
    squareOrderVersion: order?.version != null ? Number(order.version) : undefined,
  };
}

/** @deprecated Use computeDeliveryRoyaltyForOrder */
export const refreshDeliveryRoyaltyForOrder = computeDeliveryRoyaltyForOrder;
