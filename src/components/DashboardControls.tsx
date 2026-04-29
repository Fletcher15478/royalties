"use client";

export function DashboardControls({
  weekStart,
  weekLabel,
}: {
  weekStart: string; // yyyy-MM-dd (Monday)
  weekLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="text-sm font-semibold text-zinc-900">
        Week: <span className="font-medium text-zinc-700">{weekLabel}</span>
      </div>
    </div>
  );
}

