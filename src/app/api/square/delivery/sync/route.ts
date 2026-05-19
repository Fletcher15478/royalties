import { NextResponse } from "next/server";
import { getWeekRangeMondayToMondayInTimeZone, parseWeekParam } from "@/lib/dates/weekRange";
import { requireCronEnv } from "@/lib/env";
import { syncDeliveryRoyaltiesForLocation } from "@/lib/square/delivery/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull third-party delivery orders from Square and return net royalty math (no database).
 *
 * GET /api/square/delivery/sync?locationId=XXX&week=2026-04-28&secret=<CRON_SECRET>
 */
export async function GET(req: Request) {
  const { CRON_SECRET } = requireCronEnv();
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret") ?? bearer ?? "";
  if (provided !== CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const locationId = url.searchParams.get("locationId") ?? "";
  if (!locationId) {
    return NextResponse.json({ ok: false, error: "Missing locationId" }, { status: 400 });
  }

  const anchor = parseWeekParam(url.searchParams.get("week")) ?? new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, "America/New_York");

  try {
    const { summary, records } = await syncDeliveryRoyaltiesForLocation({
      locationId,
      range,
      timeZone: "America/New_York",
    });

    return NextResponse.json({
      ok: true,
      source: "square",
      summary,
      records,
    });
  } catch (err: unknown) {
    const e = err as { message?: string; statusCode?: number };
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Sync failed", statusCode: e?.statusCode },
      { status: 500 }
    );
  }
}
