import { centsToDollars, moneyToCents } from "@/lib/square/money";
import {
  extractFlavorsFromLineItem,
  isMerchandiseLine,
  lineItemQty,
} from "@/lib/analytics/flavors";
import type {
  FlavorAggregate,
  ItemAggregate,
  LocationProductMetrics,
  LocationSalesSnapshot,
} from "@/lib/analytics/types";

function emptySales(locationId: string): LocationSalesSnapshot {
  return {
    locationId,
    ordersCount: 0,
    grossSales: 0,
    discounts: 0,
    refunds: 0,
    netSales: 0,
  };
}

function bumpFlavor(map: Map<string, FlavorAggregate>, name: string, units: number, revenue: number) {
  const cur = map.get(name) ?? { name, units: 0, revenue: 0 };
  cur.units += units;
  cur.revenue += revenue;
  map.set(name, cur);
}

function bumpItem(map: Map<string, ItemAggregate>, name: string, qty: number, revenue: number, gross: number) {
  const cur = map.get(name) ?? { name, qty: 0, revenue: 0, grossRevenue: 0 };
  cur.qty += qty;
  cur.revenue += revenue;
  cur.grossRevenue += gross;
  map.set(name, cur);
}

function topBy<T>(items: T[], pick: (x: T) => number): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, cur) => (pick(cur) > pick(best) ? cur : best));
}

export type WeekAggregation = {
  salesByLocation: Map<string, LocationSalesSnapshot>;
  productsByLocation: Map<string, LocationProductMetrics>;
  companyFlavors: FlavorAggregate[];
};

export type SalesWeekAggregation = {
  salesByLocation: Map<string, LocationSalesSnapshot>;
};

/** Order-level totals only — faster for comparison and trend weeks. */
export function aggregateSalesWeek(orders: any[], locationIds: string[]): SalesWeekAggregation {
  const idSet = new Set(locationIds);
  const salesByLocation = new Map<string, LocationSalesSnapshot>();

  for (const id of locationIds) {
    salesByLocation.set(id, emptySales(id));
  }

  for (const order of orders) {
    const locationId = String(order?.locationId ?? order?.location_id ?? "");
    if (!idSet.has(locationId)) continue;

    const sales = salesByLocation.get(locationId)!;
    sales.ordersCount += 1;

    const grossCents = moneyToCents(order?.totalGrossSalesMoney ?? order?.total_gross_sales_money);
    const fallbackGross = moneyToCents(order?.totalMoney ?? order?.total_money);
    const discountCents = moneyToCents(order?.totalDiscountMoney ?? order?.total_discount_money);
    const refundCents = moneyToCents(order?.totalRefundedMoney ?? order?.total_refunded_money);
    const orderGross = grossCents || fallbackGross;
    const orderNet = orderGross - discountCents - refundCents;

    sales.grossSales += centsToDollars(orderGross);
    sales.discounts += centsToDollars(discountCents);
    sales.refunds += centsToDollars(refundCents);
    sales.netSales += centsToDollars(orderNet);
  }

  return { salesByLocation };
}

/**
 * Executive analytics aggregation from Square orders — independent of royalty math.
 */
export function aggregateAnalyticsWeek(
  orders: any[],
  locationIds: string[]
): WeekAggregation {
  const idSet = new Set(locationIds);
  const salesByLocation = new Map<string, LocationSalesSnapshot>();
  const flavorMaps = new Map<string, Map<string, FlavorAggregate>>();
  const itemMaps = new Map<string, Map<string, ItemAggregate>>();
  const shopNetByLocation = new Map<string, number>();
  const companyFlavorMap = new Map<string, FlavorAggregate>();

  for (const id of locationIds) {
    salesByLocation.set(id, emptySales(id));
    flavorMaps.set(id, new Map());
    itemMaps.set(id, new Map());
    shopNetByLocation.set(id, 0);
  }

  for (const order of orders) {
    const locationId = String(order?.locationId ?? order?.location_id ?? "");
    if (!idSet.has(locationId)) continue;

    const sales = salesByLocation.get(locationId)!;
    sales.ordersCount += 1;

    const grossCents = moneyToCents(order?.totalGrossSalesMoney ?? order?.total_gross_sales_money);
    const fallbackGross = moneyToCents(order?.totalMoney ?? order?.total_money);
    const discountCents = moneyToCents(order?.totalDiscountMoney ?? order?.total_discount_money);
    const refundCents = moneyToCents(order?.totalRefundedMoney ?? order?.total_refunded_money);
    const orderGross = grossCents || fallbackGross;
    const orderNet = orderGross - discountCents - refundCents;

    sales.grossSales += centsToDollars(orderGross);
    sales.discounts += centsToDollars(discountCents);
    sales.refunds += centsToDollars(refundCents);
    sales.netSales += centsToDollars(orderNet);

    const flavorMap = flavorMaps.get(locationId)!;
    const itemMap = itemMaps.get(locationId)!;

    for (const li of order?.lineItems ?? []) {
      if (!isMerchandiseLine(li)) continue;

      const name = String(li?.name ?? "").trim() || "(Unnamed item)";
      const qty = lineItemQty(li);
      const grossCents = moneyToCents(li?.grossSalesMoney ?? li?.gross_sales_money);
      const discountLine = moneyToCents(li?.totalDiscountMoney ?? li?.total_discount_money);
      const lineNet = grossCents - discountLine;
      const lineGross = centsToDollars(grossCents);
      const lineNetDollars = centsToDollars(lineNet);

      shopNetByLocation.set(locationId, (shopNetByLocation.get(locationId) ?? 0) + lineNetDollars);
      bumpItem(itemMap, name, qty, lineNetDollars, lineGross);

      const flavors = extractFlavorsFromLineItem(li);
      if (flavors.length === 0) continue;

      const unitsPerFlavor = qty;
      const revenuePerFlavor = lineNetDollars / flavors.length;
      for (const flavor of flavors) {
        bumpFlavor(flavorMap, flavor, unitsPerFlavor, revenuePerFlavor);
        bumpFlavor(companyFlavorMap, flavor, unitsPerFlavor, revenuePerFlavor);
      }
    }
  }

  const productsByLocation = new Map<string, LocationProductMetrics>();
  for (const id of locationIds) {
    const flavors = [...(flavorMaps.get(id)?.values() ?? [])].sort((a, b) => b.revenue - a.revenue);
    const items = [...(itemMaps.get(id)?.values() ?? [])].sort((a, b) => b.revenue - a.revenue);
    const shopNetSales = shopNetByLocation.get(id) ?? 0;

    productsByLocation.set(id, {
      topFlavor: topBy(flavors, (f) => f.revenue),
      topItem: topBy(items, (i) => i.revenue),
      flavors,
      items,
      shopNetSales,
    });
  }

  const companyFlavors = [...companyFlavorMap.values()].sort((a, b) => b.units - a.units);

  return { salesByLocation, productsByLocation, companyFlavors };
}

export function salesSnapshotFromMap(
  map: Map<string, LocationSalesSnapshot>,
  locationId: string
): LocationSalesSnapshot {
  return map.get(locationId) ?? emptySales(locationId);
}
