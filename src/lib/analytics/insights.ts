import type { ExecutiveInsight, LocationPerformanceRow } from "@/lib/analytics/types";

function dollars(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function buildExecutiveInsights(rows: LocationPerformanceRow[], companyWowPct: number | null): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  const withSales = rows.filter((r) => r.grossSales > 0 || r.netSales > 0);
  if (withSales.length === 0) return insights;

  const highestGross = [...withSales].sort((a, b) => b.grossSales - a.grossSales)[0];
  insights.push({
    kind: "highest_gross",
    title: "Highest grossing location",
    detail: `${highestGross.locationName} led the week at ${dollars(highestGross.grossSales)} gross.`,
  });

  const wowSorted = [...withSales].filter((r) => r.wowPct != null).sort((a, b) => (b.wowPct ?? 0) - (a.wowPct ?? 0));
  if (wowSorted[0]) {
    insights.push({
      kind: "wow_growth",
      title: "Largest week-over-week growth",
      detail: `${wowSorted[0].locationName} up ${pct(wowSorted[0].wowPct)} vs prior week.`,
    });
  }
  const wowWorst = wowSorted[wowSorted.length - 1];
  if (wowWorst && (wowWorst.wowPct ?? 0) < 0) {
    insights.push({
      kind: "wow_decline",
      title: "Largest week-over-week decline",
      detail: `${wowWorst.locationName} down ${pct(wowWorst.wowPct)} vs prior week.`,
    });
  }

  const yoySorted = [...withSales].filter((r) => r.yoyPct != null).sort((a, b) => (b.yoyPct ?? 0) - (a.yoyPct ?? 0));
  if (yoySorted[0]) {
    insights.push({
      kind: "yoy_growth",
      title: "Largest year-over-year growth",
      detail: `${yoySorted[0].locationName} up ${pct(yoySorted[0].yoyPct)} vs same week last year.`,
    });
  }
  const yoyWorst = yoySorted[yoySorted.length - 1];
  if (yoyWorst && (yoyWorst.yoyPct ?? 0) < 0) {
    insights.push({
      kind: "yoy_decline",
      title: "Largest year-over-year decline",
      detail: `${yoyWorst.locationName} down ${pct(yoyWorst.yoyPct)} vs same week last year.`,
    });
  }

  const consecutive = withSales.filter((r) => r.consecutiveDeclines >= 2);
  for (const row of consecutive.slice(0, 3)) {
    insights.push({
      kind: "consecutive_decline",
      title: "Consecutive sales declines",
      detail: `${row.locationName} has declined ${row.consecutiveDeclines} week(s) in a row.`,
    });
  }

  if (companyWowPct != null) {
    const above = withSales.filter((r) => r.wowPct != null && (r.wowPct ?? 0) > companyWowPct);
    if (above.length > 0) {
      const names = above
        .slice(0, 4)
        .map((r) => r.locationName)
        .join(", ");
      insights.push({
        kind: "above_avg",
        title: "Outperforming company WoW average",
        detail: `${above.length} location(s) beat the ${pct(companyWowPct)} system average — ${names}${above.length > 4 ? ", …" : ""}.`,
      });
    }

    const below = withSales.filter((r) => r.wowPct != null && (r.wowPct ?? 0) < companyWowPct);
    if (below.length > 0) {
      const names = below
        .slice(0, 4)
        .map((r) => r.locationName)
        .join(", ");
      insights.push({
        kind: "below_avg",
        title: "Underperforming company WoW average",
        detail: `${below.length} location(s) trail the ${pct(companyWowPct)} system average — ${names}${below.length > 4 ? ", …" : ""}.`,
      });
    }
  }

  return insights;
}

export function buildFlavorMovers(
  current: { name: string; units: number }[],
  prior: { name: string; units: number }[]
) {
  const priorMap = new Map(prior.map((f) => [f.name, f.units]));
  const names = new Set([...current.map((f) => f.name), ...prior.map((f) => f.name)]);

  const movers = [...names].map((name) => {
    const currentUnits = current.find((f) => f.name === name)?.units ?? 0;
    const priorUnits = priorMap.get(name) ?? 0;
    const unitChange = currentUnits - priorUnits;
    const unitWowPct = priorUnits === 0 ? (currentUnits > 0 ? null : 0) : ((currentUnits - priorUnits) / priorUnits) * 100;
    return { name, currentUnits, priorUnits, unitChange, unitWowPct };
  });

  const gainers = movers
    .filter((m) => m.unitChange > 0)
    .sort((a, b) => b.unitChange - a.unitChange)
    .slice(0, 5);

  const decliners = movers
    .filter((m) => m.unitChange < 0)
    .sort((a, b) => a.unitChange - b.unitChange)
    .slice(0, 5);

  return { gainers, decliners };
}
