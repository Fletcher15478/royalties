import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  try {
    readFileSync(join(process.cwd(), ".env.local"), "utf8")
      .split("\n")
      .forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return;
        const i = t.indexOf("=");
        if (i < 0) return;
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
          v = v.slice(1, -1);
        process.env[t.slice(0, i).trim()] = v;
      });
  } catch {
    /* env may already be set */
  }
}

loadEnvLocal();

function moneyToCents(m: any): number {
  const a = m?.amount ?? m;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

async function main() {
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { shouldExcludeSquareOnlineOrder } = await import("../src/lib/analytics/exclusions");
  const { isThirdPartyDeliveryOrder } = await import("../src/lib/square/delivery/classify");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();

  // South Fayette excluded Square Online
  const sfId = "LZGJ6T9JYFG7W";
  let cursor: string | undefined;
  let exSoTotal = 0;
  const exSo: any[] = [];
  do {
    const res = await square.orders.search({
      locationIds: [sfId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    });
    for (const o of (res as any)?.data?.orders ?? []) {
      const src = String(o?.source?.name ?? "");
      if (!src.toLowerCase().includes("square online")) continue;
      if (!shouldExcludeSquareOnlineOrder(o, sfId)) continue;
      const g = (o?.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      const d = moneyToCents(o?.totalDiscountMoney);
      exSoTotal += (g - d) / 100;
      exSo.push({ id: o.id, src, net: (g - d) / 100, tip: moneyToCents(o?.totalTipMoney) / 100 });
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  console.log("SF excluded Square Online net total:", exSoTotal.toFixed(2), exSo);

  // Cranberry - same check + any non-3P excluded delivery-like
  const crId = "LEAVYE5AMZF06";
  cursor = undefined;
  let crExtra = 0;
  do {
    const res = await square.orders.search({
      locationIds: [crId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    });
    for (const o of (res as any)?.data?.orders ?? []) {
      if (isThirdPartyDeliveryOrder(o)) continue;
      const src = String(o?.source?.name ?? "").toLowerCase();
      if (!src.includes("square online") && !src.includes("online")) continue;
      const g = (o?.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      crExtra += (g - moneyToCents(o?.totalDiscountMoney)) / 100;
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  console.log("Cranberry extra square online net:", crExtra.toFixed(2));

  // Truck PGH returns breakdown
  const truckId = "LWW1CFV8T5DTF";
  cursor = undefined;
  let returnMerch = 0;
  let returnTotal = 0;
  let returnTax = 0;
  do {
    const res = await square.orders.search({
      locationIds: [truckId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    });
    for (const o of (res as any)?.data?.orders ?? []) {
      for (const ret of o?.returns ?? []) {
        const rlis = ret?.returnLineItems ?? [];
        const eligible = rlis.filter(
          (rli: any) => String(rli?.itemType ?? "").toUpperCase() !== "CUSTOM_AMOUNT"
        );
        returnMerch += eligible.reduce(
          (s: number, rli: any) => s + moneyToCents(rli?.grossReturnMoney),
          0
        );
        returnTax += eligible.reduce(
          (s: number, rli: any) => s + moneyToCents(rli?.totalTaxMoney),
          0
        );
        returnTotal += moneyToCents(ret?.returnAmounts?.totalMoney) || moneyToCents(ret?.returnAmountMoney);
      }
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  console.log("\nTruck returns merch:", returnMerch / 100);
  console.log("Truck returns tax:", returnTax / 100);
  console.log("Truck returns total:", returnTotal / 100);
  console.log("Truck net if merch returns:", (10627.5 - 604 - returnMerch / 100).toFixed(2));
  console.log("Truck net if total returns:", (10627.5 - 604 - returnTotal / 100).toFixed(2));

  // Lawrenceville - find orders to exclude for 131.56
  const lrvId = "LRVZG0XCQPASB";
  cursor = undefined;
  let lrvUnpaidGross = 0;
  do {
    const res = await square.orders.search({
      locationIds: [lrvId],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    });
    for (const o of (res as any)?.data?.orders ?? []) {
      const tenders = o?.tenders ?? [];
      if (tenders.length > 0) continue;
      const g = (o?.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      const d = ((o?.discounts ?? []) as any[]).reduce(
        (s, od) => s + moneyToCents(od?.appliedMoney),
        0
      );
      if (g - d > 0) lrvUnpaidGross += (g - d) / 100;
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  console.log("\nLawrenceville unpaid net total:", lrvUnpaidGross.toFixed(2));
  console.log("LRV net minus unpaid:", (10307.56 - lrvUnpaidGross).toFixed(2));
}

main().catch(console.error);
