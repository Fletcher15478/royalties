import { getSquareClient } from "@/lib/square/client";
import { isThirdPartyDeliveryOrder } from "@/lib/square/delivery/classify";
import { deliveryLog } from "@/lib/square/delivery/logger";

export type SearchOrdersParams = {
  locationIds: string[];
  startAt: string;
  endAt: string;
  /** When true, only return third-party delivery orders. */
  deliveryOnly?: boolean;
};

/**
 * Square Orders API SearchOrders for a closed-at window.
 * Pagination is handled internally; optional filter keeps only 3P delivery channels.
 */
export async function searchOrdersInRange(params: SearchOrdersParams): Promise<any[]> {
  const square = getSquareClient();
  const all: any[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    pages += 1;
    let res: any;
    try {
      res = await square.orders.search({
        locationIds: params.locationIds,
        cursor,
        limit: 100,
        query: {
          filter: {
            dateTimeFilter: {
              closedAt: { startAt: params.startAt, endAt: params.endAt },
            },
            stateFilter: { states: ["COMPLETED"] },
          },
          sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
        },
        returnEntries: false,
      });
    } catch (err) {
      deliveryLog.error("SearchOrders failed", err, { page: pages, locationIds: params.locationIds });
      throw err;
    }

    const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];
    for (const o of orders) {
      if (params.deliveryOnly && !isThirdPartyDeliveryOrder(o)) continue;
      all.push(o);
    }

    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
  } while (cursor);

  deliveryLog.info("SearchOrders complete", {
    locationIds: params.locationIds,
    pages,
    count: all.length,
    deliveryOnly: params.deliveryOnly ?? false,
  });

  return all;
}

export async function fetchOrderById(orderId: string): Promise<any | null> {
  const square = getSquareClient();
  try {
    const res = await square.orders.get({ orderId } as any);
    return (res as any)?.data?.order ?? (res as any)?.order ?? (res as any)?.result?.order ?? null;
  } catch (err) {
    deliveryLog.error("orders.get failed", err, { orderId });
    throw err;
  }
}
