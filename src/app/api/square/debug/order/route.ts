import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonSafe(value: any): any {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  if (!orderId) {
    return NextResponse.json({ ok: false, message: "Missing ?orderId=" }, { status: 400 });
  }

  try {
    const square = getSquareClient();
    const res = await square.orders.get({ orderId } as any);
    const order = (res as any)?.data?.order ?? (res as any)?.order ?? (res as any)?.result?.order;
    return NextResponse.json({
      ok: true,
      orderId,
      topKeys: Object.keys((res as any) ?? {}),
      orderKeys: order ? Object.keys(order) : [],
      order: jsonSafe(order),
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

