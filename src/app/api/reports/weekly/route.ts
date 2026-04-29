import { NextResponse } from "next/server";
import {
  parseWeekParam,
  formatWeekParam,
  getWeekRangeMondayToMondayInTimeZone,
} from "@/lib/dates/weekRange";
import { buildWeeklyTextReport } from "@/lib/reports/weeklyText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const week = url.searchParams.get("week");
  const anchor = parseWeekParam(week) ?? new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, "America/New_York");
  const weekStart = formatWeekParam(range.weekStart);

  const body = await buildWeeklyTextReport({ weekStartYmd: weekStart, timeZone: "America/New_York" });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="millies-royalties-${weekStart}.txt"`,
    },
  });
}

