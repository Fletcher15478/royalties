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
  } catch {}
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

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();
  const truckId = "LWW1CFV8T5DTF";

  let cursor: string | undefined;
  const returns: any[] = [];
  let grossLines = 0;
  let discounts = 0;
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
      const lineItems = (o?.lineItems ?? []).filter(
        (li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD"
      );
      grossLines += lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);
      discounts += lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.totalDiscountMoney), 0);
      discounts = Math.max(discounts, moneyToCents(o?.totalDiscountMoney));

      for (const ret of o?.returns ?? []) {
        const rlis = ret?.returnLineItems ?? [];
        const eligible = rlis.filter(
          (rli: any) => String(rli?.itemType ?? "").toUpperCase() !== "CUSTOM_AMOUNT"
        );
        const merch = eligible.reduce((s: number, rli: any) => s + moneyToCents(rli?.grossReturnMoney), 0);
        const tax = eligible.reduce((s: number, rli: any) => s + moneyToCents(rli?.totalTaxMoney), 0);
        const total = moneyToCents(ret?.returnAmounts?.totalMoney) || moneyToCents(ret?.returnAmountMoney);
        if (merch || total) {
          returns.push({
            orderId: o.id,
            merch: merch / 100,
            tax: tax / 100,
            total: total / 100,
            rliCount: rlis.length,
          });
        }
      }
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);

  console.log("Truck returns:", returns);
  console.log("Sum merch returns:", returns.reduce((s, r) => s + r.merch, 0));
  console.log("Sum total returns:", returns.reduce((s, r) => s + r.total, 0));
  console.log("Gross lines:", grossLines / 100, "discounts:", discounts / 100);
  console.log("Net merch returns:", (grossLines / 100 - discounts / 100 - returns.reduce((s, r) => s + r.merch, 0)).toFixed(2));

  // Lawrenceville - sample lowest contribution orders / gift cards
  const lrvId = "LRVZG0XCQPASB";
  cursor = undefined;
  const smallOrders: { net: number; id: string; name: string }[] = [];
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
      const g = (o?.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      const d = ((o?.discounts ?? []) as any[]).reduce(
        (s, od) => s + moneyToCents(od?.appliedMoney),
        0
      );
      const net = (g - d) / 100;
      if (net > 0 && net < 20) {
        smallOrders.push({
          net,
          id: String(o.id),
          name: String(o?.lineItems?.[0]?.name ?? ""),
        });
      }
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  const sorted = smallOrders.sort((a, b) => b.net - a.net);
  console.log("\nLRV small orders count:", sorted.length);
  console.log("Top 20 small:", sorted.slice(0, 20));
  console.log("Sum if exclude top N to reach 131.56:");
  let cum = 0;
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i].net;
    if (Math.abs(cum - 131.56) < 1) console.log(`  exclude ${i + 1} orders = ${cum.toFixed(2)}`);
  }
}

main().catch(console.error);
