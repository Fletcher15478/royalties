import {
  isDeliveryFulfillmentOrder,
  looksLikeDeliveryOrOnlineByContent,
  looksLikeExternalDelivery,
} from "@/lib/square/delivery/classify";
import { moneyToCents } from "@/lib/square/money";

const MARKET_SQUARE_LOCATION_ID = "L09KC5S41GQRP";
const SOUTH_FAYETTE_LOCATION_ID = "LZGJ6T9JYFG7W";

/** In-store Square orders for product mix — excludes 3P delivery and selected Square Online orders. */
export function shouldExcludeSquareOnlineOrder(order: any, locationId: string): boolean {
  const src = String(order?.source?.name ?? "").toLowerCase();
  if (!src.includes("square online")) return false;
  if (locationId === MARKET_SQUARE_LOCATION_ID) return false;

  if (locationId !== SOUTH_FAYETTE_LOCATION_ID) return false;

  const tipCents = moneyToCents(order?.totalTipMoney);
  if (tipCents > 0) return true;

  const lineItems: any[] = order?.lineItems ?? [];
  const names = lineItems.map((li) => String(li?.name ?? "").trim().toLowerCase()).filter(Boolean);
  if (names.length > 0 && names.every((n) => n === "classic scoop")) return true;

  return false;
}

export function isPaidOrder(order: any, locationId: string): boolean {
  const tenders = order?.tenders;
  if (Array.isArray(tenders) && tenders.length > 0) return true;
  if (Array.isArray(order?.paymentIds) && order.paymentIds.length > 0) return true;
  if (Array.isArray(order?.tenderIds) && order.tenderIds.length > 0) return true;

  const due = order?.netAmountDueMoney?.amount ?? order?.net_amount_due_money?.amount;
  const total = order?.totalMoney?.amount ?? order?.total_money?.amount;
  const dueN = typeof due === "bigint" ? Number(due) : Number(due ?? NaN);
  const totalN = typeof total === "bigint" ? Number(total) : Number(total ?? NaN);
  if (!Number.isNaN(dueN) && dueN === 0) {
    if (locationId === MARKET_SQUARE_LOCATION_ID) {
      const lineItems: any[] = order?.lineItems ?? [];
      if (lineItems.length > 0) return true;
      if (!Number.isNaN(totalN) && totalN > 0) return true;
    }
  }
  return false;
}

/** Orders excluded from in-store sales (leadership weekly report definition). */
export function shouldExcludeFromInStoreSales(order: any, locationId: string): boolean {
  if (isDeliveryFulfillmentOrder(order) || looksLikeExternalDelivery(order)) return true;
  if (looksLikeDeliveryOrOnlineByContent(order)) return true;
  if (shouldExcludeSquareOnlineOrder(order, locationId)) return true;

  const LAWRENCEVILLE_LOCATION_ID = "LRVZG0XCQPASB";
  if (locationId !== LAWRENCEVILLE_LOCATION_ID) {
    if (!isPaidOrder(order, locationId)) return true;

    const tenders: any[] = order?.tenders ?? [];
    const hasOnlyNoSaleTender =
      tenders.length > 0 &&
      tenders.every((ten) => String(ten?.type ?? "").toUpperCase() === "NO_SALE") &&
      tenders.reduce((s, ten) => s + moneyToCents(ten?.amountMoney), 0) === 0;
    if (hasOnlyNoSaleTender) return true;
  }

  return false;
}

export function filterInStoreOrders(orders: any[], locationId: string): any[] {
  return orders.filter((o) => !shouldExcludeFromInStoreSales(o, locationId));
}
