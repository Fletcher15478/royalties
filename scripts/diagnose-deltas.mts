import { readFileSync } from "node:fs";
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[k] = v;
    }
  } catch {
    /* env may already be set */
  }
}

loadEnvLocal();

const SPREADSHEET: Record<string, number> = {
  LZGJ6T9JYFG7W: 8144,
  LRVZG0XCQPASB: 10176,
  LEAVYE5AMZF06: 10132,
  LQQKGMSGV8V1M: 6324,
  LWW1CFV8T5DTF: 9299,
};

async function main() {
  const { MILLIES_LOCATIONS } = await import("../src/lib/locations/millies");
  const { getWeekRangeMondayToMondayInTimeZone } = await import("../src/lib/dates/weekRange");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");
  const { syncDeliveryRoyaltiesForLocation } = await import("../src/lib/square/delivery/service");
  const { aggregateDeliveryRecords } = await import("../src/lib/square/delivery/aggregate");

  const tz = "America/New_York";
  const weekStartYmd = "2026-06-02";
  const anchorUtc = new Date(`${weekStartYmd}T12:00:00.000Z`);
  const range = getWeekRangeMondayToMondayInTimeZone(anchorUtc, tz);
  const nameById = new Map(MILLIES_LOCATIONS.map((l) => [l.id, l.name]));

  for (const id of Object.keys(SPREADSHEET)) {
    const sheet = SPREADSHEET[id];
    const name = nameById.get(id) ?? id;
    const [detail, { records }] = await Promise.all([
      getLocationWeeklyDetail(id, range, { timeZone: tz, forceSquare: true }),
      syncDeliveryRoyaltiesForLocation({ locationId: id, range, timeZone: tz }),
    ]);
    const delivery = aggregateDeliveryRecords(records);
    const inStore = detail.netSales;
    const combinedNet = inStore + delivery.netRoyaltyEligible;
    const combinedGrossDel = inStore + delivery.grossSales;
    const combinedGrossMinusFees =
      inStore + delivery.grossSales - delivery.platformFees - delivery.marketingDiscounts;
    const combinedGrossMinusReturns =
      inStore + delivery.grossSales - delivery.returns - delivery.marketingDiscounts - delivery.otherDiscounts;

    console.log(`\n=== ${name} (sheet ${sheet}) ===`);
    console.log(`  inStore net: ${inStore.toFixed(2)}`);
    console.log(`  delivery gross: ${delivery.grossSales.toFixed(2)} netRoyalty: ${delivery.netRoyaltyEligible.toFixed(2)}`);
    console.log(`  delivery fees: ${delivery.platformFees.toFixed(2)} mktg: ${delivery.marketingDiscounts.toFixed(2)} returns: ${delivery.returns.toFixed(2)}`);
    console.log(`  + netRoyalty => ${combinedNet.toFixed(2)} (Δ ${(sheet - combinedNet).toFixed(2)})`);
    console.log(`  + del gross => ${combinedGrossDel.toFixed(2)} (Δ ${(sheet - combinedGrossDel).toFixed(2)})`);
    console.log(`  + gross-fees-mktg => ${combinedGrossMinusFees.toFixed(2)} (Δ ${(sheet - combinedGrossMinusFees).toFixed(2)})`);
    console.log(`  + gross-returns-mktg-other => ${combinedGrossMinusReturns.toFixed(2)} (Δ ${(sheet - combinedGrossMinusReturns).toFixed(2)})`);
    console.log(`  sheet implied delivery: ${(sheet - inStore).toFixed(2)}`);
  }
}

main().catch(console.error);
