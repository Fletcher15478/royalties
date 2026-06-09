const FLAVOR_CARRIER_RE =
  /scoop|flight|sundae|shake|cone|waffle|sandwich|milkshake|affogato|split|pint|quart|cup|bowl/i;

const NON_FLAVOR_MODIFIER_RE =
  /^(no |extra |add |with |without |hold |sub |substitute |dairy.?free|gluten|nut|allergy|waffle|cone|cup|bowl|topping|sprinkle|cherry|sauce|hot fudge|caramel|chocolate syrup)/i;

const SIZE_VARIATION_RE = /^(single|double|triple|regular|large|small|kids|mini|classic)\b/i;

function normalizeFlavorName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function isGiftCardLine(li: any): boolean {
  const itemType = String(li?.itemType ?? li?.item_type ?? "").toUpperCase();
  if (itemType === "GIFT_CARD") return true;
  const name = String(li?.name ?? "").toLowerCase();
  return name.includes("gift card");
}

export function isFlavorCarrierItem(name: string): boolean {
  return FLAVOR_CARRIER_RE.test(name);
}

/**
 * Extract flavor names from Square line item modifiers (primary) or variation name (fallback).
 */
export function extractFlavorsFromLineItem(li: any): string[] {
  const itemName = String(li?.name ?? "");
  const modifiers: any[] = li?.modifiers ?? [];
  const flavors: string[] = [];

  for (const mod of modifiers) {
    const modName = normalizeFlavorName(String(mod?.name ?? ""));
    if (!modName || NON_FLAVOR_MODIFIER_RE.test(modName)) continue;
    flavors.push(modName);
  }

  if (flavors.length > 0) return flavors;

  if (!isFlavorCarrierItem(itemName)) return [];

  const variation = normalizeFlavorName(String(li?.variationName ?? li?.variation_name ?? ""));
  if (variation && !SIZE_VARIATION_RE.test(variation)) {
    return [variation];
  }

  return [];
}

export function lineItemQty(li: any): number {
  const qty = Number(String(li?.quantity ?? "1"));
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export function isMerchandiseLine(li: any): boolean {
  return !isGiftCardLine(li);
}
