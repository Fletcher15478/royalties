import type { DeliveryRoyaltyRecord, ThirdPartyDeliveryPlatform } from "@/lib/square/delivery/types";

const PLATFORM_LABEL: Record<ThirdPartyDeliveryPlatform, string> = {
  doordash: "DoorDash",
  uber_eats: "Uber Eats",
  grubhub: "Grubhub",
  unknown: "Other / Unknown",
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function padTitle(title: string, width = 27) {
  const inner = ` ${title} `;
  const left = Math.max(0, Math.floor((width - inner.length) / 2));
  const right = Math.max(0, width - inner.length - left);
  return `${"=".repeat(left)}${inner}${"=".repeat(right)}`;
}

function sumRecords(records: DeliveryRoyaltyRecord[]) {
  return records.reduce(
    (acc, r) => {
      acc.gross += r.grossSales;
      acc.returns += r.returns;
      acc.marketing += r.marketingDiscounts;
      acc.otherDisc += r.otherDiscounts;
      acc.refunds += r.refundsOnOrder + r.refundsFromPaymentsApi;
      acc.deliveryFees += r.deliveryFeesExcluded;
      acc.net += r.netRoyaltyEligible;
      const p = r.platform;
      if (!acc.byPlatform[p]) acc.byPlatform[p] = { count: 0, net: 0 };
      acc.byPlatform[p].count += 1;
      acc.byPlatform[p].net += r.netRoyaltyEligible;
      return acc;
    },
    {
      gross: 0,
      returns: 0,
      marketing: 0,
      otherDisc: 0,
      refunds: 0,
      deliveryFees: 0,
      net: 0,
      byPlatform: {} as Record<ThirdPartyDeliveryPlatform, { count: number; net: number }>,
    }
  );
}

function formatOrderLine(r: DeliveryRoyaltyRecord): string {
  const plat = PLATFORM_LABEL[r.platform];
  const idShort = r.orderId.length > 12 ? `${r.orderId.slice(0, 12)}…` : r.orderId;
  const parts = [`Gross ${money(r.grossSales)}`];
  if (r.returns > 0) parts.push(`Returns ${money(r.returns)}`);
  if (r.marketingDiscounts > 0) parts.push(`Marketing ${money(r.marketingDiscounts)}`);
  if (r.otherDiscounts > 0) parts.push(`Other disc. ${money(r.otherDiscounts)}`);
  const refTotal = r.refundsOnOrder + r.refundsFromPaymentsApi;
  if (refTotal > 0) parts.push(`Refunds ${money(refTotal)}`);
  parts.push(`Net ${money(r.netRoyaltyEligible)}`);
  return `  [${plat}] ${idShort} — ${parts.join(", ")}`;
}

const MAX_ORDER_LINES = 20;

/**
 * Text block for one location's third-party delivery week (DoorDash / Uber / Grubhub).
 * Returns [] when there were no delivery orders in the period.
 */
export function formatLocationDeliverySection(records: DeliveryRoyaltyRecord[]): string[] {
  if (records.length === 0) return [];

  const t = sumRecords(records);
  const lines: string[] = [];

  lines.push(`Third-Party Delivery (This Week):`);
  lines.push(`  Royalties on delivery are waived; figures below are for reconciliation only.`);
  lines.push(`  Orders: ${records.length.toLocaleString()}`);
  lines.push("");

  lines.push(`  By platform:`);
  for (const key of ["doordash", "uber_eats", "grubhub", "unknown"] as ThirdPartyDeliveryPlatform[]) {
    const bucket = t.byPlatform[key];
    if (!bucket?.count) continue;
    lines.push(
      `    ${PLATFORM_LABEL[key]}: ${bucket.count} order${bucket.count === 1 ? "" : "s"} — Net eligible ${money(bucket.net)}`
    );
  }
  lines.push("");

  lines.push(`  Week totals (all delivery orders):`);
  lines.push(`    Gross merchandise: ${money(t.gross)}`);
  if (t.returns > 0) lines.push(`    Less returns: ${money(t.returns)}`);
  if (t.marketing > 0) lines.push(`    Less marketing / promo discounts: ${money(t.marketing)}`);
  if (t.otherDisc > 0) lines.push(`    Less other discounts: ${money(t.otherDisc)}`);
  if (t.refunds > 0) lines.push(`    Less refunds: ${money(t.refunds)}`);
  if (t.deliveryFees > 0) lines.push(`    Delivery fees (excluded from gross): ${money(t.deliveryFees)}`);
  lines.push(`    Net royalty-eligible (waived): ${money(t.net)}`);
  lines.push("");

  lines.push(`  Order detail:`);
  const sorted = [...records].sort((a, b) => b.netRoyaltyEligible - a.netRoyaltyEligible);
  for (const r of sorted.slice(0, MAX_ORDER_LINES)) {
    lines.push(formatOrderLine(r));
  }
  if (sorted.length > MAX_ORDER_LINES) {
    lines.push(`  … and ${sorted.length - MAX_ORDER_LINES} more delivery order(s).`);
  }

  return lines;
}

/** Roll-up across all locations for the end of the report. */
export function formatDeliveryReportSummary(
  allRecords: DeliveryRoyaltyRecord[],
  locationNames: Map<string, string>
): string[] {
  if (allRecords.length === 0) return [];

  const lines: string[] = [];
  lines.push("=".repeat(27));
  lines.push(padTitle("DELIVERY SUMMARY"));
  lines.push("=".repeat(27));
  lines.push(`Third-party delivery (DoorDash, Uber Eats, Grubhub) — all locations`);
  lines.push(`  Total orders: ${allRecords.length.toLocaleString()}`);
  lines.push("");

  const byLoc = new Map<string, DeliveryRoyaltyRecord[]>();
  for (const r of allRecords) {
    const arr = byLoc.get(r.locationId) ?? [];
    arr.push(r);
    byLoc.set(r.locationId, arr);
  }

  lines.push(`  By location:`);
  for (const [locId, recs] of Array.from(byLoc.entries()).sort((a, b) => {
    const na = locationNames.get(a[0]) ?? a[0];
    const nb = locationNames.get(b[0]) ?? b[0];
    return na.localeCompare(nb);
  })) {
    const name = locationNames.get(locId) ?? locId;
    const net = recs.reduce((s, x) => s + x.netRoyaltyEligible, 0);
    lines.push(`    ${name}: ${recs.length} orders — Net eligible ${money(net)}`);
  }

  const t = sumRecords(allRecords);
  lines.push("");
  lines.push(`  Network totals:`);
  lines.push(`    Gross merchandise: ${money(t.gross)}`);
  if (t.returns > 0) lines.push(`    Less returns: ${money(t.returns)}`);
  if (t.marketing > 0) lines.push(`    Less marketing discounts: ${money(t.marketing)}`);
  if (t.otherDisc > 0) lines.push(`    Less other discounts: ${money(t.otherDisc)}`);
  if (t.refunds > 0) lines.push(`    Less refunds: ${money(t.refunds)}`);
  lines.push(`    Net royalty-eligible (waived): ${money(t.net)}`);
  lines.push("");

  return lines;
}
