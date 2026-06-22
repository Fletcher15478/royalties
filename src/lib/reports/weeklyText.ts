import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { MILLIES_LOCATIONS } from "@/lib/locations/millies";
import { getWeekRangeMondayToMondayInTimeZone, type WeekRange } from "@/lib/dates/weekRange";
import { ROYALTY_CONFIG_BY_LOCATION_ID } from "@/lib/royalties/config";
import type { DeliveryRoyaltyRecord } from "@/lib/square/delivery/types";
import { loadLocationRoyaltyBundle } from "@/lib/royalties/locationBundle";
import { formatDeliveryReportSummary, formatLocationDeliverySection } from "@/lib/reports/deliveryText";

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
  if (entity === "Paige2 LLC") return "Paige2";
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

export async function buildWeeklyTextReport(params: { weekStartYmd: string; timeZone?: string }) {
  const tz = params.timeZone ?? "America/New_York";
  const anchorUtc = new Date(`${params.weekStartYmd}T12:00:00.000Z`);
  const range: WeekRange = getWeekRangeMondayToMondayInTimeZone(anchorUtc, tz);
  const weekMondayYmdEt = formatInTimeZone(range.weekStart, tz, "yyyy-MM-dd");

  const includedLocations = MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);

  const details: {
    loc: (typeof includedLocations)[number];
    bundle: Awaited<ReturnType<typeof loadLocationRoyaltyBundle>>;
    cfg: (typeof ROYALTY_CONFIG_BY_LOCATION_ID)[string] | undefined;
  }[] = [];
  for (const loc of includedLocations) {
    const bundle = await loadLocationRoyaltyBundle({
      locationId: loc.id,
      range,
      timeZone: tz,
    });
    const cfg = ROYALTY_CONFIG_BY_LOCATION_ID[loc.id];
    details.push({ loc, bundle, cfg });
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

  const lines: string[] = [];
  const allDeliveryRecords: DeliveryRoyaltyRecord[] = [];
  const locationNames = new Map(includedLocations.map((l) => [l.id, l.name]));

  lines.push(`Calculating royalties for period:`);
  lines.push(`  Start: ${startLabel}`);
  lines.push(`  End: ${endLabel}`);
  lines.push("");

  for (const [entity, rows] of Array.from(byEntity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const title = entity === "Unconfigured" ? "Unconfigured" : entityDisplayName(entity);

    lines.push("=".repeat(27));
    lines.push(padTitle(title.toUpperCase()));
    lines.push("=".repeat(27));
    lines.push(`Note: Royalties include in-store Square sales and third-party delivery (DoorDash, Uber Eats, Grubhub).`);
    lines.push("");

    for (const r of rows.sort((a, b) => a.loc.name.localeCompare(b.loc.name))) {
      const { bundle } = r;
      const d = bundle.detail;
      const royalty = bundle.royalty;

      lines.push(`----- ${locationReportTitle(r.loc.id, r.loc.name)} -----`);
      lines.push("");

      if (!r.cfg) {
        lines.push(`Weekly Royalty:`);
        lines.push(`  1. Combined Net Sales: ${money(bundle.combinedNetSales)}`);
        lines.push(`    - In-store: ${money(bundle.inStoreNetSales)}`);
        if (bundle.delivery.orderCount > 0) {
          lines.push(`    - Third-party delivery: ${money(bundle.deliveryNetSales)}`);
        }
      } else {
        const rate = r.cfg.royaltyRate ?? 0;
        const royaltyAmount = royalty.configured ? (royalty.royaltyAmount ?? 0) : 0;
        const techFee = royalty.configured ? (royalty.techFee ?? 0) : 0;
        const totalDue = royalty.configured ? (royalty.totalDue ?? royaltyAmount + techFee) : royaltyAmount;
        let step = 1;

        lines.push(`Weekly Royalty:`);
        lines.push(`  ${step++}. In-store Net Sales: ${money(bundle.inStoreNetSales)}`);
        lines.push(`    - Square Sales (excludes delivery apps)`);
        if (bundle.delivery.orderCount > 0) {
          lines.push(`  ${step++}. Third-party Delivery Net Sales: ${money(bundle.deliveryNetSales)}`);
          lines.push(`    - Orders: ${bundle.delivery.orderCount}`);
          const del = bundle.delivery;
          if (del.platformFees > 0) {
            lines.push(`    - Less platform fees (DD / Uber / Grubhub): ${money(del.platformFees)}`);
          }
          if (del.marketingDiscounts > 0) {
            lines.push(`    - Less marketing / promo: ${money(del.marketingDiscounts)}`);
          }
          if (del.returns > 0) lines.push(`    - Less returns: ${money(del.returns)}`);
          if (del.refunds > 0) lines.push(`    - Less refunds: ${money(del.refunds)}`);
        }
        lines.push(`  ${step++}. Combined Net Sales: ${money(bundle.combinedNetSales)}`);
        lines.push(`  ${step++}. ${pct(rate)} royalty on Combined Net Sales: ${money(royaltyAmount)}`);
        const assessTech = Boolean(royalty.configured && (royalty.techFeeAssessed ?? false) && techFee > 0);
        if (assessTech) {
          const mn = techFeeBannerMonthEt(weekMondayYmdEt, tz);
          lines.push(`  ${step++}. Plus ${mn} Technology Fee: ${money(techFee)}`);
        }
        lines.push(`  ${step++}. Equals: ${money(totalDue)}`);
        lines.push(`Amount due to Millie's HQ: ${money(totalDue)}`);
      }
      lines.push("");

      allDeliveryRecords.push(...bundle.deliveryRecords);
      const deliveryLines = formatLocationDeliverySection(bundle.deliveryRecords);
      if (deliveryLines.length > 0) {
        for (const L of deliveryLines) {
          lines.push(L);
        }
        lines.push("");
      }

      const gc = d.giftCardActivity;
      const showGc = (gc?.activated ?? 0) !== 0 || (gc?.redeemed ?? 0) !== 0;

      if (showGc) {
        lines.push(`Gift Card Activity This Week:`);
        if ((gc?.activated ?? 0) !== 0) lines.push(`  Activated: ${money(gc.activated)}`);
        if ((gc?.redeemed ?? 0) !== 0) lines.push(`  Redeemed: ${money(gc.redeemed)}`);
        lines.push("");
      }

      lines.push(`Square Metrics (in-store):`);
      lines.push(`  # Orders: ${d.ordersCount.toLocaleString()}`);
      lines.push(`  Gross Sales: ${money(d.grossSales)}`);
      const inferredReturns = Math.max(0, d.grossSales - d.discounts - d.netSales);
      if (inferredReturns > 0) lines.push(`    Returns: ${money(inferredReturns)}`);
      lines.push(`    Discounts: ${money(d.discounts)}`);
      lines.push(`  Net Sales: ${money(d.netSales)}`);
      if (d.refunds) lines.push(`    Refunds: ${money(d.refunds)}`);
      lines.push(`    Tax: ${money(d.tax)}`);
      lines.push(`    Tips: ${money(d.tips)}`);
      if (d.giftCardSales) lines.push(`    Gift Card Sales: ${money(d.giftCardSales)}`);
      lines.push(`  Total Sales: ${money(d.totalSales)}`);
      lines.push(`  Collected: ${money(d.collected)}`);
      lines.push("");
    }
  }

  for (const L of formatDeliveryReportSummary(allDeliveryRecords, locationNames)) {
    lines.push(L);
  }

  return lines.join("\n");
}
