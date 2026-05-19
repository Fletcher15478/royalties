import { moneyToCents, centsToDollars } from "@/lib/square/money";
import { classifyThirdPartyDeliveryPlatform, isThirdPartyDeliveryOrder } from "@/lib/square/delivery/classify";
import { splitDiscountCents } from "@/lib/square/delivery/discounts";
import type { DeliveryOrderRoyaltyBreakdown } from "@/lib/square/delivery/types";

function isGiftCardLine(li: any): boolean {
  const itemType = String(li?.itemType ?? li?.item_type ?? "").toUpperCase();
  if (itemType === "GIFT_CARD") return true;
  const name = String(li?.name ?? "").toLowerCase();
  return name.includes("gift card");
}

/** Platform / marketplace fees on the order (Square service_charges). */
function platformFeeCents(order: any): number {
  let cents = 0;
  const charges: any[] = order?.serviceCharges ?? order?.service_charges ?? [];
  for (const sc of charges) {
    const name = String(sc?.name ?? "").toLowerCase();
    const looksLikePlatformFee =
      name.includes("delivery") ||
      name.includes("doordash") ||
      name.includes("uber") ||
      name.includes("grubhub") ||
      name.includes("grub hub") ||
      name.includes("dasher") ||
      name.includes("eats") ||
      name.includes("marketplace") ||
      name.includes("commission") ||
      name.includes("service fee");
    if (!looksLikePlatformFee) continue;
    cents += moneyToCents(sc?.appliedMoney ?? sc?.applied_money) || moneyToCents(sc?.totalMoney ?? sc?.total_money);
  }
  return cents;
}

function merchandiseGrossCents(order: any): number {
  const lineItems: any[] = order?.lineItems ?? order?.line_items ?? [];
  return lineItems
    .filter((li) => !isGiftCardLine(li))
    .reduce((sum, li) => sum + moneyToCents(li?.grossSalesMoney ?? li?.gross_sales_money), 0);
}

function returnsMerchandiseCents(order: any): number {
  let cents = 0;
  const returnsAll: any[] = order?.returns ?? [];
  for (const ret of returnsAll) {
    const rlis: any[] = ret?.returnLineItems ?? ret?.return_line_items ?? [];
    const eligible = rlis.filter((rli) => String(rli?.itemType ?? rli?.item_type ?? "").toUpperCase() !== "CUSTOM_AMOUNT");
    cents += eligible.reduce((sum, rli) => sum + moneyToCents(rli?.grossReturnMoney ?? rli?.gross_return_money), 0);
    if (rlis.length === 0) {
      cents += moneyToCents(ret?.returnAmountMoney ?? ret?.return_amount_money);
    }
  }
  return cents;
}

function refundsOnOrderCents(order: any): number {
  let cents = 0;
  const refundsArr: any[] = order?.refunds ?? [];
  for (const rf of refundsArr) {
    const st = String(rf?.status ?? "").toUpperCase();
    if (st === "APPROVED" || st === "COMPLETED") {
      cents += moneyToCents(rf?.amountMoney ?? rf?.amount_money);
    }
  }
  return cents;
}

function extraRefundsFromPaymentMap(order: any, refundByPaymentId: Map<string, number>): number {
  const seen = new Set<string>();
  let cents = 0;
  const tenders: any[] = order?.tenders ?? [];
  for (const ten of tenders) {
    const paymentId = String(ten?.paymentId ?? ten?.payment_id ?? "");
    if (!paymentId || seen.has(paymentId)) continue;
    seen.add(paymentId);
    cents += refundByPaymentId.get(paymentId) ?? 0;
  }
  return cents;
}

/**
 * Royalty pool for a third-party delivery order:
 *   net = merchandiseGross − returns − marketingDiscounts − otherDiscounts − refunds − platformFee
 */
export function calculateDeliveryOrderNetRoyalty(
  order: any,
  refundByPaymentId: Map<string, number>
): DeliveryOrderRoyaltyBreakdown | null {
  if (!isThirdPartyDeliveryOrder(order)) return null;

  const orderId = String(order?.id ?? "");
  const locationId = String(order?.locationId ?? order?.location_id ?? "");
  if (!orderId || !locationId) return null;

  const grossCents = merchandiseGrossCents(order);
  const returnsCents = returnsMerchandiseCents(order);
  const { marketingCents, otherCents } = splitDiscountCents(order);
  const refundsOrderCents = refundsOnOrderCents(order);
  const refundsApiCents = extraRefundsFromPaymentMap(order, refundByPaymentId);
  const platformFeeCentsTotal = platformFeeCents(order);

  const netCents = Math.max(
    0,
    grossCents -
      returnsCents -
      marketingCents -
      otherCents -
      refundsOrderCents -
      refundsApiCents -
      platformFeeCentsTotal
  );

  return {
    orderId,
    locationId,
    platform: classifyThirdPartyDeliveryPlatform(order),
    sourceName: order?.source?.name ? String(order.source.name) : null,
    closedAt: order?.closedAt ?? order?.closed_at ?? null,
    grossSales: centsToDollars(grossCents),
    returns: centsToDollars(returnsCents),
    marketingDiscounts: centsToDollars(marketingCents),
    otherDiscounts: centsToDollars(otherCents),
    refundsOnOrder: centsToDollars(refundsOrderCents),
    refundsFromPaymentsApi: centsToDollars(refundsApiCents),
    platformFee: centsToDollars(platformFeeCentsTotal),
    netRoyaltyEligible: centsToDollars(netCents),
  };
}
