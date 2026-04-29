import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[k] = v;
    }
  } catch {
    /* missing .env.local in CI; env may already be set */
  }
}

loadEnvLocal();

type Row = {
  weekStartYmd: string; // Monday (ET)
  weekEndYmd: string; // next Monday (ET)
  locationId: string;
  locationName: string;
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
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableSquareError(e: any): boolean {
  const code = Number(e?.statusCode ?? e?.rawResponse?.status ?? NaN);
  if (code === 429) return true;
  if (code >= 500 && code <= 599) return true;
  const msg = String(e?.message ?? "");
  if (msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET") || msg.includes("fetch failed")) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 6): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (!isRetryableSquareError(e) || attempt >= maxAttempts) break;
      const backoff = Math.min(60_000, 750 * 2 ** (attempt - 1));
      console.warn(`[retry ${attempt}/${maxAttempts}] ${label} → waiting ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function formatYmd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const tz = "America/New_York";
  const year = Number(process.argv[2] ?? "2026");
  const throughWeekMonday = process.argv[3] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[3]) ? process.argv[3] : null;

  const { addDays } = await import("date-fns");
  const { formatInTimeZone } = await import("date-fns-tz");
  const { getWeekRangeMondayToMondayInTimeZone, formatWeekParam } = await import("../src/lib/dates/weekRange");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");
  const { MILLIES_LOCATIONS } = await import("../src/lib/locations/millies");

  const includedLocations = MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);

  // Find first Monday of the year in ET.
  const jan2NoonUtc = new Date(Date.UTC(year, 0, 2, 12, 0, 0));
  const firstWeek = getWeekRangeMondayToMondayInTimeZone(jan2NoonUtc, tz);
  let weekStart = firstWeek.weekStart;

  // End at the ET week containing 'through' (defaults to current week).
  const now = new Date();
  const anchorThroughUtc = throughWeekMonday ? new Date(`${throughWeekMonday}T12:00:00.000Z`) : now;
  const throughRange = getWeekRangeMondayToMondayInTimeZone(anchorThroughUtc, tz);
  const throughMondayYmd = formatWeekParam(throughRange.weekStart);

  const rows: Row[] = [];
  while (true) {
    const range = getWeekRangeMondayToMondayInTimeZone(weekStart, tz);
    const weekStartYmd = formatInTimeZone(range.weekStart, tz, "yyyy-MM-dd");
    const weekEndYmd = formatInTimeZone(range.weekEnd, tz, "yyyy-MM-dd");
    if (weekStartYmd < `${year}-01-01`) {
      weekStart = addDays(weekStart, 7);
      continue;
    }
    if (weekStartYmd > throughMondayYmd) break;

    console.log(`\n=== Week ${weekStartYmd} → ${formatInTimeZone(new Date(range.weekEnd.getTime() - 1), tz, "yyyy-MM-dd")} (ET) ===`);

    for (const loc of includedLocations) {
      const label = `${weekStartYmd} ${loc.name} ${loc.id}`;
      const d = await withRetry(
        () => getLocationWeeklyDetail(loc.id, range, { timeZone: tz, forceSquare: true }),
        label
      );
      rows.push({
        weekStartYmd,
        weekEndYmd,
        locationId: loc.id,
        locationName: loc.name,
        ordersCount: d.ordersCount,
        grossSales: d.grossSales,
        discounts: d.discounts,
        refunds: d.refunds,
        netSales: d.netSales,
        tax: d.tax,
        tips: d.tips,
        giftCardSales: d.giftCardSales,
        totalSales: d.totalSales,
        collected: d.collected,
      });
      console.log(`  OK ${loc.name}\tNet $${d.netSales.toFixed(2)}\tOrders ${d.ordersCount}`);
    }

    weekStart = addDays(weekStart, 7);
  }

  const jsonPath = join(process.cwd(), `square-ytd-${year}-weekly.json`);
  writeFileSync(jsonPath, JSON.stringify({ year, throughMondayYmd, generatedAt: new Date().toISOString(), rows }, null, 2), "utf8");

  const tsvPath = join(process.cwd(), `square-ytd-${year}-weekly.tsv`);
  const header = [
    "weekStartYmd",
    "weekEndYmd",
    "locationId",
    "locationName",
    "ordersCount",
    "grossSales",
    "discounts",
    "refunds",
    "netSales",
    "tax",
    "tips",
    "giftCardSales",
    "totalSales",
    "collected",
  ].join("\t");
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.weekStartYmd,
        r.weekEndYmd,
        r.locationId,
        r.locationName,
        r.ordersCount,
        r.grossSales.toFixed(2),
        r.discounts.toFixed(2),
        r.refunds.toFixed(2),
        r.netSales.toFixed(2),
        r.tax.toFixed(2),
        r.tips.toFixed(2),
        r.giftCardSales.toFixed(2),
        r.totalSales.toFixed(2),
        r.collected.toFixed(2),
      ].join("\t")
    );
  }
  writeFileSync(tsvPath, lines.join("\n") + "\n", "utf8");

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${tsvPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

