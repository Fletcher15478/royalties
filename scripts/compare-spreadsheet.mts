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

/** Leadership spreadsheet net sales (Jun 1–7, 2026) */
const SPREADSHEET: Record<string, number> = {
  "L4EY6CN442VGB": 12771, // Shadyside
  "LHK34R2VTWF87": 1184, // GE Meridian
  "L09KC5S41GQRP": 17107,
  "LZGJ6T9JYFG7W": 8144,
  "LRVZG0XCQPASB": 10176,
  "LWE92DR7GY9N4": 2417,
  "LF70VBZ7CDMHE": 7001,
  "LEAVYE5AMZF06": 10132,
  "LK15PMM2F5SGB": 3395,
  "LQQKGMSGV8V1M": 6324,
  "LK5H7DE78S097": 4518,
  "LNS0D59DSEW9J": 6291,
  "L9WPKVJZFGZS4": 16520,
  "LWW1CFV8T5DTF": 9299,
  "LJDR9RFPDTZX3": 7652,
  "LGHK54YYZZCNA": 4383,
  "L2P2FKMPD9WZ8": 1117,
};

async function main() {
  const { MILLIES_LOCATIONS } = await import("../src/lib/locations/millies");
  const { getWeekRangeMondayToMondayInTimeZone } = await import("../src/lib/dates/weekRange");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");
  const { getLocationWeeklySummary } = await import("../src/lib/square/weeklySummary");
  const { loadLocationRoyaltyBundle } = await import("../src/lib/royalties/locationBundle");

  const tz = "America/New_York";
  const weekStartYmd = "2026-06-02";
  const anchorUtc = new Date(`${weekStartYmd}T12:00:00.000Z`);
  const range = getWeekRangeMondayToMondayInTimeZone(anchorUtc, tz);

  const ids = Object.keys(SPREADSHEET);
  const nameById = new Map(MILLIES_LOCATIONS.map((l) => [l.id, l.name]));

  console.log(
    "Location\tSpreadsheet\tDetail\tSummary\tCombined\tDel\tΔ detail\tΔ combined"
  );

  for (const id of ids) {
    const name = nameById.get(id) ?? id;
    const sheet = SPREADSHEET[id];
    const [detail, summary, bundle] = await Promise.all([
      getLocationWeeklyDetail(id, range, { timeZone: tz, forceSquare: true }),
      getLocationWeeklySummary(id, range),
      loadLocationRoyaltyBundle({ locationId: id, range, timeZone: tz }),
    ]);
    const d = detail.netSales;
    const s = summary.netSales;
    const c = bundle.combinedNetSales;
    const del = bundle.deliveryNetSales;
    console.log(
      `${name}\t${sheet}\t${d.toFixed(2)}\t${s.toFixed(2)}\t${c.toFixed(2)}\t${del.toFixed(2)}\t${(sheet - d).toFixed(2)}\t${(sheet - c).toFixed(2)}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
