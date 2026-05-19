import { getSquareClient } from "@/lib/square/client";
import { moneyToCents } from "@/lib/square/money";
import { deliveryLog } from "@/lib/square/delivery/logger";

/**
 * Build payment_id → total refunded cents for a location/time window.
 * Used to catch partial refunds that post against tenders after the order closes.
 */
export async function buildRefundTotalsByPaymentId(params: {
  locationId: string;
  beginTime: string;
  endTime: string;
}): Promise<Map<string, number>> {
  const square = getSquareClient();
  const map = new Map<string, number>();
  let cursor: string | undefined;

  try {
    do {
      const res = await square.refunds.list({
        locationId: params.locationId,
        beginTime: params.beginTime,
        endTime: params.endTime,
        cursor,
        sortOrder: "DESC",
        limit: 100,
      } as any);

      const refunds: any[] =
        (res as any)?.data?.refunds ?? (res as any)?.refunds ?? (res as any)?.result?.refunds ?? [];

      for (const rf of refunds) {
        const st = String(rf?.status ?? "").toUpperCase();
        if (st !== "APPROVED" && st !== "COMPLETED") continue;
        const paymentId = String(rf?.paymentId ?? rf?.payment_id ?? "");
        if (!paymentId) continue;
        const cents = moneyToCents(rf?.amountMoney ?? rf?.amount_money);
        map.set(paymentId, (map.get(paymentId) ?? 0) + cents);
      }

      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
    } while (cursor);
  } catch (err) {
    deliveryLog.error("Refunds API list failed", err, params);
    throw err;
  }

  return map;
}
