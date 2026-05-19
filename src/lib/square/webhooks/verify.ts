import crypto from "crypto";

/**
 * Verify Square webhook `x-square-hmacsha256-signature`.
 * @see https://developer.squareup.com/docs/webhooks/step3validate
 */
export function verifySquareWebhookSignature(params: {
  /** Raw request body string (unparsed). */
  body: string;
  signatureHeader: string | null;
  /** Full notification URL configured in Square Developer Dashboard. */
  notificationUrl: string;
  signatureKey: string;
}): boolean {
  if (!params.signatureHeader || !params.signatureKey) return false;

  const payload = params.notificationUrl + params.body;
  const expected = crypto.createHmac("sha256", params.signatureKey).update(payload).digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.signatureHeader));
  } catch {
    return false;
  }
}
