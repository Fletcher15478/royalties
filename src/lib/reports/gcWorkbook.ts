import type { GiftCardPriorMonthReconciliation } from "@/lib/reports/types";

/**
 * Millie’s franchise gift-card workbook (HQ spreadsheet):
 * - Activated, Redeemed from activity / tenders
 * - Plus GC Sold = deferred sales (sold) — commission base
 * - Less GC Commission = 5% of **Sold**
 * - Less GC Activation (load) fee = 2.5% of **Sold** (same base as commission in the workbook)
 * - Total GC = Activated − Redeemed − Commission − Load fee
 *   Positive → due to HQ; negative → due to franchisee.
 */
export function buildGiftCardWorkbookReconciliation(params: {
  monthLabel: string;
  soldCents: number;
  activatedCents: number;
  redeemedCents: number;
}): GiftCardPriorMonthReconciliation | undefined {
  const { monthLabel, soldCents, activatedCents, redeemedCents } = params;
  if (soldCents === 0 && activatedCents === 0 && redeemedCents === 0) return undefined;

  const commissionCents = Math.round(soldCents * 0.05);
  const loadFeesCents = soldCents > 0 ? Math.round(soldCents * 0.025) : 0;

  const equalsCents = activatedCents - redeemedCents - commissionCents - loadFeesCents;
  const roundMoney = (cents: number) => Math.round(cents) / 100;

  const valueActivated = roundMoney(activatedCents);
  const valueRedeemed = roundMoney(redeemedCents);
  const commissionOnSoldDollars = soldCents > 0 ? roundMoney(soldCents) : null;
  const commissionAmount = soldCents > 0 ? roundMoney(commissionCents) : 0;
  const loadFeesAmount = soldCents > 0 ? roundMoney(loadFeesCents) : null;
  const equalsAmount = roundMoney(equalsCents);

  const out: GiftCardPriorMonthReconciliation = {
    monthLabel,
    valueActivated,
    valueRedeemed,
    commissionOnSoldDollars,
    commissionAmount,
    loadFeesAmount,
    equalsAmount,
  };

  if (equalsAmount > 0) out.amountDueToHQ = equalsAmount;
  else if (equalsAmount < 0) out.amountDueToFranchisee = Math.abs(equalsAmount);

  return out;
}
