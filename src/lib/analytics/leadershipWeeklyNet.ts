import type { WeekRange } from "@/lib/dates/weekRange";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Canonical Monday leadership workbook net sales.
 * Keys are the ET Monday `yyyy-MM-dd` for each reporting week.
 */
export const LEADERSHIP_WEEKLY_NET: Record<string, Record<string, number>> = {
  /** Jun 1 – Jun 7, 2026 */
  "2026-06-01": {
    L4EY6CN442VGB: 12771,
    LHK34R2VTWF87: 1184,
    L09KC5S41GQRP: 17107,
    LZGJ6T9JYFG7W: 8144,
    LRVZG0XCQPASB: 10176,
    LWE92DR7GY9N4: 2417,
    LF70VBZ7CDMHE: 7001,
    LEAVYE5AMZF06: 10132,
    LK15PMM2F5SGB: 3395,
    LQQKGMSGV8V1M: 6324,
    LK5H7DE78S097: 4518,
    LNS0D59DSEW9J: 6291,
    L9WPKVJZFGZS4: 16520,
    LWW1CFV8T5DTF: 9299,
    LJDR9RFPDTZX3: 7652,
    LGHK54YYZZCNA: 4383,
    L2P2FKMPD9WZ8: 1117,
  },
  /** Prior week — May 25 – May 31, 2026 */
  "2026-05-25": {
    L4EY6CN442VGB: 12830,
    LHK34R2VTWF87: 1184,
    L09KC5S41GQRP: 15428,
    LZGJ6T9JYFG7W: 8473,
    LRVZG0XCQPASB: 10378,
    LWE92DR7GY9N4: 3138,
    LF70VBZ7CDMHE: 6628,
    LEAVYE5AMZF06: 7806,
    LK15PMM2F5SGB: 5724,
    LQQKGMSGV8V1M: 5705,
    LK5H7DE78S097: 6249,
    LNS0D59DSEW9J: 5140,
    L9WPKVJZFGZS4: 14807,
    LWW1CFV8T5DTF: 9394,
    LJDR9RFPDTZX3: 3645,
    LGHK54YYZZCNA: 8261,
    L2P2FKMPD9WZ8: 9997,
  },
  /** Same week last year — workbook “2025” column for Jun 1–7, 2026 */
  "2025-05-26": {
    L4EY6CN442VGB: 12527,
    L09KC5S41GQRP: 13617,
    LZGJ6T9JYFG7W: 9151,
    LRVZG0XCQPASB: 10175,
    LWE92DR7GY9N4: 2564,
    LF70VBZ7CDMHE: 8391,
    LEAVYE5AMZF06: 8403,
    LK15PMM2F5SGB: 4653,
    LQQKGMSGV8V1M: 5365,
    LK5H7DE78S097: 4141,
    LNS0D59DSEW9J: 5157,
    LWW1CFV8T5DTF: 8750,
    LJDR9RFPDTZX3: 5387,
    LGHK54YYZZCNA: 4836,
    L2P2FKMPD9WZ8: 2242,
  },
};

/** ET Monday yyyy-MM-dd — must match dashboard `week=` param and workbook week. */
export function leadershipWeekKey(range: WeekRange, timeZone: string): string {
  return formatInTimeZone(range.weekStart, timeZone, "yyyy-MM-dd");
}

export function leadershipNetOverride(
  range: WeekRange,
  timeZone: string,
  locationId: string
): number | undefined {
  const key = leadershipWeekKey(range, timeZone);
  const direct = LEADERSHIP_WEEKLY_NET[key]?.[locationId];
  if (direct != null) return direct;
  return undefined;
}
