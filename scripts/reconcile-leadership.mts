import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[k] = v;
    }
  } catch {
    /* env may already be set */
  }
}

loadEnvLocal();

const TARGETS: Record<string, number> = {
  LZGJ6T9JYFG7W: 8144,
  LRVZG0XCQPASB: 10176,
  LEAVYE5AMZF06: 10132,
  LQQKGMSGV8V1M: 6324,
  LWW1CFV8T5DTF: 9299,
};

function moneyToCents(m: any): number {
  const a = m?.amount ?? m;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

function merchGross(order: any): number {
  return (order?.lineItems ?? [])
    .filter((li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD")
    .reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);
}

async function main() {
  const {
    isDeliveryFulfillmentOrder,
    looksLikeExternalDelivery,
    looksLikeDeliveryOrOnlineByContent,
    isThirdPartyDeliveryOrder,
  } = await import("../src/lib/square/delivery/classify");
  const { shouldExcludeFromInStoreSales } = await import("../src/lib/analytics/exclusions");
  const { calculateDeliveryOrderNetRoyalty } = await import("../src/lib/square/delivery/netRoyalty");
  const { buildRefundTotalsByPaymentId } = await import("../src/lib/square/delivery/refunds");
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { MILLIES_LOCATIONS } = await import("../src/lib/locations/millies");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");

  const tz = "America/New_York";
  const weekStartYmd = "2026-06-02";
  const range = getWeekRangeMondayToMondayInTimeZone(new Date(`${weekStartYmd}T12:00:00.000Z`), tz);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();
  const nameById = new Map(MILLIES_LOCATIONS.map((l) => [l.id, l.name]));

  for (const locationId of Object.keys(TARGETS)) {
    const sheet = TARGETS[locationId];
    const name = nameById.get(locationId) ?? locationId;
    const detail = await getLocationWeeklyDetail(locationId, range, { timeZone: tz, forceSquare: true });
    const refundByPaymentId = await buildRefundTotalsByPaymentId({ locationId, beginTime: startAt, endTime: endAt });

    let cursor: string | undefined;
    const orphans: { id: string; gross: number; src: string; reason: string }[] = [];
    const deliveryNot3p: { id: string; net: number; src: string }[] = [];
    const delivery3p: { id: string; net: number; gross: number; src: string }[] = [];
    let excludedInStoreGross = 0;
    let includedInStoreGross = 0;

    do {
      const res = await square.orders.search({
        locationIds: [locationId],
        cursor,
        limit: 100,
        query: {
          filter: {
            dateTimeFilter: { closedAt: { startAt, endAt } },
            stateFilter: { states: ["COMPLETED"] },
          },
          sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
        },
        returnEntries: false,
      });
      const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? [];
      for (const o of orders) {
        const g = merchGross(o) / 100;
        const exInStore = shouldExcludeFromInStoreSales(o, locationId);
        const is3p = isThirdPartyDeliveryOrder(o);
        const exDel = isDeliveryFulfillmentOrder(o) || looksLikeExternalDelivery(o);
        const exTax = looksLikeDeliveryOrOnlineByContent(o);

        if (exInStore) excludedInStoreGross += g;
        else includedInStoreGross += g;

        if (exInStore && !is3p && (exDel || exTax)) {
          orphans.push({
            id: String(o.id),
            gross: g,
            src: String(o?.source?.name ?? ""),
            reason: exDel ? "delivery/external" : "tax/remitted",
          });
        }

        if (is3p) {
          const br = calculateDeliveryOrderNetRoyalty(o, refundByPaymentId);
          delivery3p.push({
            id: String(o.id),
            gross: br?.grossSales ?? g,
            net: br?.netRoyaltyEligible ?? 0,
            src: String(o?.source?.name ?? ""),
          });
        } else if (exDel || exTax) {
          deliveryNot3p.push({ id: String(o.id), net: g, src: String(o?.source?.name ?? "") });
        }
      }
      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor;
    } while (cursor);

    const orphanGross = orphans.reduce((s, o) => s + o.gross, 0);
    const del3pNet = delivery3p.reduce((s, o) => s + o.net, 0);
    const del3pGross = delivery3p.reduce((s, o) => s + o.gross, 0);
    const not3pGross = deliveryNot3p.reduce((s, o) => s + o.net, 0);

    console.log(`\n=== ${name} target ${sheet} inStoreNet ${detail.netSales.toFixed(2)} ===`);
    console.log(`  3P delivery orders: ${delivery3p.length} gross ${del3pGross.toFixed(2)} net ${del3pNet.toFixed(2)}`);
    console.log(`  Orphan excluded (not 3P): ${orphans.length} gross ${orphanGross.toFixed(2)}`);
    console.log(`  Excluded-not-3P list gross ${not3pGross.toFixed(2)}`);
    console.log(`  inStore + del3pNet = ${(detail.netSales + del3pNet).toFixed(2)} (Δ ${(sheet - detail.netSales - del3pNet).toFixed(2)})`);
    console.log(`  inStore + del3pGross = ${(detail.netSales + del3pGross).toFixed(2)} (Δ ${(sheet - detail.netSales - del3pGross).toFixed(2)})`);
    console.log(`  inStore + del3pNet + orphanGross = ${(detail.netSales + del3pNet + orphanGross).toFixed(2)} (Δ ${(sheet - detail.netSales - del3pNet - orphanGross).toFixed(2)})`);
    console.log(`  inStore + del3pNet + not3pGross = ${(detail.netSales + del3pNet + not3pGross).toFixed(2)} (Δ ${(sheet - detail.netSales - del3pNet - not3pGross).toFixed(2)})`);

    if (orphans.length) {
      console.log("  Orphans sample:", orphans.slice(0, 5));
    }
    if (locationId === "LQQKGMSGV8V1M" && delivery3p.length) {
      console.log("  PV delivery orders:", delivery3p);
    }
    if (locationId === "LWW1CFV8T5DTF") {
      console.log("  Truck excluded in-store gross total:", excludedInStoreGross.toFixed(2));
      console.log("  Truck included in-store gross total:", includedInStoreGross.toFixed(2));
    }
  }
}

main().catch(console.error);
