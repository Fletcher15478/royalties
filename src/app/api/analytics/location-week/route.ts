import { NextResponse } from "next/server";
import { parseWeekParam } from "@/lib/dates/weekRange";
import { readSessionFromCookies } from "@/lib/auth/session";
import { MILLIES_LOCATIONS } from "@/lib/locations/millies";
import { loadAnalyticsLocationWeek, type AnalyticsWeekDetail } from "@/lib/analytics/loadWeek";

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
  const locationId = url.searchParams.get("locationId") ?? "";
  const detailParam = url.searchParams.get("detail") ?? "sales";
  const detail: AnalyticsWeekDetail = detailParam === "full" ? "full" : "sales";

  if (!parseWeekParam(week)) {
    return NextResponse.json({ ok: false, error: "Invalid or missing week (yyyy-MM-dd)" }, { status: 400 });
  }

  if (!MILLIES_LOCATIONS.some((l) => l.id === locationId)) {
    return NextResponse.json({ ok: false, error: "Invalid locationId" }, { status: 400 });
  }

  try {
    const payload = await loadAnalyticsLocationWeek(locationId, week!, detail);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load location week";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
