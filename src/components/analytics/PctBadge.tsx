import { growthTone } from "@/lib/analytics/compare";
import { pct } from "@/components/analytics/format";

export function PctBadge({ value }: { value: number | null }) {
  const tone = growthTone(value);
  const className =
    tone === "up"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tone === "down"
        ? "bg-red-50 text-red-800 ring-red-200"
        : "bg-zinc-100 text-zinc-700 ring-zinc-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}>
      {pct(value)}
    </span>
  );
}
