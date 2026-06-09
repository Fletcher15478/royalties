import { searchOrdersInRange } from "@/lib/square/delivery/searchOrders";
import { toIsoNoMillis, type WeekRange } from "@/lib/dates/weekRange";

const CACHE_TTL_MS = 5 * 60 * 1000;
const orderCache = new Map<string, { at: number; orders: any[] }>();

function cacheKey(locationIds: string[], range: WeekRange): string {
  const ids = [...locationIds].sort().join(",");
  return `${ids}|${toIsoNoMillis(range.weekStart)}|${toIsoNoMillis(range.weekEnd)}`;
}

/**
 * Fetch completed orders for many locations in a single Square search stream.
 * Results are cached briefly to speed week navigation during a session.
 */
export async function fetchAnalyticsOrders(
  locationIds: string[],
  range: WeekRange
): Promise<any[]> {
  const key = cacheKey(locationIds, range);
  const hit = orderCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.orders;
  }

  const orders = await searchOrdersInRange({
    locationIds,
    startAt: toIsoNoMillis(range.weekStart),
    endAt: toIsoNoMillis(range.weekEnd),
  });

  orderCache.set(key, { at: Date.now(), orders });
  return orders;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;

  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}
