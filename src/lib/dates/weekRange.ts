import { addDays, startOfDay, subDays } from "date-fns";
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export type WeekRange = {
  weekStart: Date; // inclusive
  weekEnd: Date; // exclusive (start of next Monday)
};

/**
 * Returns Monday 00:00 → next Monday 00:00 for the week containing `anchor`.
 * This matches "Monday at midnight to Sunday at midnight" when you treat weekEnd as exclusive.
 */
export function getWeekRangeMondayToMonday(anchor: Date): WeekRange {
  const d = startOfDay(anchor);
  // JS getDay(): Sunday=0 ... Saturday=6. We want Monday as start.
  const day = d.getDay();
  const daysSinceMonday = (day + 6) % 7; // Monday=0, Sunday=6
  const weekStart = subDays(d, daysSinceMonday);
  const weekEnd = addDays(weekStart, 7);
  return { weekStart, weekEnd };
}

/**
 * Same as getWeekRangeMondayToMonday, but anchored to a specific IANA timezone
 * (this matches Square’s reporting boundaries).
 *
 * Returns UTC Dates representing:
 * - weekStart: Monday 00:00:00 in that timezone
 * - weekEnd: next Monday 00:00:00 in that timezone
 */
export function getWeekRangeMondayToMondayInTimeZone(anchorUtc: Date, timeZone: string): WeekRange {
  const zoned = toZonedTime(anchorUtc, timeZone);
  const zonedStart = startOfDay(zoned);
  const day = zonedStart.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const mondayZoned = subDays(zonedStart, daysSinceMonday);
  const nextMondayZoned = addDays(mondayZoned, 7);
  return {
    weekStart: fromZonedTime(mondayZoned, timeZone),
    weekEnd: fromZonedTime(nextMondayZoned, timeZone),
  };
}

export function toIsoNoMillis(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function formatWeekParam(weekStart: Date) {
  return format(weekStart, "yyyy-MM-dd");
}

export function parseWeekParam(week?: string | null): Date | null {
  if (!week) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;
  const anchor = new Date(`${week}T12:00:00.000Z`);
  return Number.isNaN(anchor.getTime()) ? null : anchor;
}

/** Human-readable Mon–Sun label for a Monday `yyyy-MM-dd` (matches dashboard copy). */
export function weekLabelFromMondayYmd(mondayYmd: string): string {
  const weekStart = new Date(`${mondayYmd}T12:00:00.000Z`);
  const weekEndExclusive = addDays(weekStart, 7);
  const lastDay = addDays(weekEndExclusive, -1);
  return `${format(weekStart, "MMM d")} – ${format(lastDay, "MMM d, yyyy")}`;
}

