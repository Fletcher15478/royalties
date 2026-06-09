import { format } from "date-fns";
import { weekLabelFromMondayYmd } from "@/lib/dates/weekRange";
import { pctChange } from "@/lib/analytics/compare";
import { analyticsLocationName, getAnalyticsLocations } from "@/lib/analytics/locations";
import { buildExecutiveInsights, buildFlavorMovers } from "@/lib/analytics/insights";
import { computeHealthScore, countConsecutiveDeclines, topFlavorWowPct } from "@/lib/analytics/health";
import type { AnalyticsWeekPayload } from "@/lib/analytics/loadWeek";
import type { DashboardWeekKeys } from "@/lib/analytics/weekUtils";
import type {
  CompanyOverview,
  FlavorRankingRow,
  LocationPerformanceRow,
  LocationSalesSnapshot,
  WeeklyPerformanceDashboard,
} from "@/lib/analytics/types";

function snap(payload: AnalyticsWeekPayload | undefined, locationId: string): LocationSalesSnapshot {
  return (
    payload?.salesByLocation[locationId] ?? {
      locationId,
      ordersCount: 0,
      grossSales: 0,
      discounts: 0,
      refunds: 0,
      netSales: 0,
    }
  );
}

function countDirection(rows: LocationPerformanceRow[], field: "wowPct" | "yoyPct") {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const row of rows) {
    const p = row[field];
    if (p == null) continue;
    if (p > 0.5) up += 1;
    else if (p < -0.5) down += 1;
    else flat += 1;
  }
  return { up, down, flat };
}

export function composeWeeklyPerformanceDashboard(
  weekStartYmd: string,
  keys: DashboardWeekKeys,
  weeks: Record<string, AnalyticsWeekPayload>
): WeeklyPerformanceDashboard {
  const locations = getAnalyticsLocations();
  const current = weeks[keys.current];
  const prior = weeks[keys.prior];
  const priorYear = weeks[keys.priorYear];

  const companyCurrentGross = locations.reduce(
    (s, loc) => s + snap(current, loc.id).grossSales,
    0
  );
  const companyAvgGross = companyCurrentGross / Math.max(1, locations.length);

  const declineMondays = [keys.current, keys.prior, keys.decline2, keys.decline3];

  const locationRows: LocationPerformanceRow[] = locations.map((loc) => {
    const cur = snap(current, loc.id);
    const prev = snap(prior, loc.id);
    const py = snap(priorYear, loc.id);
    const curProducts = current?.productsByLocation?.[loc.id];
    const priorProducts = prior?.productsByLocation?.[loc.id];

    const wowPct = pctChange(cur.netSales, prev.netSales);
    const yoyPct = pctChange(cur.netSales, py.netSales);

    const topFlavor = curProducts?.topFlavor ?? null;
    const topItem = curProducts?.topItem ?? null;
    const shopNet = curProducts?.shopNetSales ?? 0;
    const flavorWow = topFlavorWowPct(
      curProducts?.flavors ?? [],
      priorProducts?.flavors ?? [],
      topFlavor?.name ?? null
    );

    const weeklyNets = declineMondays.map((m) => snap(weeks[m], loc.id).netSales);
    const consecutiveDeclines = countConsecutiveDeclines(weeklyNets);

    const health = computeHealthScore({
      wowPct,
      yoyPct,
      grossSales: cur.grossSales,
      companyAvgGross,
      topFlavorWowPct: flavorWow,
    });

    return {
      locationId: loc.id,
      locationName: analyticsLocationName(loc.id, loc.name),
      grossSales: cur.grossSales,
      netSales: cur.netSales,
      priorWeekNet: prev.netSales,
      priorYearNet: py.netSales,
      wowPct,
      yoyPct,
      healthScore: health.score,
      healthLabel: health.label,
      topFlavor,
      topItem,
      topFlavorWowPct: flavorWow,
      topFlavorMixPct: shopNet > 0 && topFlavor ? (topFlavor.revenue / shopNet) * 100 : null,
      topItemMixPct: shopNet > 0 && topItem ? (topItem.revenue / shopNet) * 100 : null,
      consecutiveDeclines,
    };
  });

  locationRows.sort((a, b) => b.grossSales - a.grossSales);

  const totalGross = locationRows.reduce((s, r) => s + r.grossSales, 0);
  const totalNet = locationRows.reduce((s, r) => s + r.netSales, 0);
  const priorTotalNet = locations.reduce((s, loc) => s + snap(prior, loc.id).netSales, 0);
  const priorYearTotalNet = locations.reduce((s, loc) => s + snap(priorYear, loc.id).netSales, 0);
  const wowPct = pctChange(totalNet, priorTotalNet);
  const yoyPct = pctChange(totalNet, priorYearTotalNet);
  const wowCounts = countDirection(locationRows, "wowPct");
  const yoyCounts = countDirection(locationRows, "yoyPct");

  const company: CompanyOverview = {
    totalGross,
    totalNet,
    wowPct,
    yoyPct,
    locationsUpWow: wowCounts.up,
    locationsDownWow: wowCounts.down,
    locationsFlatWow: wowCounts.flat,
    locationsUpYoy: yoyCounts.up,
    locationsDownYoy: yoyCounts.down,
    locationsFlatYoy: yoyCounts.flat,
  };

  const priorFlavorUnits = new Map((prior?.companyFlavors ?? []).map((f) => [f.name, f.units]));
  const flavorTop10: FlavorRankingRow[] = (current?.companyFlavors ?? []).slice(0, 10).map((f, idx) => {
    const priorWeekUnits = priorFlavorUnits.get(f.name) ?? 0;
    return {
      rank: idx + 1,
      name: f.name,
      units: f.units,
      revenue: f.revenue,
      priorWeekUnits,
      unitWowPct: pctChange(f.units, priorWeekUnits),
    };
  });

  const { gainers, decliners } = buildFlavorMovers(
    current?.companyFlavors ?? [],
    prior?.companyFlavors ?? []
  );
  const topFlavorName = current?.companyFlavors?.[0]?.name ?? null;

  return {
    weekStartYmd,
    weekLabel: weekLabelFromMondayYmd(weekStartYmd),
    generatedAt: format(new Date(), "MMM d, yyyy h:mm a"),
    company,
    insights: buildExecutiveInsights(locationRows, wowPct),
    locations: locationRows,
    flavorTop10,
    flavorGainers: gainers,
    flavorDecliners: decliners,
    trends: [],
    topFlavorName,
  };
}
