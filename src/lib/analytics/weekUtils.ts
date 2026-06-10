import { addDays, subYears } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getWeekRangeMondayToMondayInTimeZone } from "@/lib/dates/weekRange";

export type DashboardWeekKeys = {
  current: string;
  prior: string;
  priorYear: string;
  decline2: string;
  decline3: string;
  trendMondays: string[];
};

const TZ = "America/New_York";
const TREND_WEEK_COUNT = 8;

function etMondayKey(anchor: Date): string {
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, TZ);
  return formatInTimeZone(range.weekStart, TZ, "yyyy-MM-dd");
}

export function getDashboardWeekKeys(weekStartYmd: string): DashboardWeekKeys {
  const anchor = new Date(`${weekStartYmd}T12:00:00.000Z`);
  const currentRange = getWeekRangeMondayToMondayInTimeZone(anchor, TZ);
  const currentMonday = currentRange.weekStart;

  const current = etMondayKey(anchor);
  const prior = etMondayKey(addDays(currentMonday, -7));
  const priorYear = etMondayKey(subYears(currentMonday, 1));
  const decline2 = etMondayKey(addDays(currentMonday, -14));
  const decline3 = etMondayKey(addDays(currentMonday, -21));

  const trendMondays: string[] = [];
  for (let i = TREND_WEEK_COUNT - 1; i >= 0; i--) {
    trendMondays.push(etMondayKey(addDays(currentMonday, -7 * i)));
  }

  return { current, prior, priorYear, decline2, decline3, trendMondays };
}
