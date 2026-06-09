import { cache } from "react";
import { addDays, subYears, format } from "date-fns";
import {
  formatWeekParam,
  getWeekRangeMondayToMondayInTimeZone,
  weekLabelFromMondayYmd,
  type WeekRange,
} from "@/lib/dates/weekRange";
import { aggregateAnalyticsWeek, salesSnapshotFromMap } from "@/lib/analytics/aggregate";
import { pctChange } from "@/lib/analytics/compare";
import { fetchAnalyticsOrders, mapLimit } from "@/lib/analytics/ordersFetch";
import { analyticsLocationName, getAnalyticsLocations } from "@/lib/analytics/locations";
import { buildExecutiveInsights, buildFlavorMovers } from "@/lib/analytics/insights";
import { computeHealthScore, countConsecutiveDeclines, topFlavorWowPct } from "@/lib/analytics/health";
import type {
  CompanyOverview,
  FlavorRankingRow,
  LocationPerformanceRow,
  TrendWeek,
  WeeklyPerformanceDashboard,
} from "@/lib/analytics/types";

const TZ = "America/New_York";
const TREND_WEEK_COUNT = 10;

function weekRangeFromMondayYmd(mondayYmd: string): WeekRange {
  const anchor = new Date(`${mondayYmd}T12:00:00.000Z`);
  return getWeekRangeMondayToMondayInTimeZone(anchor, TZ);
}

function priorYearMondayYmd(mondayYmd: string): string {
  const anchor = new Date(`${mondayYmd}T12:00:00.000Z`);
  return formatWeekParam(subYears(anchor, 1));
}

function sumSales(map: Map<string, { grossSales: number; netSales: number }>) {
  let gross = 0;
  let net = 0;
  for (const v of map.values()) {
    gross += v.grossSales;
    net += v.netSales;
  }
  return { gross, net };
}

function countDirection(rows: LocationPerformanceRow[], field: "wowPct" | "yoyPct") {
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const row of rows) {
    const pct = row[field];
    if (pct == null) continue;
    if (pct > 0.5) up += 1;
    else if (pct < -0.5) down += 1;
    else flat += 1;
  }
  return { up, down, flat };
}

