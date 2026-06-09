"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { weekLabelFromMondayYmd } from "@/lib/dates/weekRange";
import type { AnalyticsWeekPayload } from "@/lib/analytics/loadWeek";
import { getDashboardWeekKeys } from "@/lib/analytics/weekUtils";
import type { TrendWeek } from "@/lib/analytics/types";
import { dollars } from "@/components/analytics/format";

type Props = {
  weekParam: string;
  topLocationIds: { id: string; name: string }[];
  topFlavorName: string | null;
};

function shortWeek(label: string) {
  const part = label.split("–")[0]?.trim() ?? label;
  return part.replace(/, \d{4}$/, "");
}

async function fetchSalesWeek(week: string): Promise<AnalyticsWeekPayload> {
  const res = await fetch(`/api/analytics/trend-week?week=${week}`, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to load trend week");
  return json;
}

function payloadToTrendWeek(payload: AnalyticsWeekPayload, topFlavorName: string | null): TrendWeek {
  const byLocation: TrendWeek["byLocation"] = {};
  let gross = 0;
  let net = 0;
  for (const [id, snap] of Object.entries(payload.salesByLocation)) {
    byLocation[id] = { grossSales: snap.grossSales, netSales: snap.netSales };
    gross += snap.grossSales;
    net += snap.netSales;
  }
  return {
    weekStartYmd: payload.weekStartYmd,
    weekLabel: weekLabelFromMondayYmd(payload.weekStartYmd),
    grossSales: gross,
    netSales: net,
    byLocation,
    topFlavorUnits: {},
  };
}

export function WeeklyPerformanceCharts({ weekParam, topLocationIds, topFlavorName }: Props) {
  const [trends, setTrends] = useState<TrendWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const keys = getDashboardWeekKeys(weekParam);

    async function loadTrends() {
      setLoading(true);
      setError(null);
      setTrends([]);

      try {
        const loaded: TrendWeek[] = [];
        for (const monday of keys.trendMondays) {
          const payload = await fetchSalesWeek(monday);
          if (cancelled) return;
          loaded.push(payloadToTrendWeek(payload, topFlavorName));
          setTrends([...loaded]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trends");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTrends();
    return () => {
      cancelled = true;
    };
  }, [weekParam, topFlavorName]);

  if (loading && trends.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
        Loading trend charts week by week…
      </div>
    );
  }

  if (error && trends.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Trend charts unavailable: {error}
      </div>
    );
  }

  const companyTrend = trends.map((t) => ({
    week: shortWeek(t.weekLabel),
    gross: Math.round(t.grossSales),
    net: Math.round(t.netSales),
  }));

  const locationTrend = trends.map((t) => {
    const row: Record<string, string | number> = { week: shortWeek(t.weekLabel) };
    for (const loc of topLocationIds) {
      row[loc.name] = Math.round(t.byLocation[loc.id]?.grossSales ?? 0);
    }
    return row;
  });

  const palette = ["#ef4c81", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b"];

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-xs text-zinc-500">Updating charts… ({trends.length} weeks loaded)</p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="Company sales trend" subtitle="Gross and net by week">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={companyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => dollars(Number(v ?? 0))} />
              <Legend />
              <Line type="monotone" dataKey="gross" name="Gross" stroke="#ef4c81" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" name="Net" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top locations — gross trend" subtitle="Five highest-gross locations this week">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={locationTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => dollars(Number(v ?? 0))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topLocationIds.map((loc, i) => (
                <Line
                  key={loc.id}
                  type="monotone"
                  dataKey={loc.name}
                  stroke={palette[i % palette.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gross vs net comparison" subtitle="Company totals by week">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={companyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => dollars(Number(v ?? 0))} />
              <Legend />
              <Bar dataKey="gross" name="Gross" fill="#ef4c81" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-600">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
