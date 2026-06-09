import { NextResponse } from "next/server";
import { parseWeekParam } from "@/lib/dates/weekRange";
import { readSessionFromCookies } from "@/lib/auth/session";
import { loadAnalyticsTrendWeek } from "@/lib/analytics/loadWeek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const session = await readSessionFromCookies();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const week = url.searchParams.get("week");
  if (!parseWeekParam(week)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing week (yyyy-MM-dd)" }, { status: 400 });
  }

  try {
    const payload = await loadAnalyticsTrendWeek(week!);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load trend week";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
