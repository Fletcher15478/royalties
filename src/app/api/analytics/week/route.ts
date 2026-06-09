import { NextResponse } from "next/server";
import { parseWeekParam } from "@/lib/dates/weekRange";
import { readSessionFromCookies } from "@/lib/auth/session";
import { loadAnalyticsWeek, type AnalyticsWeekDetail } from "@/lib/analytics/loadWeek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await readSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const week = url.searchParams.get("week");
  const detailParam = url.searchParams.get("detail") ?? "sales";
  const detail: AnalyticsWeekDetail = detailParam === "full" ? "full" : "sales";

  const anchor = parseWeekParam(week);
  if (!anchor) {
    return NextResponse.json({ ok: false, error: "Invalid or missing week (yyyy-MM-dd)" }, { status: 400 });
  }

  const weekStartYmd = week!;

  try {
    const payload = await loadAnalyticsWeek(weekStartYmd, detail);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load week";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
