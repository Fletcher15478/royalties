import type { DeliveryRoyaltyRecord, DeliveryWeekTotals, ThirdPartyDeliveryPlatform } from "@/lib/square/delivery/types";

export function aggregateDeliveryRecords(records: DeliveryRoyaltyRecord[]): DeliveryWeekTotals {
  const byPlatform: DeliveryWeekTotals["byPlatform"] = {
    doordash: { count: 0, netRoyaltyEligible: 0, platformFees: 0 },
    uber_eats: { count: 0, netRoyaltyEligible: 0, platformFees: 0 },
    grubhub: { count: 0, netRoyaltyEligible: 0, platformFees: 0 },
    unknown: { count: 0, netRoyaltyEligible: 0, platformFees: 0 },
  };

  const totals: DeliveryWeekTotals = {
    orderCount: records.length,
    grossSales: 0,
    returns: 0,
    marketingDiscounts: 0,
    otherDiscounts: 0,
    refunds: 0,
    platformFees: 0,
    netRoyaltyEligible: 0,
    byPlatform,
  };

  for (const r of records) {
    totals.grossSales += r.grossSales;
    totals.returns += r.returns;
    totals.marketingDiscounts += r.marketingDiscounts;
    totals.otherDiscounts += r.otherDiscounts;
    totals.refunds += r.refundsOnOrder + r.refundsFromPaymentsApi;
    totals.platformFees += r.platformFee;
    totals.netRoyaltyEligible += r.netRoyaltyEligible;
    const b = byPlatform[r.platform];
    b.count += 1;
    b.netRoyaltyEligible += r.netRoyaltyEligible;
    b.platformFees += r.platformFee;
  }

  totals.grossSales = Math.round(totals.grossSales * 100) / 100;
  totals.returns = Math.round(totals.returns * 100) / 100;
  totals.marketingDiscounts = Math.round(totals.marketingDiscounts * 100) / 100;
  totals.otherDiscounts = Math.round(totals.otherDiscounts * 100) / 100;
  totals.refunds = Math.round(totals.refunds * 100) / 100;
  totals.platformFees = Math.round(totals.platformFees * 100) / 100;
  totals.netRoyaltyEligible = Math.round(totals.netRoyaltyEligible * 100) / 100;

  return totals;
}
