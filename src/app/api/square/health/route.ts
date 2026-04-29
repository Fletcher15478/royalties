import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const squareClient = getSquareClient();
    if (!squareClient) {
      return NextResponse.json(
        {
          ok: false,
          elapsed_ms: Date.now() - startedAt,
          message: "Square client factory returned empty value",
          debug: { typeof_getSquareClient: typeof getSquareClient },
        },
        { status: 500 }
      );
    }
    const res = await squareClient.locations.list();
    const rawLocations =
      (res as any)?.data?.locations ?? (res as any)?.locations ?? (res as any)?.result?.locations ?? [];
    const locations = (rawLocations as any[]).map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      country: l.address?.country,
      timezone: l.timezone,
      businessName: l.businessName,
    }));

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      count: locations.length,
      locations,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      {
        ok: false,
        elapsed_ms: Date.now() - startedAt,
        message: e?.message ?? "Square request failed",
        statusCode: e?.statusCode ?? e?.status,
        errors: e?.errors ?? e?.body?.errors,
        stack: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

