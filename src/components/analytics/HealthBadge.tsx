import type { LocationPerformanceRow } from "@/lib/analytics/types";

const STYLES: Record<LocationPerformanceRow["healthLabel"], string> = {
  "At Risk": "bg-red-50 text-red-800 ring-red-200",
  Stable: "bg-amber-50 text-amber-900 ring-amber-200",
  Strong: "bg-sky-50 text-sky-900 ring-sky-200",
  "High Performer": "bg-emerald-50 text-emerald-900 ring-emerald-200",
};

export function HealthBadge({ label, score }: { label: LocationPerformanceRow["healthLabel"]; score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STYLES[label]}`}
      title={`Health score ${score}/4`}
    >
      {label}
    </span>
  );
}