async function loadWeeklyPerformanceDashboardUncached(weekStartYmd: string): Promise<WeeklyPerformanceDashboard> {
  const locations = getAnalyticsLocations();
  const locationIds = locations.map((l) => l.id);

  const currentRange = weekRangeFromMondayYmd(weekStartYmd);
  const priorMonday = formatWeekParam(addDays(currentRange.weekStart, -7));
  const priorRange = weekRangeFromMondayYmd(priorMonday);
  const priorYearYmd = priorYearMondayYmd(weekStartYmd);
  const priorYearRange = weekRangeFromMondayYmd(priorYearYmd);

  const trendMondays: string[] = [];
  for (let i = TREND_WEEK_COUNT - 1; i >= 0; i--) {
    trendMondays.push(formatWeekParam(addDays(currentRange.weekStart, -7 * i)));
  }

  const trendRanges = trendMondays.map((m) => weekRangeFromMondayYmd(m));
  const uniqueTrendRanges = trendRanges.filter(
    (r, idx) => trendMondays[idx] !== weekStartYmd && trendMondays[idx] !== priorMonday
  );
  const uniqueTrendMondays = trendMondays.filter((m) => m !== weekStartYmd && m !== priorMonday);

  const [currentOrders, priorOrders, priorYearOrders, extraTrendOrderBatches] = await Promise.all([
    fetchAnalyticsOrders(locationIds, currentRange),
    fetchAnalyticsOrders(locationIds, priorRange),
    fetchAnalyticsOrders(locationIds, priorYearRange),
    mapLimit(uniqueTrendRanges, 3, (range) => fetchAnalyticsOrders(locationIds, range)),
  ]);

  const currentAgg = aggregateAnalyticsWeek(currentOrders, locationIds);
  const priorAgg = aggregateAnalyticsWeek(priorOrders, locationIds);
  const priorYearAgg = aggregateAnalyticsWeek(priorYearOrders, locationIds);

  const trendAggByMonday = new Map<string, ReturnType<typeof aggregateAnalyticsWeek>>();
  trendAggByMonday.set(weekStartYmd, currentAgg);
  trendAggByMonday.set(priorMonday, priorAgg);
  uniqueTrendMondays.forEach((m, i) => {
    trendAggByMonday.set(m, aggregateAnalyticsWeek(extraTrendOrderBatches[i], locationIds));
  });

  const companyCurrentGross = [...currentAgg.salesByLocation.values()].reduce((s, x) => s + x.grossSales, 0);
  const companyAvgGross = companyCurrentGross / Math.max(1, locationIds.length);

  const locationRows: LocationPerformanceRow[] = locations.map((loc) => {
    const cur = salesSnapshotFromMap(currentAgg.salesByLocation, loc.id);
    const prior = salesSnapshotFromMap(priorAgg.salesByLocation, loc.id);
    const priorYear = salesSnapshotFromMap(priorYearAgg.salesByLocation, loc.id);
    const curProducts = currentAgg.productsByLocation.get(loc.id);
    const priorProducts = priorAgg.productsByLocation.get(loc.id);

    const wowPct = pctChange(cur.netSales, prior.netSales);
    const yoyPct = pctChange(cur.netSales, priorYear.netSales);

    const topFlavor = curProducts?.topFlavor ?? null;
    const topItem = curProducts?.topItem ?? null;
    const shopNet = curProducts?.shopNetSales ?? 0;
    const flavorWow = topFlavorWowPct(
      curProducts?.flavors ?? [],
      priorProducts?.flavors ?? [],
      topFlavor?.name ?? null
    );

    const weeklyNets = trendMondays.map((m) => {
      const agg = trendAggByMonday.get(m);
      return salesSnapshotFromMap(agg?.salesByLocation ?? new Map(), loc.id).netSales;
    });
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
      priorWeekNet: prior.netSales,
      priorYearNet: priorYear.netSales,
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
  const priorTotalNet = [...priorAgg.salesByLocation.values()].reduce((s, x) => s + x.netSales, 0);
  const priorYearTotalNet = [...priorYearAgg.salesByLocation.values()].reduce((s, x) => s + x.netSales, 0);
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

  const priorFlavorUnits = new Map(priorAgg.companyFlavors.map((f) => [f.name, f.units]));
  const flavorTop10: FlavorRankingRow[] = currentAgg.companyFlavors.slice(0, 10).map((f, idx) => {
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

  const { gainers, decliners } = buildFlavorMovers(currentAgg.companyFlavors, priorAgg.companyFlavors);
  const topFlavorName = currentAgg.companyFlavors[0]?.name ?? null;

  const trends: TrendWeek[] = trendMondays.map((m) => {
    const agg = trendAggByMonday.get(m)!;
    const byLocation: Record<string, { grossSales: number; netSales: number }> = {};
    for (const id of locationIds) {
      const snap = salesSnapshotFromMap(agg.salesByLocation, id);
      byLocation[id] = { grossSales: snap.grossSales, netSales: snap.netSales };
    }
    const totals = sumSales(new Map(Object.entries(byLocation).map(([k, v]) => [k, v])));
    const topFlavorUnits: Record<string, number> = {};
    if (topFlavorName) {
      const leader = agg.companyFlavors.find((f) => f.name === topFlavorName);
      topFlavorUnits[topFlavorName] = leader?.units ?? 0;
    }
    return {
      weekStartYmd: m,
      weekLabel: weekLabelFromMondayYmd(m),
      grossSales: totals.gross,
      netSales: totals.net,
      byLocation,
      topFlavorUnits,
    };
  });

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
    trends,
    topFlavorName,
  };
}

export const loadWeeklyPerformanceDashboard = cache(loadWeeklyPerformanceDashboardUncached);
