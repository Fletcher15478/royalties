import { NextResponse } from "next/server";
import { getWeekRangeMondayToMondayInTimeZone } from "@/lib/dates/weekRange";
import { loadLocationRoyaltyBundle } from "@/lib/royalties/locationBundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  const tz = url.searchParams.get("tz") ?? "America/New_York";
  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, tz);

  try {
    const bundle = await loadLocationRoyaltyBundle({ locationId, range, timeZone: tz });
    return NextResponse.json({
      ok: true,
      tz,
      detail: bundle.detail,
      delivery: bundle.delivery,
      deliveryRecords: bundle.deliveryRecords,
      inStoreNetSales: bundle.inStoreNetSales,
      deliveryNetSales: bundle.deliveryNetSales,
      combinedNetSales: bundle.combinedNetSales,
      royalty: bundle.royalty,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

