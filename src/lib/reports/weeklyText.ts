import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";
import { computeRoyalties } from "@/lib/royalties/calc";
import { MILLIES_LOCATIONS } from "@/lib/locations/millies";
import { getWeekRangeMondayToMondayInTimeZone, type WeekRange } from "@/lib/dates/weekRange";
import { ROYALTY_CONFIG_BY_LOCATION_ID } from "@/lib/royalties/config";
import type { GiftCardPriorMonthReconciliation } from "@/lib/reports/types";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pct(rate: number) {
  const p = rate * 100;
  if (Math.abs(p - Math.round(p)) < 1e-6) return `${Math.round(p)}%`;
  const rounded = Math.round(p * 10) / 10;
  return `${rounded}%`;
}

function padTitle(title: string, width = 27) {
  const inner = ` ${title} `;
  const left = Math.max(0, Math.floor((width - inner.length) / 2));
  const right = Math.max(0, width - inner.length - left);
  return `${"=".repeat(left)}${inner}${"=".repeat(right)}`;
}

function entityDisplayName(entity: string) {
  if (entity === "Frosty Flamingo LLC") return "Frosty Flamingo";
  if (entity === "HHT Frozen Holdings LLC") return "HHT Holdings";
  if (entity === "JACO Builders LLC") return "JACO Builders";
  if (entity === "ICETeen Corp") return "Teen";
  if (entity === "Happy Penguin, LLC") return "Happy Penguin";
  return entity;
}

/** Official-looking labels matching the printed workbook */
function locationReportTitle(locationId: string, fallback: string): string {
  if (locationId === "LWE92DR7GY9N4") return "Oakland C&C";
  return fallback;
}

/** Calendar month name for tech fee line (“April Technology Fee”), from the 1st that falls inside the ET week */
function techFeeBannerMonthEt(weekMondayYmdEt: string, tz: string): string {
  const [y, mo, da] = weekMondayYmdEt.split("-").map(Number);
  const anchor = fromZonedTime(new Date(y, mo - 1, da, 12, 0, 0), tz);
  for (let i = 0; i < 7; i++) {
    const day = addDays(anchor, i);
    if (formatInTimeZone(day, tz, "d") === "1") {
      return formatInTimeZone(day, tz, "MMMM");
    }
  }
  return "April";
}

const DELIVERY_NOTE_END_MARKERS: Partial<Record<string, string>> = {
  "2026-04-06": "Apr 12",
  "2026-03-30": "Apr 05",
  "2026-03-23": "Mar 31",
};

function deliveryWaiverEndsLabelEt(weekMondayYmdEt: string, tz: string, range: WeekRange): string {
  const byWeek = DELIVERY_NOTE_END_MARKERS[weekMondayYmdEt];
  if (byWeek) return byWeek;
  const lastMoment = new Date(range.weekEnd.getTime() - 1);
  return formatInTimeZone(lastMoment, tz, "MMM dd");
}

function priorMonthGcReconciliationLines(g: GiftCardPriorMonthReconciliation): string[] {
  const lines: string[] = [];
  let n = 1;
  lines.push(`  ${n++}. Value Activated: ${money(g.valueActivated)}`);
  lines.push(`  ${n++}. Less Value Redeemed: ${money(g.valueRedeemed)}`);
  lines.push(
    `  ${n++}. Less Commission (on ${money(g.commissionOnSoldDollars ?? 0)} Sold): ${money(g.commissionAmount ?? 0)}`
  );
  if (g.loadFeesAmount != null) {
    lines.push(`  ${n++}. Less Gift Card Load Fees: ${money(g.loadFeesAmount)}`);
  }
  lines.push(`  ${n}. Equals: ${money(g.equalsAmount)}`);

  const out = [`${g.monthLabel} Gift Card Reconciliation:`, ...lines];
  if (g.amountDueToFranchisee != null) {
    out.push(`Amount due to franchisee: ${money(g.amountDueToFranchisee)}`);
  }
  if (g.amountDueToHQ != null) {
    out.push(`Amount due to Millie's HQ: ${money(g.amountDueToHQ)}`);
  }
  return out;
}

