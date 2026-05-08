"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { weekLabelFromMondayYmd } from "@/lib/dates/weekRange";

const btnBase =
  "rounded-lg border px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50";
const btnGhost = `${btnBase} border-zinc-200 bg-white hover:bg-zinc-50`;
const btnPrimary = `${btnBase} border-transparent bg-[var(--brand)] font-semibold text-white hover:opacity-95`;

type Props = {
  basePath: string;
  weekParam: string;
  prevWeekParam: string;
  nextWeekParam: string;
  weekLabel: string;
  /** When true, shows “Download this week’s report” using `pendingWeek ?? weekParam`. */
  showWeeklyDownload?: boolean;
};

export function DashboardWeekNav({
  basePath,
  weekParam,
  prevWeekParam,
  nextWeekParam,
  weekLabel,
  showWeeklyDownload,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingWeek, setPendingWeek] = useState<string | null>(null);

  const urlWeek = searchParams.get("week");
  useEffect(() => {
    if (pendingWeek != null && urlWeek === pendingWeek) {
      setPendingWeek(null);
    }
  }, [urlWeek, pendingWeek]);

  const navigating = isPending || pendingWeek != null;
  const displayLabel = pendingWeek != null ? weekLabelFromMondayYmd(pendingWeek) : weekLabel;
  const reportWeek = pendingWeek ?? weekParam;

  function go(week: string) {
    setPendingWeek(week);
    const href = `${basePath}?week=${week}`;
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={navigating}
          aria-busy={navigating}
          onClick={() => go(prevWeekParam)}
        >
          ← Prev week
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={navigating}
          aria-busy={navigating}
          onClick={() => go(nextWeekParam)}
        >
          Next week →
        </button>
        {showWeeklyDownload ? (
          <a
            className={`${btnGhost} font-semibold text-zinc-900`}
            href={`/api/reports/weekly?week=${reportWeek}`}
          >
            Download this week&apos;s report
          </a>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 text-right sm:items-end">
        <div className="text-sm font-semibold text-zinc-900">
          Week: <span className="font-medium text-zinc-700">{displayLabel}</span>
        </div>
        {navigating ? (
          <p className="max-w-xs text-xs text-amber-800 sm:text-right">
            Fetching data from Square… Tables update when the numbers finish loading (this can take a bit).
          </p>
        ) : null}
      </div>
    </div>
  );
}
