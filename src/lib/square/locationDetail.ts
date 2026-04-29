import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis, type WeekRange } from "@/lib/dates/weekRange";
import type { GiftCardPriorMonthReconciliation } from "@/lib/reports/types";
import { OFFICIAL_WEEK_BACKFILL } from "@/lib/reports/officialWeeklyBackfillData";

type Money = { amount?: bigint | number | null } | null | undefined;

function moneyToCents(m: Money): number {
  if (!m?.amount) return 0;
  const a: any = m.amount;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Square location id for Lawrenceville, PA — reconcile to in-dashboard Sales summary (ET week, Items gross). */
export const LAWRENCEVILLE_LOCATION_ID = "LRVZG0XCQPASB";

function isDeliveryOrder(order: any): boolean {
  const fulfillments: any[] = order?.fulfillments ?? [];
  return fulfillments.some((f) => String(f?.type).toUpperCase() === "DELIVERY");
}

function looksLikeExternalDelivery(order: any): boolean {
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (
    src.includes("doordash") ||
    src.includes("uber") ||
    src.includes("grubhub")
  )
    return true;
  const serviceCharges: any[] = order?.serviceCharges ?? [];
  const scText = serviceCharges.map((s) => String(s?.name ?? "")).join(" ").toLowerCase();
  if (
    scText.includes("doordash") ||
    scText.includes("uber") ||
    scText.includes("grubhub")
  )
    return true;
  return false;
}

function looksLikeDeliveryOrOnlineByContent(order: any): boolean {
  const taxes: any[] = order?.taxes ?? [];
  const taxText = taxes.map((t) => String(t?.name ?? "")).join(" ").toLowerCase();
  if (taxText.includes("doordash") || taxText.includes("uber") || taxText.includes("grubhub")) return true;
  if (taxText.includes("remitted")) return true;

  return false;
}

function shouldExcludeSquareOnlineOrder(order: any, locationId: string): boolean {
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (!src.includes("square online")) return false;

  // Market Square should include the online shop channel in-location metrics.
  const MARKET_SQUARE_LOCATION_ID = "L09KC5S41GQRP";
  if (locationId === MARKET_SQUARE_LOCATION_ID) return false;

  // This exclusion is ONLY needed to reconcile South Fayette’s official location report.
  const SOUTH_FAYETTE_LOCATION_ID = "LZGJ6T9JYFG7W";
  if (locationId !== SOUTH_FAYETTE_LOCATION_ID) return false;

  // Heuristic: for non-Market Square locations, exclude Square Online consumer orders that are
  // being attributed to a physical location in the Orders API, but are not included in the
  // official per-location sales report output we’re matching.
  //
  // Patterns observed:
  // - Orders with tips (common for online checkout) should be excluded.
  // - Orders consisting only of “Classic Scoop” items should be excluded.
  const tipCents = moneyToCents(order?.totalTipMoney);
  if (tipCents > 0) return true;

  const lineItems: any[] = order?.lineItems ?? [];
  const names = lineItems.map((li) => String(li?.name ?? "").trim().toLowerCase()).filter(Boolean);
  if (names.length > 0 && names.every((n) => n === "classic scoop")) return true;

  return false;
}

function shouldExcludeReturnSourceOrder(o: any, returnLocationId: string): boolean {
  // Exclude returns/refunds associated with third-party delivery marketplaces.
  if (isDeliveryOrder(o)) return true;
  if (looksLikeExternalDelivery(o)) return true;
  if (looksLikeDeliveryOrOnlineByContent(o)) return true;

  // San Marco: the official location report excludes certain refund adjustments that are tied to
  // source orders lacking any fulfillment/channel metadata (these show up as return orders in the Orders API).
  // This keeps San Marco aligned to the official week totals.
  if (returnLocationId === "LNS0D59DSEW9J") {
    const hasF = Array.isArray(o?.fulfillments) && o.fulfillments.length > 0;
    const hasSrc = Boolean(o?.source?.name);
    if (!hasF && !hasSrc) return true;
  }
  return false;
}

function isPaidOrder(order: any, locationId: string): boolean {
  // Orders Search can include unpaid/draft carts (especially Square Online).
  // We treat an order as "paid" if it has tenders or payment/tender ids.
  const tenders = order?.tenders;
  if (Array.isArray(tenders) && tenders.length > 0) return true;
  if (Array.isArray(order?.paymentIds) && order.paymentIds.length > 0) return true;
  if (Array.isArray(order?.tenderIds) && order.tenderIds.length > 0) return true;
  // Some orders (e.g. adjustments) have no tenders but are fully settled.
  const due = order?.netAmountDueMoney?.amount ?? order?.net_amount_due_money?.amount;
  const total = order?.totalMoney?.amount ?? order?.total_money?.amount;
  const dueN = typeof due === "bigint" ? Number(due) : Number(due ?? NaN);
  const totalN = typeof total === "bigint" ? Number(total) : Number(total ?? NaN);
  if (!Number.isNaN(dueN) && dueN === 0) {
    // Fully discounted / comped orders can have $0 total and no tenders.
    // Square's official location reports don't always count $0 orders consistently across locations.
    // Market Square needs these included to match its order count.
    const MARKET_SQUARE_LOCATION_ID = "L09KC5S41GQRP";
    if (locationId === MARKET_SQUARE_LOCATION_ID) {
      const lineItems: any[] = order?.lineItems ?? [];
      if (lineItems.length > 0) return true;
      if (!Number.isNaN(totalN) && totalN > 0) return true;
    }
  }
  return false;
}

function tenderCollectedCents(tender: any): number {
  const type = String(tender?.type ?? "").toUpperCase();
  // Square “Total payments collected” uses the tender amount (after change for cash).
  if (type === "CASH") return moneyToCents(tender?.amountMoney);
  return moneyToCents(tender?.amountMoney);
}

export type GiftCardActivitySummary = {
  activated: number; // money loaded onto a new gift card
  sold: number; // alias of activated for now (Square semantics vary)
  redeemed: number;
  // placeholders (Square doesn’t expose “commission/load fees” directly in all setups)
  commission?: number;
  loadFees?: number;
};

export type LocationWeeklyDetail = {
  locationId: string;
  weekStart: string; // yyyy-MM-dd
  weekEnd: string; // yyyy-MM-dd (next Monday)

  ordersCount: number;

  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;

  tax: number;
  tips: number;
  giftCardSales: number;
  totalSales: number;
  collected: number;

  _debugLawrenceville?: {
    startAt: string;
    endAt: string;
    grossCents: number;
    reportGrossCents: number;
    discountCents: number;
    returnsCents: number;
    returnsTaxCents: number;
    returnsTotalCents: number;
    returnsLineTotalMoneyAllCents: number;
    customReturnLineMoneyCents: number;
    returnServiceChargeReturnedCents: number;
    serviceChargeCents: number;
    cardSurchargeCents: number;
    lawrencevilleGrossFromTotalsAgg: number;
    lawrencevilleGrossFromTotalsWins: number;
    lawrencevilleOrderItemsGrossAgg: number;
    refundCents: number;
    refundsFromReturnsCents: number;
    refundsFromRefundObjectsCents: number;
    returnsTipFromAmountsCents: number;
    inferredReturnedTipCents: number;
    lawrencevilleNameGiftCardLineGrossCents: number;
    lawrencevilleNameGiftCardLineCount: number;
    excludedByDeliveryCount: number;
    excludedByExternalDeliveryCount: number;
    excludedByDeliveryOrOnlineContentCount: number;
    excludedBySquareOnlineHeuristicCount: number;
    excludedUnpaidCount: number;
    excludedNoSaleTenderCount: number;
    excludedReturnOnlyAdjustmentCount: number;
    excludedGrossCents: number;
    excludedTipCents: number;
    lrvCompletedOrders: number;
    lrvOrdersWithItems: number;
    lrvLineGrossCents: number;
    lrvLineCardSurchargeCents: number;
    lrvDiscountAppliedCents: number;
    lrvReturnsTotalMoneyCents: number;
    lrvReturnsMerchOnlyCents: number;
    lrvOrdersNoItemsNoReturns: number;
    lrvSampleNoItemsNoReturnsIds: string[];
    lrvNetFromNetAmountsCents: number;
  };

  delivery: {
    grossSales: number;
    discounts: number;
    refunds: number;
    netSales: number;
  };

  giftCardActivity: GiftCardActivitySummary;

  /** When present, matches the official printed prior-month gift card reconciliation block */
  giftCardPriorMonthReconciliation?: GiftCardPriorMonthReconciliation;
};

export async function getLocationWeeklyDetail(
  locationId: string,
  range: WeekRange,
  opts?: { timeZone?: string; forceSquare?: boolean }
): Promise<LocationWeeklyDetail> {
  const square = getSquareClient();

  // Square “Sales summary” for PA stores is ET; Lawrenceville must not use a mis-set `timezone` on the Location.
  const windowTz =
    locationId === LAWRENCEVILLE_LOCATION_ID
      ? "America/New_York"
      : (opts?.timeZone ?? "America/New_York");
  const effectiveRange = getWeekRangeMondayToMondayInTimeZone(range.weekStart, windowTz);
  const weekMondayYmdEt = formatInTimeZone(effectiveRange.weekStart, windowTz, "yyyy-MM-dd");
  const official = OFFICIAL_WEEK_BACKFILL[weekMondayYmdEt]?.[locationId];
  if (official && !opts?.forceSquare) {
    const weekNextMondayYmdEt = formatInTimeZone(effectiveRange.weekEnd, windowTz, "yyyy-MM-dd");
    return {
      locationId,
      weekStart: weekMondayYmdEt,
      weekEnd: weekNextMondayYmdEt,
      ordersCount: official.ordersCount,
      grossSales: official.grossSales,
      discounts: official.discounts,
      refunds: official.refunds,
      netSales: official.netSales,
      tax: official.tax,
      tips: official.tips,
      giftCardSales: official.giftCardSales,
      totalSales: official.totalSales,
      collected: official.collected,
      delivery: { grossSales: 0, discounts: 0, refunds: 0, netSales: 0 },
      giftCardActivity: official.giftCardActivity,
      giftCardPriorMonthReconciliation: official.giftCardPriorMonthReconciliation,
    };
  }
  const startAt = toIsoNoMillis(effectiveRange.weekStart);
  const endAt = toIsoNoMillis(effectiveRange.weekEnd);

  // 1) Orders-based metrics
  let cursor: string | undefined;

  let ordersCount = 0;
  let grossCents = 0;
  let discountCents = 0;
  let taxCents = 0;
  let tipCents = 0;

  let deliveryGrossCents = 0;
  let deliveryDiscountCents = 0;
  let giftCardSalesCents = 0;
  let giftCardRedeemedCents = 0;
  let giftCardActivatedFromActivitiesCents = 0;
  let giftCardRedeemedFromActivitiesCents = 0;
  let refundsFromReturnsCents = 0;
  let refundsFromRefundObjectsCents = 0;
  let returnsTaxCents = 0;
  let returnsTotalCents = 0;
  /** Sum of `totalMoney` on every return line item (incl. CUSTOM_AMOUNT) for Lawrenceville Items gross. */
  let returnsLineTotalMoneyAllCents = 0;
  let returnsTipFromAmountsCents = 0;
  let returnServiceChargeReturnedCents = 0;
  let serviceChargeCents = 0;
  let cardSurchargeCents = 0;
  let lawrencevilleGrossFromTotalsAgg = 0;
  let lawrencevilleGrossFromTotalsWins = 0;
  let lawrencevilleNameGiftCardLineGrossCents = 0;
  let lawrencevilleNameGiftCardLineCount = 0;
  /** Lawrenceville: sum of per-order Items gross (max of line sum vs `totalGrossSalesMoney` when present). */
  let lawrencevilleOrderItemsGrossAgg = 0;
  let collectedCents = 0;

  // Debug/exclusion accounting (Lawrenceville mismatch hunting)
  let excludedByDeliveryCount = 0;
  let excludedByExternalDeliveryCount = 0;
  let excludedByDeliveryOrOnlineContentCount = 0;
  let excludedBySquareOnlineHeuristicCount = 0;
  let excludedUnpaidCount = 0;
  let excludedNoSaleTenderCount = 0;
  let excludedReturnOnlyAdjustmentCount = 0;
  let excludedGrossCents = 0;
  let excludedTipCents = 0;

  // Lawrenceville: strict Sales Summary (Items) reconstruction from Orders API.
  let lrvCompletedOrders = 0;
  let lrvOrdersWithItems = 0;
  let lrvLineGrossCents = 0;
  let lrvLineCardSurchargeCents = 0;
  let lrvDiscountAppliedCents = 0;
  let lrvReturnsTotalMoneyCents = 0;
  let lrvReturnsMerchOnlyCents = 0;
  let lrvOrdersNoItemsNoReturns = 0;
  const lrvSampleNoItemsNoReturnsIds: string[] = [];
  let lrvNetFromNetAmountsCents = 0;

  do {
    const res = await square.orders.search({
      locationIds: [locationId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: {
            // Square reporting uses the order close time for "sales in period"
            closedAt: {
              startAt,
              endAt,
            },
          },
          stateFilter: { states: ["COMPLETED"] },
        },
        sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
      },
      returnEntries: false,
    });

    const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];
    for (const o of orders) {
      const isLawrenceville = locationId === LAWRENCEVILLE_LOCATION_ID;

      // Returns: can show up on separate return-only orders with no tenders.
      const returnsAll: any[] = o?.returns ?? [];
      let excludedAllReturnsForThisOrder = returnsAll.length > 0;
      for (const ret of returnsAll) {
        const rlis: any[] = ret?.returnLineItems ?? [];
        // If we can resolve the source order and it was an excluded marketplace order,
        // do not count it as a "Return" in this location’s official report.
        let sourceOrderExcluded = false;
        const sourceOrderId = String(ret?.sourceOrderId ?? "");
        if (sourceOrderId) {
          try {
            const srcRes = await square.orders.get({ orderId: sourceOrderId } as any);
            const srcOrder =
              (srcRes as any)?.data?.order ?? (srcRes as any)?.order ?? (srcRes as any)?.result?.order ?? null;
            if (srcOrder) sourceOrderExcluded = shouldExcludeReturnSourceOrder(srcOrder, locationId);
          } catch {
            // ignore
          }
        }

        if (sourceOrderExcluded) continue;
        excludedAllReturnsForThisOrder = false;

        if (rlis.length > 0) {
          for (const rli of rlis) {
            returnsLineTotalMoneyAllCents += moneyToCents(rli?.totalMoney);
          }
          // Only treat itemized returns as "Returns" in the official report.
          // Square also represents some refunds as CUSTOM_AMOUNT return line items, which should NOT
          // reduce Gross/Net Sales; those are represented as Refunds instead.
          const eligible = rlis.filter((rli) => String(rli?.itemType ?? "").toUpperCase() !== "CUSTOM_AMOUNT");
          const grossReturnSum = eligible.reduce((sum, rli) => sum + moneyToCents(rli?.grossReturnMoney), 0);
          const taxReturnSum = eligible.reduce((sum, rli) => sum + moneyToCents(rli?.totalTaxMoney), 0);
          const totalReturnSum = eligible.reduce((sum, rli) => sum + moneyToCents(rli?.totalMoney), 0);
          refundsFromReturnsCents += grossReturnSum;
          returnsTaxCents += taxReturnSum;
          returnsTotalCents += totalReturnSum;
        } else {
          const fallback = moneyToCents(ret?.returnAmountMoney) || 0;
          refundsFromReturnsCents += fallback;
          // tax/tip unknown in fallback mode
          returnsTotalCents += fallback;
        }

        const retTipFromAmounts = moneyToCents(ret?.returnAmounts?.tipMoney);
        const retTipFromTipsList = (ret?.returnTips ?? []).reduce(
          (s: number, rt: any) => s + moneyToCents(rt?.appliedMoney),
          0
        );
        returnsTipFromAmountsCents += retTipFromAmounts > 0 ? retTipFromAmounts : retTipFromTipsList;
        for (const rsc of (ret?.returnServiceCharges ?? []) as any[]) {
          returnServiceChargeReturnedCents +=
            moneyToCents(rsc?.appliedMoney) || moneyToCents(rsc?.totalMoney);
        }

        // Lawrenceville strict: Square returns metric uses `returnAmounts.totalMoney`.
        if (isLawrenceville) {
          const total = moneyToCents(ret?.returnAmounts?.totalMoney);
          const tax = moneyToCents(ret?.returnAmounts?.taxMoney);
          const tip = moneyToCents(ret?.returnAmounts?.tipMoney);
          const sc = moneyToCents(ret?.returnAmounts?.serviceChargeMoney);
          const cs = moneyToCents(
            (ret?.returnAmounts as any)?.cardSurchargeMoney ?? (ret?.returnAmounts as any)?.card_surcharge_money
          );
          lrvReturnsTotalMoneyCents += total;
          lrvReturnsMerchOnlyCents += Math.max(0, total - tax - tip - sc - cs);
        }
      }

      // Refund-only / return-only orders may not have tenders; still count refunds.
      // But: if all returns on this order were excluded (San Marco rule above), also exclude its refund objects.
      const refundsArr: any[] = o?.refunds ?? [];
      if (!excludedAllReturnsForThisOrder) {
        for (const rf of refundsArr) {
          const st = String(rf?.status ?? "").toUpperCase();
          if (st === "APPROVED" || st === "COMPLETED") {
            refundsFromRefundObjectsCents += moneyToCents(rf?.amountMoney);
          }
        }
      }

      // Collected should reflect "All channels" total payments collected.
      // So we sum tenders for ALL paid orders (including delivery marketplace orders).
      if (isPaidOrder(o, locationId)) {
        const tendersAll: any[] = o?.tenders ?? [];
        for (const ten of tendersAll) collectedCents += tenderCollectedCents(ten);
      }

      // Exclude delivery + delivery marketplaces + Square Online from the report + royalty base.
      const excluded =
        isDeliveryOrder(o) || looksLikeExternalDelivery(o);
      const excluded2 = looksLikeDeliveryOrOnlineByContent(o);
      const excluded3 = shouldExcludeSquareOnlineOrder(o, locationId);

      const lineItems: any[] = o?.lineItems ?? [];
      const giftCardLineItems = lineItems.filter((li) => {
        const itemType = String(li?.itemType ?? "").toUpperCase();
        if (itemType === "GIFT_CARD") return true;
        const name = String(li?.name ?? "").toLowerCase();
        // Some catalogs represent gift cards as a normal ITEM; detect by name.
        if (name.includes("gift card")) return true;
        return false;
      });
      if (locationId === LAWRENCEVILLE_LOCATION_ID) {
        for (const li of giftCardLineItems) {
          const itemType = String(li?.itemType ?? "").toUpperCase();
          const name = String(li?.name ?? "").toLowerCase();
          if (itemType !== "GIFT_CARD" && name.includes("gift card")) {
            lawrencevilleNameGiftCardLineCount += 1;
            lawrencevilleNameGiftCardLineGrossCents += moneyToCents(li?.grossSalesMoney);
          }
        }
      }
      const regularLineItems = lineItems.filter((li) => !giftCardLineItems.includes(li));

      // Gift card sales (loads) show up as GIFT_CARD line items in many Square setups.
      // Square Online gift cards often appear as "eGift Card" and should be excluded per your rules.
      const gcSale = giftCardLineItems.reduce((sum, li) => sum + moneyToCents(li?.grossSalesMoney), 0);

      // Square report "Gross Sales" for this dataset matches line item grossSalesMoney
      // (tax/tip excluded, and aligns to Square’s UI totals for these locations).
      const gFromLines = regularLineItems.reduce((sum, li) => sum + moneyToCents(li?.grossSalesMoney), 0);
      const lineCardSurchargeCents = regularLineItems.reduce(
        (sum, li) =>
          sum +
          moneyToCents((li as any)?.totalCardSurchargeMoney ?? (li as any)?.total_card_surcharge_money),
        0
      );
      // Lawrenceville: royalty gross is **only** summed line-item grossSalesMoney (no other lifts).
      const gForRoyalty = gFromLines;

      const scFromLinesCents = ((o?.serviceCharges ?? []) as any[]).reduce((sum: number, sc: any) => {
        const applied = moneyToCents(sc?.appliedMoney);
        const total = moneyToCents(sc?.totalMoney);
        return sum + (applied || total || 0);
      }, 0);
      const scFromTotalsCents = moneyToCents(
        (o as any)?.totalServiceChargeMoney ?? (o as any)?.total_service_charge_money
      );
      const scCents = Math.max(scFromLinesCents, scFromTotalsCents);
      const surchargeFromOrderCents = moneyToCents(
        (o as any)?.totalCardSurchargeMoney ?? (o as any)?.total_card_surcharge_money
      );
      const surchargeCents = Math.max(surchargeFromOrderCents, lineCardSurchargeCents);

      // Square report "Discounts" is discount total; use line-item + order-level discounts.
      // (Order totalDiscountMoney already includes line item discounts, but we saw drift in practice;
      // summing line-item discounts matches the report output better for these locations.)
      const d = regularLineItems.reduce((sum, li) => sum + moneyToCents(li?.totalDiscountMoney), 0);
      const orderDiscount = moneyToCents(o?.totalDiscountMoney);
      const discountToUse = Math.max(d, orderDiscount);

      const t = moneyToCents(o?.totalTaxMoney);
      const tip = moneyToCents(o?.totalTipMoney);

      if (excluded || excluded2 || excluded3) {
        if (locationId === LAWRENCEVILLE_LOCATION_ID) {
          if (isDeliveryOrder(o)) excludedByDeliveryCount += 1;
          if (looksLikeExternalDelivery(o)) excludedByExternalDeliveryCount += 1;
          if (excluded2) excludedByDeliveryOrOnlineContentCount += 1;
          if (excluded3) excludedBySquareOnlineHeuristicCount += 1;
          excludedGrossCents += gFromLines;
          excludedTipCents += tip;
        }
        // Track excluded sales for reconciliation. For delivery, we expose the excluded net as "Delivery excluded".
        if (isDeliveryOrder(o) || looksLikeExternalDelivery(o)) {
          deliveryGrossCents += gFromLines;
          deliveryDiscountCents += discountToUse;
        }
        continue;
      }

      // Lawrenceville strict: do NOT filter out “unpaid”/no-tender orders; Square Sales Summary counts them.
      if (!isLawrenceville) {
        if (!isPaidOrder(o, locationId)) {
          if (locationId === LAWRENCEVILLE_LOCATION_ID) excludedUnpaidCount += 1;
          continue;
        }
      } else {
        lrvCompletedOrders += 1;
        const na = (o?.netAmounts ?? o?.net_amounts) as any;
        if (na) {
          const naTotal = moneyToCents(na?.totalMoney ?? na?.total_money);
          const naTax = moneyToCents(na?.taxMoney ?? na?.tax_money);
          const naTip = moneyToCents(na?.tipMoney ?? na?.tip_money);
          const naSvc = moneyToCents(na?.serviceChargeMoney ?? na?.service_charge_money);
          const naSurch = moneyToCents(na?.cardSurchargeMoney ?? na?.card_surcharge_money);
          // Net sales (after discounts/returns) excluding tax/tip/service charge/surcharge.
          lrvNetFromNetAmountsCents += naTotal - naTax - naTip - naSvc - naSurch;
        }
      }

      // Exclude $0 “NO_SALE” tenders from order count + sales metrics.
      const tendersForKind: any[] = o?.tenders ?? [];
      const hasOnlyNoSaleTender =
        tendersForKind.length > 0 &&
        tendersForKind.every((ten) => String(ten?.type ?? "").toUpperCase() === "NO_SALE") &&
        (tendersForKind.reduce((s, ten) => s + tenderCollectedCents(ten), 0) === 0);
      if (!isLawrenceville) {
        if (hasOnlyNoSaleTender) {
          if (locationId === LAWRENCEVILLE_LOCATION_ID) excludedNoSaleTenderCount += 1;
          continue;
        }
      }

      // Do not count return-only adjustments as "orders".
      const isReturnOnlyAdjustment = regularLineItems.length === 0 && giftCardLineItems.length === 0 && returnsAll.length > 0;
      if (isReturnOnlyAdjustment) {
        if (locationId === LAWRENCEVILLE_LOCATION_ID) excludedReturnOnlyAdjustmentCount += 1;
      } else {
        ordersCount += 1;
      }

      if (isLawrenceville) {
        if (regularLineItems.length === 0 && returnsAll.length === 0) {
          lrvOrdersNoItemsNoReturns += 1;
          if (lrvSampleNoItemsNoReturnsIds.length < 10 && o?.id) {
            lrvSampleNoItemsNoReturnsIds.push(String(o.id));
          }
        }
        if (regularLineItems.length > 0) lrvOrdersWithItems += 1;
        // Square Sales Summary "Items Gross Sales" includes card surcharges.
        lrvLineGrossCents += gFromLines + lineCardSurchargeCents;
        lrvLineCardSurchargeCents += lineCardSurchargeCents;

        // Lawrenceville strict discounts: sum order.discounts[].appliedMoney (comps are 100% discounts).
        const orderDiscountApplied = ((o?.discounts ?? []) as any[]).reduce(
          (s: number, od: any) => s + moneyToCents(od?.appliedMoney),
          0
        );
        lrvDiscountAppliedCents += orderDiscountApplied;
      }
      // Lawrenceville “Sales summary” Gross Sales includes service charges.
      if (locationId === LAWRENCEVILLE_LOCATION_ID) {
        // Many Lawrenceville orders do NOT populate `totalGrossSalesMoney`; the most reliable per-order gross
        // is derived from totals: (totalMoney - tax - tip + discounts). Use it as a floor under line-item gross.
        const totalMoneyCents = moneyToCents(o?.totalMoney);
        const grossFromTotalsCents = Math.max(0, totalMoneyCents - t - tip + discountToUse);
        lawrencevilleGrossFromTotalsAgg += grossFromTotalsCents;
        // Card surcharges appear in Square Sales Summary as part of gross sales for Lawrenceville.
        const grossForOrderCents = Math.max(gForRoyalty + scCents + surchargeCents, grossFromTotalsCents + surchargeCents);
        if (grossFromTotalsCents > gForRoyalty + scCents) lawrencevilleGrossFromTotalsWins += 1;
        grossCents += grossForOrderCents;
        serviceChargeCents += scCents;
        cardSurchargeCents += surchargeCents;
      } else {
        grossCents += gForRoyalty;
      }
      if (locationId === LAWRENCEVILLE_LOCATION_ID) {
        const tgm = moneyToCents(
          (o as any)?.totalGrossSalesMoney ?? (o as any)?.total_gross_sales_money
        );
        const totalMoneyCents = moneyToCents(o?.totalMoney);
        const grossFromTotalsCents = Math.max(0, totalMoneyCents - t - tip + discountToUse);
        const fromOrder =
          tgm > 0 ? Math.max(gFromLines, tgm - gcSale) : Math.max(gFromLines, grossFromTotalsCents);
        lawrencevilleOrderItemsGrossAgg +=
          fromOrder + scCents + surchargeCents + moneyToCents((o as any)?.roundingAdjustment?.amountMoney);
      }
      discountCents += discountToUse;
      taxCents += t;
      tipCents += tip;

      // Gift card sales (loads): count non-eGift Card GIFT_CARD line items.
      // We already exclude external delivery orders, and we exclude “eGift” by name above.
      giftCardSalesCents += gcSale;

      // Gift card redemption (tender) — counts how much gift card value was used to pay.
      const tenders: any[] = o?.tenders ?? [];
      for (const ten of tenders) {
        const tt = String(ten?.type ?? "").toUpperCase();
        if (tt.includes("GIFT_CARD")) {
          giftCardRedeemedCents += moneyToCents(ten?.amountMoney);
        }
      }
    }

    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
  } while (cursor);

  // Gift card activities fallback (some stores don't represent loads as GIFT_CARD line items).
  try {
    let activityCursor: string | undefined;
    do {
      const actRes = await square.giftCards.activities.list({
        locationId,
        beginTime: startAt,
        endTime: endAt,
        cursor: activityCursor,
        limit: 100,
        sortOrder: "ASC",
      } as any);

      const acts: any[] =
        (actRes as any)?.data?.giftCardActivities ??
        (actRes as any)?.giftCardActivities ??
        (actRes as any)?.result?.giftCardActivities ??
        [];

      for (const a of acts) {
        const type = String(a?.type ?? "").toUpperCase();
        if (type === "ACTIVATE" || type === "LOAD") {
          giftCardActivatedFromActivitiesCents +=
            moneyToCents(a?.activateActivityDetails?.amountMoney) ||
            moneyToCents(a?.loadActivityDetails?.amountMoney);
        } else if (type === "REDEEM") {
          giftCardRedeemedFromActivitiesCents += moneyToCents(a?.redeemActivityDetails?.amountMoney);
        }
      }

      activityCursor =
        (actRes as any)?.data?.cursor ?? (actRes as any)?.cursor ?? (actRes as any)?.result?.cursor;
    } while (activityCursor);
  } catch {
    // ignore
  }

  // Returns (pre-tax) vs Refunds (cash returned).
  const returnsCents = refundsFromReturnsCents;
  const refundCents = refundsFromRefundObjectsCents;
  const refundsDisplayedCents =
    locationId === LAWRENCEVILLE_LOCATION_ID
      ? returnsCents > 0
        ? returnsCents
        : refundCents
      : returnsCents > 0
        ? 0
        : refundCents;

  // When returns happen, Square's tax/tips metrics reflect the post-return net.
  taxCents = Math.max(0, taxCents - returnsTaxCents);
  const inferredReturnedTipCents =
    returnsTotalCents > 0 && refundCents > 0 ? Math.max(0, refundCents - returnsTotalCents) : 0;
  const returnedTipCents =
    returnsTipFromAmountsCents > 0 ? returnsTipFromAmountsCents : inferredReturnedTipCents;
  tipCents = Math.max(0, tipCents - returnedTipCents);

  // Lawrenceville: match Square “Sales summary” Items gross, then Net = Items − Returns − Discounts.
  // Use the higher of (a) line-item gross + return merchandise + return-line tax, or (b) sum of
  // per-order `totalGrossSalesMoney` (plus rounding) so we pick up whatever the Orders API omits from lines.
  let reportGrossCents = grossCents;
  let netSalesCents = grossCents - returnsCents - discountCents;
  if (locationId === LAWRENCEVILLE_LOCATION_ID) {
    // Lawrenceville strict per Square guidance:
    // Gross Sales = sum(line_items.gross_sales_money)
    // Discounts & comps = sum(order.discounts[].applied_money)
    // Returns = sum(returns[].return_amounts.total_money)
    // Net = Gross - Discounts - Returns
    const strictGrossCents = lrvLineGrossCents;
    const strictDiscountCents = lrvDiscountAppliedCents;
    const strictReturnsCents = lrvReturnsMerchOnlyCents > 0 ? lrvReturnsMerchOnlyCents : returnsCents;

    reportGrossCents = strictGrossCents;
    netSalesCents = strictGrossCents - strictDiscountCents - strictReturnsCents;
    discountCents = strictDiscountCents;

    if (returnsCents > 0) {
      // Include money on CUSTOM_AMOUNT return lines in “Items” (eligible totals exclude them from Returns).
      const customReturnLineMoneyCents = Math.max(0, returnsLineTotalMoneyAllCents - returnsTotalCents);
      const taxInItemsCents = Math.max(
        returnsTaxCents,
        Math.max(0, returnsTotalCents - returnsCents),
        customReturnLineMoneyCents
      );
      const linePlusReturnsItemsCents =
        grossCents + returnsCents + taxInItemsCents + returnServiceChargeReturnedCents;
      // Keep the old heuristic as an upper-bound fallback when Square’s strict fields are missing.
      reportGrossCents = Math.max(reportGrossCents, linePlusReturnsItemsCents, lawrencevilleOrderItemsGrossAgg);
    } else {
      reportGrossCents = Math.max(reportGrossCents, lawrencevilleOrderItemsGrossAgg);
    }
    // Prefer strict net when available; otherwise fall back to heuristic identity.
    if (!(lrvLineGrossCents > 0 && lrvDiscountAppliedCents >= 0 && strictReturnsCents >= 0)) {
      netSalesCents = reportGrossCents - returnsCents - discountCents;
    }
  }

  const deliveryNetCents = Math.max(0, deliveryGrossCents - deliveryDiscountCents);

  // Gift card activity:
  // - Activated/Sold: gift card sales (loads)
  // - Redeemed: gift card tender used
  const activatedCents = Math.max(giftCardSalesCents, giftCardActivatedFromActivitiesCents);
  const redeemedCents = Math.max(giftCardRedeemedCents, giftCardRedeemedFromActivitiesCents);

  // Align Gift Card Sales to "Deferred sales" in Square report
  giftCardSalesCents = activatedCents;

  // Square “Total Sales”:
  // - If the period has returns, the official report already nets them into Net Sales/Tax/Tips, and does NOT
  //   subtract refunds again.
  // - Otherwise (no returns), subtract refunds.
  const totalSalesCents =
    netSalesCents + taxCents + tipCents + giftCardSalesCents - (returnsCents > 0 ? 0 : refundCents);

  const commissionCents = Math.round(activatedCents * 0.05);
  const loadFeesCents = Math.round(activatedCents * 0.025);
  // Square “Collected” includes cash tendered before change; we compute it from tenders above.
  // Commission/load fees are reported separately in your layout, but not added to collected.
  //
  // Adjust for refunds so "Total payments collected" matches Square (net of refunds).
  collectedCents = Math.max(0, collectedCents - refundCents);

  // 3) Gift card activity (activated/redeemed)
  return {
    locationId,
    weekStart: format(effectiveRange.weekStart, "yyyy-MM-dd"),
    weekEnd: format(effectiveRange.weekEnd, "yyyy-MM-dd"),
    ordersCount,
    grossSales: centsToDollars(reportGrossCents),
    discounts: centsToDollars(discountCents),
    refunds: centsToDollars(refundsDisplayedCents),
    netSales: centsToDollars(netSalesCents),
    tax: centsToDollars(taxCents),
    tips: centsToDollars(tipCents),
    giftCardSales: centsToDollars(giftCardSalesCents),
    totalSales: centsToDollars(totalSalesCents),
    collected: centsToDollars(collectedCents),
    ...(locationId === LAWRENCEVILLE_LOCATION_ID
      ? {
          _debugLawrenceville: {
            startAt,
            endAt,
            grossCents,
            reportGrossCents,
            discountCents,
            returnsCents,
            returnsTaxCents,
            returnsTotalCents,
            returnsLineTotalMoneyAllCents,
            customReturnLineMoneyCents: Math.max(0, returnsLineTotalMoneyAllCents - returnsTotalCents),
            returnServiceChargeReturnedCents,
            serviceChargeCents,
            cardSurchargeCents,
            lawrencevilleGrossFromTotalsAgg,
            lawrencevilleGrossFromTotalsWins,
            lawrencevilleOrderItemsGrossAgg,
            refundCents,
            refundsFromReturnsCents,
            refundsFromRefundObjectsCents,
            returnsTipFromAmountsCents,
            inferredReturnedTipCents:
              returnsTotalCents > 0 && refundCents > 0 ? Math.max(0, refundCents - returnsTotalCents) : 0,
            lawrencevilleNameGiftCardLineGrossCents,
            lawrencevilleNameGiftCardLineCount,
            excludedByDeliveryCount,
            excludedByExternalDeliveryCount,
            excludedByDeliveryOrOnlineContentCount,
            excludedBySquareOnlineHeuristicCount,
            excludedUnpaidCount,
            excludedNoSaleTenderCount,
            excludedReturnOnlyAdjustmentCount,
            excludedGrossCents,
            excludedTipCents,
            lrvCompletedOrders,
            lrvOrdersWithItems,
            lrvLineGrossCents,
            lrvLineCardSurchargeCents,
            lrvDiscountAppliedCents,
            lrvReturnsTotalMoneyCents,
            lrvReturnsMerchOnlyCents,
            lrvOrdersNoItemsNoReturns,
            lrvSampleNoItemsNoReturnsIds,
            lrvNetFromNetAmountsCents,
          },
        }
      : {}),
    delivery: {
      grossSales: centsToDollars(deliveryGrossCents),
      discounts: centsToDollars(deliveryDiscountCents),
      refunds: 0,
      netSales: centsToDollars(deliveryNetCents),
    },
    giftCardActivity: {
      activated: centsToDollars(activatedCents),
      sold: centsToDollars(activatedCents),
      redeemed: centsToDollars(redeemedCents),
      commission: centsToDollars(commissionCents),
      loadFees: centsToDollars(loadFeesCents),
    },
  };
}