export async function buildWeeklyTextReport(params: { weekStartYmd: string; timeZone?: string }) {
  const tz = params.timeZone ?? "America/New_York";
  const anchorUtc = new Date(`${params.weekStartYmd}T12:00:00.000Z`);
  const range: WeekRange = getWeekRangeMondayToMondayInTimeZone(anchorUtc, tz);
  const weekMondayYmdEt = formatInTimeZone(range.weekStart, tz, "yyyy-MM-dd");

  const includedLocations = MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);

  // Avoid fully-parallel Square fanout; it can rate-limit and fail the entire report.
  const details: {
    loc: (typeof includedLocations)[number];
    d: Awaited<ReturnType<typeof getLocationWeeklyDetail>>;
    cfg: (typeof ROYALTY_CONFIG_BY_LOCATION_ID)[string] | undefined;
    royalty: ReturnType<typeof computeRoyalties> | { configured: false };
  }[] = [];
  for (const loc of includedLocations) {
    const d = await getLocationWeeklyDetail(loc.id, range, { timeZone: tz });
    const cfg = ROYALTY_CONFIG_BY_LOCATION_ID[loc.id];
    const royalty = cfg
      ? computeRoyalties(loc.id, d.netSales, {
          excludeDeliveryNetSales: 0,
          weekStartYmd: weekMondayYmdEt,
          weekEndYmd: formatInTimeZone(range.weekEnd, tz, "yyyy-MM-dd"),
          techFeeCadence: "monthly",
        })
      : ({ configured: false } as const);
    details.push({ loc, d, cfg, royalty });
  }

  const byEntity = new Map<string, typeof details>();
  for (const row of details) {
    const key = row.cfg?.entity ?? "Unconfigured";
    const arr = byEntity.get(key) ?? [];
    arr.push(row);
    byEntity.set(key, arr);
  }

  const startLabel = formatInTimeZone(range.weekStart, tz, "yyyy-MM-dd hh:mm a");
  const endLabel = formatInTimeZone(range.weekEnd, tz, "yyyy-MM-dd hh:mm a");

  const deliveryLine = `Note: Royalties on delivery services are waived for Nov 01 … ${deliveryWaiverEndsLabelEt(weekMondayYmdEt, tz, range)}.`;

  const lines: string[] = [];
  lines.push(`Calculating royalties for period:`);
  lines.push(`  Start: ${startLabel}`);
  lines.push(`  End: ${endLabel}`);
  lines.push("");

  for (const [entity, rows] of Array.from(byEntity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const title = entity === "Unconfigured" ? "Unconfigured" : entityDisplayName(entity);

    lines.push("=".repeat(27));
    lines.push(padTitle(title.toUpperCase()));
    lines.push("=".repeat(27));
    lines.push(deliveryLine);
    lines.push("");

    for (const r of rows.sort((a, b) => a.loc.name.localeCompare(b.loc.name))) {
      lines.push(`----- ${locationReportTitle(r.loc.id, r.loc.name)} -----`);
      lines.push("");

      if (!r.cfg) {
        lines.push(`Weekly Royalty:`);
        lines.push(`  1. Net Sales: ${money(r.d.netSales)}`);
        lines.push(`    - Square Sales: ${money(r.d.netSales)}`);
      } else {
        const rate = r.cfg.royaltyRate ?? 0;
        const royaltyAmount = r.royalty.configured ? (r.royalty.royaltyAmount ?? 0) : 0;
        const techFee = r.royalty.configured ? (r.royalty.techFee ?? 0) : 0;
        const totalDue = r.royalty.configured ? (r.royalty.totalDue ?? royaltyAmount + techFee) : royaltyAmount;
        let step = 1;

        lines.push(`Weekly Royalty:`);
        lines.push(`  ${step++}. Net Sales: ${money(r.d.netSales)}`);
        lines.push(`    - Square Sales: ${money(r.d.netSales)}`);
        lines.push(`  ${step++}. ${pct(rate)} royalty on Net Sales: ${money(royaltyAmount)}`);
        const assessTech = Boolean(r.royalty.configured && (r.royalty.techFeeAssessed ?? false) && techFee > 0);
        if (assessTech) {
          const mn = techFeeBannerMonthEt(weekMondayYmdEt, tz);
          lines.push(`  ${step++}. Plus ${mn} Technology Fee: ${money(techFee)}`);
        }
        lines.push(`  ${step++}. Equals: ${money(totalDue)}`);
        lines.push(`Amount due to Millie's HQ: ${money(totalDue)}`);
      }
      lines.push("");

      const gc = r.d.giftCardActivity;
      const showGc =
        (gc?.activated ?? 0) !== 0 ||
        (gc?.sold ?? 0) !== 0 ||
        (gc?.redeemed ?? 0) !== 0 ||
        (gc?.commission ?? 0) !== 0 ||
        (gc?.loadFees ?? 0) !== 0;

      if (showGc) {
        lines.push(`Gift Card Activity This Week:`);
        // Square Sales Summary: Deferred sales (“sold”) + Gift card redeemed; Gift Card Activity: activations & load fees
        if ((gc?.sold ?? 0) !== 0) lines.push(`  Sold (Deferred sales): ${money(gc.sold)}`);
        if ((gc?.activated ?? 0) !== 0) lines.push(`  Activated (GC activity report): ${money(gc.activated)}`);
        if ((gc?.redeemed ?? 0) !== 0) lines.push(`  Redeemed: ${money(gc.redeemed)}`);
        if ((gc?.sold ?? 0) !== 0 && gc.commission != null) {
          lines.push(`  Commission (on Sold): ${money(gc.commission)}`);
        }
        if ((gc?.sold ?? 0) !== 0 && gc.loadFees != null) {
          lines.push(`  Load Fees (2.5% of Sold, workbook): ${money(gc.loadFees)}`);
        }
        lines.push("");
      }

      const gcMonth = r.d.giftCardCalendarMonth;
      const recon = r.d.giftCardPriorMonthReconciliation;
      const skipCalendarDup =
        gcMonth && recon && gcMonth.monthLabel === recon.monthLabel;
      if (gcMonth && !skipCalendarDup) {
        const gm = gcMonth.activity;
        lines.push(`${gcMonth.monthLabel} Gift Card Activity:`);
        if ((gm?.sold ?? 0) !== 0) lines.push(`  Sold (Deferred sales): ${money(gm.sold)}`);
        if ((gm?.activated ?? 0) !== 0) lines.push(`  Activated (GC activity report): ${money(gm.activated)}`);
        if ((gm?.redeemed ?? 0) !== 0) lines.push(`  Redeemed: ${money(gm.redeemed)}`);
        if ((gm?.sold ?? 0) !== 0 && gm.commission != null) {
          lines.push(`  Commission (on Sold): ${money(gm.commission)}`);
        }
        if ((gm?.sold ?? 0) !== 0 && gm.loadFees != null) {
          lines.push(`  Load Fees (2.5% of Sold, workbook): ${money(gm.loadFees)}`);
        }
        lines.push("");
      }

      if (recon) {
        for (const L of priorMonthGcReconciliationLines(recon)) {
          lines.push(L);
        }
        lines.push("");
      }

      lines.push(`Square Metrics:`);
      lines.push(`  # Orders: ${r.d.ordersCount.toLocaleString()}`);
      lines.push(`  Gross Sales: ${money(r.d.grossSales)}`);
      const inferredReturns = Math.max(0, r.d.grossSales - r.d.discounts - r.d.netSales);
      if (inferredReturns > 0) lines.push(`    Returns: ${money(inferredReturns)}`);
      lines.push(`    Discounts: ${money(r.d.discounts)}`);
      lines.push(`  Net Sales: ${money(r.d.netSales)}`);
      if (r.d.refunds) lines.push(`    Refunds: ${money(r.d.refunds)}`);
      lines.push(`    Tax: ${money(r.d.tax)}`);
      lines.push(`    Tips: ${money(r.d.tips)}`);
      if (r.d.giftCardSales) lines.push(`    Gift Card Sales: ${money(r.d.giftCardSales)}`);
      lines.push(`  Total Sales: ${money(r.d.totalSales)}`);
      lines.push(`  Collected: ${money(r.d.collected)}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
