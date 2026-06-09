"use client";

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
import type { TrendWeek } from "@/lib/analytics/types";
import { dollars } from "@/components/analytics/format";

type Props = {
  trends: TrendWeek[];
  topLocationIds: { id: string; name: string }[];
  topFlavorName: string | null;
};

function shortWeek(label: string) {
  const part = label.split("–")[0]?.trim() ?? label;
  return part.replace(/, \d{4}$/, "");
}

export function WeeklyPerformanceCharts({ trends, topLocationIds, topFlavorName }: Props) {
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

  const flavorTrend = topFlavorName
    ? trends.map((t) => ({
        week: shortWeek(t.weekLabel),
        units: t.topFlavorUnits[topFlavorName] ?? 0,
      }))
    : [];

  const palette = ["#ef4c81", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b"];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <ChartCard title="Company sales trend" subtitle="Gross and net by week">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={companyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
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
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
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

      {topFlavorName ? (
        <ChartCard title={`Top flavor trend — ${topFlavorName}`} subtitle="Company-wide units sold by week">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={flavorTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="units" name="Units" fill="#ef4c81" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : null}

      <ChartCard title="Gross vs net comparison" subtitle="Company totals by week">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={companyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => dollars(Number(v ?? 0))} />
            <Legend />
            <Bar dataKey="gross" name="Gross" fill="#ef4c81" radius={[4, 4, 0, 0]} />
            <Bar dataKey="net" name="Net" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
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
