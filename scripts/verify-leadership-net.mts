import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEADERSHIP_WEEKLY_NET, leadershipWeekKey } from "../src/lib/analytics/leadershipWeeklyNet";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[t.slice(0, i).trim()] = v;
    }
  } catch {
    /* env may already be set */
  }
}

loadEnvLocal();

async function main() {
  const { getAnalyticsLocations } = await import("../src/lib/analytics/locations");
  const { getWeekRangeMondayToMondayInTimeZone } = await import("../src/lib/dates/weekRange");
  const { loadLeadershipSalesSnapshot } = await import("../src/lib/analytics/leadershipNet");

  const tz = "America/New_York";
  const weekMonday = "2026-06-01";
  const expected = LEADERSHIP_WEEKLY_NET[weekMonday];
  if (!expected) throw new Error("Missing expected week data");

  const range = getWeekRangeMondayToMondayInTimeZone(
    new Date(`${weekMonday}T12:00:00.000Z`),
    tz
  );
  const key = leadershipWeekKey(range, tz);
  console.log("ET Monday key:", key);
  if (key !== weekMonday) throw new Error(`Week key mismatch: ${key} !== ${weekMonday}`);

  const locations = getAnalyticsLocations();
  let failures = 0;
  let total = 0;

  for (const loc of locations) {
    const sheet = expected[loc.id];
    if (sheet == null) continue;
    const snap = await loadLeadershipSalesSnapshot(loc.id, range, tz);
    total += snap.netSales;
    const delta = snap.netSales - sheet;
    const ok = Math.abs(delta) < 0.01;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "OK" : "FAIL"}\t${loc.name}\tsheet ${sheet}\tgot ${snap.netSales.toFixed(2)}`
    );
  }

  const sheetTotal = Object.values(expected).reduce((s, n) => s + n, 0);
  console.log(`\nTotal sheet ${sheetTotal} got ${total.toFixed(2)}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
