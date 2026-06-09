"use client";

import { useEffect, useState } from "react";
import { HealthBadge } from "@/components/analytics/HealthBadge";
import { PctBadge } from "@/components/analytics/PctBadge";
import { WeeklyPerformanceCharts } from "@/components/analytics/WeeklyPerformanceCharts";
import { dollars, pct } from "@/components/analytics/format";
import { composeWeeklyPerformanceDashboard } from "@/lib/analytics/composeDashboard";
import type { AnalyticsWeekPayload } from "@/lib/analytics/loadWeek";
import { getDashboardWeekKeys } from "@/lib/analytics/weekUtils";
import type { WeeklyPerformanceDashboard } from "@/lib/analytics/types";

async function fetchAnalyticsWeek(week: string, detail: "full" | "sales"): Promise<AnalyticsWeekPayload> {
  const res = await fetch(`/api/analytics/week?week=${week}&detail=${detail}`, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to load week ${week}`);
  }
  return json;
}

type Props = {
  weekParam: string;
};

export function WeeklyPerformanceData({ weekParam }: Props) {
  const [data, setData] = useState<WeeklyPerformanceDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading current and prior week…");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setData(null);
      setError(null);
      setStatus("Loading current and prior week…");

      try {
        const keys = getDashboardWeekKeys(weekParam);

        const [current, prior] = await Promise.all([
          fetchAnalyticsWeek(keys.current, "full"),
          fetchAnalyticsWeek(keys.prior, "full"),
        ]);
        if (cancelled) return;

        setStatus("Loading prior year and trend context…");
        const [priorYear, decline2, decline3] = await Promise.all([
          fetchAnalyticsWeek(keys.priorYear, "sales"),
          fetchAnalyticsWeek(keys.decline2, "sales"),
          fetchAnalyticsWeek(keys.decline3, "sales"),
        ]);
        if (cancelled) return;

        const weeks: Record<string, AnalyticsWeekPayload> = {
          [keys.current]: current,
          [keys.prior]: prior,
          [keys.priorYear]: priorYear,
          [keys.decline2]: decline2,
          [keys.decline3]: decline3,
        };

        setData(composeWeeklyPerformanceDashboard(weekParam, keys, weeks));
        setStatus("");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [weekParam]);

  if (error) {
    return (
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-900">Could not load weekly performance</h2>
        <p className="mt-2 text-sm text-red-800">{error}</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-red-900 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">{status}</p>
          <p className="mt-1 text-sm text-amber-800">
            Data loads one week at a time from Square to stay within server limits. This usually takes 30–90 seconds.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {["a", "b", "c", "d"].map((k) => (
            <div key={k} className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
      </div>
    );
  }

  const topLocationsForChart = data.locations.slice(0, 5).map((l) => ({
    id: l.locationId,
    name: l.locationName,
  }));

  return (
    <>
      <p className="mt-1 text-xs text-zinc-500">Generated {data.generatedAt}</p>

      <section className="mt-6">
        <SectionHeader title="Company overview" subtitle="System-wide totals for the selected week" />
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total gross sales" value={dollars(data.company.totalGross)} />
          <StatCard label="Total net sales" value={dollars(data.company.totalNet)} />
          <StatCard label="Company WoW" value={pct(data.company.wowPct)} highlight />
          <StatCard label="Company YoY" value={pct(data.company.yoyPct)} highlight />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MiniStat label="Locations up vs prior week" value={String(data.company.locationsUpWow)} positive />
          <MiniStat label="Locations down vs prior week" value={String(data.company.locationsDownWow)} negative />
          <MiniStat label="Locations up vs prior year" value={String(data.company.locationsUpYoy)} positive />
          <MiniStat label="Locations down vs prior year" value={String(data.company.locationsDownYoy)} negative />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="Executive insights" subtitle="Auto-generated highlights for Monday leadership review" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.insights.map((insight) => (
            <div key={`${insight.kind}-${insight.title}`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">{insight.title}</h3>
              <p className="mt-1 text-sm text-zinc-700">{insight.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <SectionHeader title="Location performance" subtitle="Sorted by gross sales. WoW and YoY compare net sales." inline />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Health</th>
                <th className="px-5 py-3 font-medium">Gross sales</th>
                <th className="px-5 py-3 font-medium">Net sales</th>
                <th className="px-5 py-3 font-medium">Prior week</th>
                <th className="px-5 py-3 font-medium">WoW %</th>
                <th className="px-5 py-3 font-medium">Prior year</th>
                <th className="px-5 py-3 font-medium">YoY %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {data.locations.map((row) => (
                <tr key={row.locationId} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-semibold text-zinc-900">{row.locationName}</td>
                  <td className="px-5 py-3">
                    <HealthBadge label={row.healthLabel} score={row.healthScore} />
                  </td>
                  <td className="px-5 py-3 tabular-nums font-medium">{dollars(row.grossSales)}</td>
                  <td className="px-5 py-3 tabular-nums">{dollars(row.netSales)}</td>
                  <td className="px-5 py-3 tabular-nums text-zinc-600">{dollars(row.priorWeekNet)}</td>
                  <td className="px-5 py-3">
                    <PctBadge value={row.wowPct} />
                  </td>
                  <td className="px-5 py-3 tabular-nums text-zinc-600">{dollars(row.priorYearNet)}</td>
                  <td className="px-5 py-3">
                    <PctBadge value={row.yoyPct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="Product performance by location" subtitle="Top flavor and top menu item this week" />
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.locations.map((row) => (
            <div key={row.locationId} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-zinc-900">{row.locationName}</h3>
              <div className="mt-3 space-y-3 text-sm">
                <ProductBlock
                  title="Top selling flavor"
                  name={row.topFlavor?.name}
                  qty={row.topFlavor?.units}
                  qtyLabel="scoops"
                  revenue={row.topFlavor?.revenue}
                  mixPct={row.topFlavorMixPct}
                />
                <ProductBlock
                  title="Top selling item"
                  name={row.topItem?.name}
                  qty={row.topItem?.qty}
                  qtyLabel="sold"
                  revenue={row.topItem?.revenue}
                  mixPct={row.topItemMixPct}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <SectionHeader title="Top 10 flavors — company-wide" subtitle="Ranked by units sold this week" inline />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-700">
                <tr>
                  <th className="px-5 py-3 font-medium">Rank</th>
                  <th className="px-5 py-3 font-medium">Flavor</th>
                  <th className="px-5 py-3 font-medium">Units</th>
                  <th className="px-5 py-3 font-medium">Revenue</th>
                  <th className="px-5 py-3 font-medium">WoW units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {data.flavorTop10.map((f) => (
                  <tr key={f.name}>
                    <td className="px-5 py-3 tabular-nums text-zinc-600">{f.rank}</td>
                    <td className="px-5 py-3 font-medium text-zinc-900">{f.name}</td>
                    <td className="px-5 py-3 tabular-nums">{f.units.toLocaleString()}</td>
                    <td className="px-5 py-3 tabular-nums">{dollars(f.revenue)}</td>
                    <td className="px-5 py-3">
                      <PctBadge value={f.unitWowPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <FlavorMoverList title="Biggest flavor gainers" items={data.flavorGainers} positive />
          <FlavorMoverList title="Biggest flavor decliners" items={data.flavorDecliners} positive={false} />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="Trend visualizations" subtitle="Last 8 weeks — loads after main metrics" />
        <div className="mt-4">
          <WeeklyPerformanceCharts
            weekParam={weekParam}
            topLocationIds={topLocationsForChart}
            topFlavorName={data.topFlavorName}
          />
        </div>
      </section>
    </>
  );
}

function SectionHeader({
  title,
  subtitle,
  inline,
}: {
  title: string;
  subtitle: string;
  inline?: boolean;
}) {
  if (inline) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-zinc-700">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${highlight ? "text-[var(--brand)]" : "text-zinc-900"}`}>{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const color = positive ? "text-emerald-700" : negative ? "text-red-700" : "text-zinc-900";
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ProductBlock({
  title,
  name,
  qty,
  qtyLabel,
  revenue,
  mixPct,
}: {
  title: string;
  name?: string;
  qty?: number;
  qtyLabel: string;
  revenue?: number;
  mixPct: number | null;
}) {
  if (!name) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
        <p className="mt-1 text-zinc-500">No data</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <p className="mt-1 font-semibold text-zinc-900">{name}</p>
      <p className="mt-0.5 text-zinc-700">
        {(qty ?? 0).toLocaleString()} {qtyLabel} · {dollars(revenue ?? 0)} revenue ·{" "}
        {mixPct != null ? `${mixPct.toFixed(1)}%` : "—"} of shop mix
      </p>
    </div>
  );
}

function FlavorMoverList({
  title,
  items,
  positive,
}: {
  title: string;
  items: { name: string; unitChange: number }[];
  positive: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <li className="text-zinc-500">No movers this week.</li>
        ) : (
          items.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-3">
              <span className="font-medium text-zinc-900">{item.name}</span>
              <span className={positive ? "text-emerald-700" : "text-red-700"}>
                {positive ? "+" : ""}
                {item.unitChange.toLocaleString()} units
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
