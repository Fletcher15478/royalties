import { searchOrdersInRange } from "@/lib/square/delivery/searchOrders";
import { toIsoNoMillis, type WeekRange } from "@/lib/dates/weekRange";

const CACHE_TTL_MS = 5 * 60 * 1000;
/** Square SearchOrders allows at most 10 location IDs per request. */
const SQUARE_LOCATION_BATCH_SIZE = 10;

const orderCache = new Map<string, { at: number; orders: any[] }>();

function cacheKey(locationIds: string[], range: WeekRange): string {
  const ids = [...locationIds].sort().join(",");
  return `${ids}|${toIsoNoMillis(range.weekStart)}|${toIsoNoMillis(range.weekEnd)}`;
}

function chunkLocationIds(locationIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < locationIds.length; i += SQUARE_LOCATION_BATCH_SIZE) {
    chunks.push(locationIds.slice(i, i + SQUARE_LOCATION_BATCH_SIZE));
  }
  return chunks;
}

/**
 * Fetch completed orders for many locations. Square caps each search at 10 location IDs,
 * so requests are batched and merged automatically.
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

  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const chunks = chunkLocationIds(locationIds);

  const batchResults = await mapLimit(chunks, 2, (ids) =>
    searchOrdersInRange({ locationIds: ids, startAt, endAt })
  );

  const orders = batchResults.flat();
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
