import Link from "next/link";
import { addDays } from "date-fns";
import { DashboardWeekNav } from "@/components/DashboardWeekNav";
import { WeeklyPerformanceData } from "@/components/analytics/WeeklyPerformanceData";
import {
  formatWeekParam,
  getWeekRangeMondayToMondayInTimeZone,
  parseWeekParam,
  weekLabelFromMondayYmd,
} from "@/lib/dates/weekRange";
import { getAnalyticsLocations } from "@/lib/analytics/locations";
import { readSessionFromCookies } from "@/lib/auth/session";
import { displayNameForEmail } from "@/lib/auth/displayName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WeeklyPerformancePage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const session = await readSessionFromCookies();
  const displayName = displayNameForEmail(session?.email);
  const anchor = parseWeekParam(searchParams?.week) ?? new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, "America/New_York");
  const weekParam = formatWeekParam(range.weekStart);
  const prevWeekParam = formatWeekParam(addDays(range.weekStart, -7));
  const nextWeekParam = formatWeekParam(addDays(range.weekStart, 7));
  const weekLabel = weekLabelFromMondayYmd(weekParam);
  const locationIds = getAnalyticsLocations().map((l) => l.id);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">Executive Analytics</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Weekly Performance Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-700">
              {displayName ? `Welcome ${displayName}. ` : ""}
              Monday leadership view — how every location performed, who is winning, and what flavors are driving sales.
              Independent of royalty reporting.
            </p>
            <Link href="/dashboard" className="mt-3 inline-block text-sm font-medium text-[var(--brand)] hover:underline">
              ← Royalties dashboard
            </Link>
          </div>
          <DashboardWeekNav
            basePath="/dashboard/weekly-performance"
            weekParam={weekParam}
            prevWeekParam={prevWeekParam}
            nextWeekParam={nextWeekParam}
            weekLabel={weekLabel}
          />
        </div>
      </div>

      <WeeklyPerformanceData weekParam={weekParam} locationIds={locationIds} />
    </main>
  );
}
