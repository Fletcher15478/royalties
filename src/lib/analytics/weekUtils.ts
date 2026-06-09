import { addDays, subYears } from "date-fns";
import { formatWeekParam } from "@/lib/dates/weekRange";

export type DashboardWeekKeys = {
  current: string;
  prior: string;
  priorYear: string;
  decline2: string;
  decline3: string;
  trendMondays: string[];
};

const TREND_WEEK_COUNT = 8;

export function getDashboardWeekKeys(weekStartYmd: string): DashboardWeekKeys {
  const anchor = new Date(`${weekStartYmd}T12:00:00.000Z`);
  const current = weekStartYmd;
  const prior = formatWeekParam(addDays(anchor, -7));
  const priorYear = formatWeekParam(subYears(anchor, 1));
  const decline2 = formatWeekParam(addDays(anchor, -14));
  const decline3 = formatWeekParam(addDays(anchor, -21));

  const trendMondays: string[] = [];
  for (let i = TREND_WEEK_COUNT - 1; i >= 0; i--) {
    trendMondays.push(formatWeekParam(addDays(anchor, -7 * i)));
  }

  return { current, prior, priorYear, decline2, decline3, trendMondays };
}
