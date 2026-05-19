import { NextResponse } from "next/server";
import { env, requireSquareWebhookEnv } from "@/lib/env";
import { computeDeliveryRoyaltyForOrder } from "@/lib/square/delivery/service";
import { deliveryLog } from "@/lib/square/delivery/logger";
import { verifySquareWebhookSignature } from "@/lib/square/webhooks/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SquareWebhookEnvelope = {
  type?: string;
  event_id?: string;
  created_at?: string;
  data?: {
    type?: string;
    id?: string;
    object?: Record<string, unknown>;
  };
};

function extractOrderUpdated(payload: SquareWebhookEnvelope): { orderId: string; locationId?: string } | null {
  const obj = payload.data?.object;
  if (!obj) return null;

  const orderUpdated = (obj as any).order_updated ?? (obj as any).orderUpdated;
  if (orderUpdated?.order_id) {
    return {
      orderId: String(orderUpdated.order_id),
      locationId: orderUpdated.location_id ? String(orderUpdated.location_id) : undefined,
    };
  }

  const order = (obj as any).order;
  if (order?.id) {
    return {
      orderId: String(order.id),
      locationId: order.location_id ? String(order.location_id) : undefined,
    };
  }

  return null;
}

/**
 * Square `order.updated` — re-pulls the order from Square and returns fresh delivery royalty math.
 * Nothing is stored; the dashboard always recomputes from Square on each load.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  if (env.SQUARE_WEBHOOK_SIGNATURE_KEY && env.SQUARE_WEBHOOK_NOTIFICATION_URL) {
    try {
      const { SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_WEBHOOK_NOTIFICATION_URL } = requireSquareWebhookEnv();
      const signature = req.headers.get("x-square-hmacsha256-signature");
      const valid = verifySquareWebhookSignature({
        body: rawBody,
        signatureHeader: signature,
        notificationUrl: SQUARE_WEBHOOK_NOTIFICATION_URL,
        signatureKey: SQUARE_WEBHOOK_SIGNATURE_KEY,
      });
      if (!valid) {
        deliveryLog.warn("Webhook signature verification failed");
        return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
      }
    } catch {
      deliveryLog.warn("Webhook signature env incomplete; skipping verification");
    }
  }

  let payload: SquareWebhookEnvelope;
  try {
    payload = JSON.parse(rawBody) as SquareWebhookEnvelope;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = String(payload.type ?? "");
  if (eventType !== "order.updated") {
    return NextResponse.json({ ok: true, ignored: true, type: eventType });
  }

  const extracted = extractOrderUpdated(payload);
  if (!extracted) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_order_id" });
  }

  try {
    const record = await computeDeliveryRoyaltyForOrder({
      orderId: extracted.orderId,
      locationId: extracted.locationId,
    });

    return NextResponse.json({
      ok: true,
      source: "square",
      eventId: payload.event_id,
      orderId: extracted.orderId,
      isDeliveryOrder: Boolean(record),
      breakdown: record,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    deliveryLog.error("Webhook processing failed", err, { orderId: extracted.orderId });
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Processing failed" },
      { status: 500 }
    );
  }
}
