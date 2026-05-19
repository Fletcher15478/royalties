import type { ThirdPartyDeliveryPlatform } from "@/lib/square/delivery/types";

const PLATFORM_PATTERNS: { platform: ThirdPartyDeliveryPlatform; needles: string[] }[] = [
  { platform: "doordash", needles: ["doordash", "door dash"] },
  { platform: "uber_eats", needles: ["uber eats", "ubereats", "uber_eats"] },
  { platform: "grubhub", needles: ["grubhub", "grub hub", "seamless"] },
];

function haystackFromOrder(order: any): string {
  const parts: string[] = [];
  parts.push(String(order?.source?.name ?? ""));
  const meta: Record<string, string> | undefined = order?.metadata;
  if (meta && typeof meta === "object") {
    for (const [k, v] of Object.entries(meta)) {
      parts.push(k, String(v));
    }
  }
  const serviceCharges: any[] = order?.serviceCharges ?? order?.service_charges ?? [];
  for (const sc of serviceCharges) {
    parts.push(String(sc?.name ?? ""));
  }
  const taxes: any[] = order?.taxes ?? [];
  for (const t of taxes) {
    parts.push(String(t?.name ?? ""));
  }
  return parts.join(" ").toLowerCase();
}

export function matchPlatformInText(text: string): ThirdPartyDeliveryPlatform | null {
  const t = text.toLowerCase();
  for (const { platform, needles } of PLATFORM_PATTERNS) {
    if (needles.some((n) => t.includes(n))) return platform;
  }
  return null;
}

/** Square fulfillment type DELIVERY on the order. */
export function isDeliveryFulfillmentOrder(order: any): boolean {
  const fulfillments: any[] = order?.fulfillments ?? [];
  return fulfillments.some((f) => String(f?.type ?? "").toUpperCase() === "DELIVERY");
}

/** DoorDash / Uber Eats / Grubhub via source name, metadata, service charges, or remitted tax labels. */
export function looksLikeExternalDelivery(order: any): boolean {
  if (matchPlatformInText(haystackFromOrder(order))) return true;
  return false;
}

/** Tax lines that indicate marketplace remittance (common on 3P delivery). */
export function looksLikeDeliveryOrOnlineByContent(order: any): boolean {
  const taxes: any[] = order?.taxes ?? [];
  const taxText = taxes.map((t) => String(t?.name ?? "")).join(" ").toLowerCase();
  if (matchPlatformInText(taxText)) return true;
  if (taxText.includes("remitted")) return true;
  return false;
}

export function classifyThirdPartyDeliveryPlatform(order: any): ThirdPartyDeliveryPlatform {
  const fromSource = matchPlatformInText(String(order?.source?.name ?? ""));
  if (fromSource) return fromSource;
  const fromHaystack = matchPlatformInText(haystackFromOrder(order));
  return fromHaystack ?? "unknown";
}

/** True when the order should be treated as third-party marketplace delivery. */
export function isThirdPartyDeliveryOrder(order: any): boolean {
  return (
    isDeliveryFulfillmentOrder(order) ||
    looksLikeExternalDelivery(order) ||
    looksLikeDeliveryOrOnlineByContent(order)
  );
}
