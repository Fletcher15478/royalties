import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROYALTY_RATE = 0.05;

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
    /* missing .env.local in CI; env may already be set */
  }
}

loadEnvLocal();

function fivePct(net: number) {
  return Math.round(net * ROYALTY_RATE * 100) / 100;
}

async function main() {
  const { format } = await import("date-fns");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");
  const { MILLIES_LOCATIONS } = await import("../src/lib/locations/millies");
  const { getWeekRangeMondayToMondayInTimeZone } = await import("../src/lib/dates/weekRange");
  const tz = "America/New_York";
  const weekStartYmd = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : "2026-04-13";
  const anchorUtc = new Date(`${weekStartYmd}T12:00:00.000Z`);
  const range = getWeekRangeMondayToMondayInTimeZone(anchorUtc, tz);
  const locs = MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);

  const rows: { name: string; net: number; royalty5: number }[] = [];
  for (const loc of locs) {
    try {
      const t0 = Date.now();
      console.log("Fetching", loc.name, loc.id);
      const d = await getLocationWeeklyDetail(loc.id, range, { timeZone: tz });
      const net = d.netSales;
      console.log("  OK", loc.name, `$${net.toFixed(2)}`, `${Date.now() - t0}ms`);
      rows.push({ name: loc.name, net, royalty5: fivePct(net) });
    } catch (e: any) {
      console.error("Failed location:", loc.name, loc.id);
      console.error(e);
      process.exit(1);
    }
  }
  const sorted = rows.sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  lines.push("Net sales & 5% royalty — one row per shop (royalty = 5% of that shop’s net).");
  lines.push(`Week Mon ${weekStartYmd} through Sun ${format(new Date(range.weekEnd.getTime() - 1), "yyyy-MM-dd")} (ET).`);
  lines.push(
    `  Window: ${format(range.weekStart, "yyyy-MM-dd HH:mm")} → ${format(range.weekEnd, "yyyy-MM-dd HH:mm")} (end exclusive, America/New_York).`
  );
  lines.push("");
  lines.push("Location\tNet sales\t5% royalty");
  for (const r of sorted) {
    lines.push(`${r.name}\t$${r.net.toFixed(2)}\t$${r.royalty5.toFixed(2)}`);
  }
  const totalNet = sorted.reduce((s, r) => s + r.net, 0);
  const totalRoyalty = sorted.reduce((s, r) => s + r.royalty5, 0);
  lines.push("");
  lines.push(`TOTAL\t$${totalNet.toFixed(2)}\t$${totalRoyalty.toFixed(2)}`);
  const out = join(process.cwd(), `net-sales-${weekStartYmd}-week.txt`);
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log("Wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
