import { loadAnalyticsWeekMerged } from "@/lib/analytics/loadWeek";
import { getDashboardWeekKeys } from "@/lib/analytics/weekUtils";
import { composeWeeklyPerformanceDashboard } from "@/lib/analytics/composeDashboard";
import { cache } from "react";

async function loadWeeklyPerformanceDashboardUncached(weekStartYmd: string) {
  const keys = getDashboardWeekKeys(weekStartYmd);

  const [current, prior, priorYear, decline2, decline3] = await Promise.all([
    loadAnalyticsWeekMerged(keys.current, "full"),
    loadAnalyticsWeekMerged(keys.prior, "full"),
    loadAnalyticsWeekMerged(keys.priorYear, "sales"),
    loadAnalyticsWeekMerged(keys.decline2, "sales"),
    loadAnalyticsWeekMerged(keys.decline3, "sales"),
  ]);

  return composeWeeklyPerformanceDashboard(weekStartYmd, keys, {
    [keys.current]: current,
    [keys.prior]: prior,
    [keys.priorYear]: priorYear,
    [keys.decline2]: decline2,
    [keys.decline3]: decline3,
  });
}

export const loadWeeklyPerformanceDashboard = cache(loadWeeklyPerformanceDashboardUncached);
