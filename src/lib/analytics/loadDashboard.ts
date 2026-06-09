import { cache } from "react";
import { composeWeeklyPerformanceDashboard } from "@/lib/analytics/composeDashboard";
import { loadAnalyticsWeek } from "@/lib/analytics/loadWeek";
import { getDashboardWeekKeys } from "@/lib/analytics/weekUtils";
import type { WeeklyPerformanceDashboard } from "@/lib/analytics/types";

/**
 * Loads the full dashboard in one server request (may timeout on Vercel).
 * Prefer the client-driven `/api/analytics/week` flow used by the dashboard page.
 */
async function loadWeeklyPerformanceDashboardUncached(weekStartYmd: string): Promise<WeeklyPerformanceDashboard> {
  const keys = getDashboardWeekKeys(weekStartYmd);

  const [current, prior, priorYear, decline2, decline3] = await Promise.all([
    loadAnalyticsWeek(keys.current, "full"),
    loadAnalyticsWeek(keys.prior, "full"),
    loadAnalyticsWeek(keys.priorYear, "sales"),
    loadAnalyticsWeek(keys.decline2, "sales"),
    loadAnalyticsWeek(keys.decline3, "sales"),
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
