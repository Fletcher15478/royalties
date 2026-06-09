import { pctChange } from "@/lib/analytics/compare";

export type HealthResult = {
  score: number;
  label: "At Risk" | "Stable" | "Strong" | "High Performer";
};

export function computeHealthScore(params: {
  wowPct: number | null;
  yoyPct: number | null;
  grossSales: number;
  companyAvgGross: number;
  topFlavorWowPct: number | null;
}): HealthResult {
  let score = 0;
  if (params.wowPct != null && params.wowPct > 0) score += 1;
  if (params.yoyPct != null && params.yoyPct > 0) score += 1;
  if (params.grossSales >= params.companyAvgGross) score += 1;
  if (params.topFlavorWowPct != null && params.topFlavorWowPct > 0) score += 1;

  const label =
    score >= 4
      ? "High Performer"
      : score === 3
        ? "Strong"
        : score === 2
          ? "Stable"
          : "At Risk";

  return { score, label };
}

export function topFlavorWowPct(
  currentFlavors: { name: string; units: number }[],
  priorFlavors: { name: string; units: number }[],
  topFlavorName: string | null
): number | null {
  if (!topFlavorName) return null;
  const cur = currentFlavors.find((f) => f.name === topFlavorName)?.units ?? 0;
  const prior = priorFlavors.find((f) => f.name === topFlavorName)?.units ?? 0;
  return pctChange(cur, prior);
}

export function countConsecutiveDeclines(weeklyNets: number[]): number {
  if (weeklyNets.length < 2) return 0;
  let streak = 0;
  for (let i = weeklyNets.length - 1; i > 0; i--) {
    if (weeklyNets[i] < weeklyNets[i - 1]) streak += 1;
    else break;
  }
  return streak;
}
