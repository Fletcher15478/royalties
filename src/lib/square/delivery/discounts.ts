import { moneyToCents } from "@/lib/square/money";

/**
 * Discount names that indicate marketplace-funded marketing (DoorDash promo, BOGO push, etc.).
 * These reduce royalty-eligible gross when the franchise is not receiving full menu price.
 */
const MARKETING_DISCOUNT_PATTERNS = [
  "promo",
  "promotion",
  "marketing",
  "bogo",
  "buy one get one",
  "free item",
  "dashpass",
  "uber one",
  "eats",
  "grubhub",
  "doordash",
  "marketplace",
  "campaign",
  "sponsored",
];

function discountNameLooksMarketing(name: string): boolean {
  const n = name.toLowerCase();
  return MARKETING_DISCOUNT_PATTERNS.some((p) => n.includes(p));
}

export function splitDiscountCents(order: any): { marketingCents: number; otherCents: number } {
  let marketingCents = 0;
  let otherCents = 0;

  const orderDiscounts: any[] = order?.discounts ?? [];
  for (const d of orderDiscounts) {
    const applied = moneyToCents(d?.appliedMoney ?? d?.applied_money);
    const name = String(d?.name ?? d?.catalogObjectId ?? "");
    if (discountNameLooksMarketing(name)) marketingCents += applied;
    else otherCents += applied;
  }

  const lineItems: any[] = order?.lineItems ?? order?.line_items ?? [];
  for (const li of lineItems) {
    const lineDisc = moneyToCents(li?.totalDiscountMoney ?? li?.total_discount_money);
    const liName = String(li?.name ?? "");
    if (lineDisc > 0) {
      if (discountNameLooksMarketing(liName)) marketingCents += lineDisc;
      else otherCents += lineDisc;
    }
  }

  return { marketingCents, otherCents };
}
