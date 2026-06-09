import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[t.slice(0, i).trim()] = v;
    }
  } catch {}
}

loadEnvLocal();

function mc(m: any) {
  const a = m?.amount ?? m;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

async function main() {
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { isThirdPartyDeliveryOrder } = await import("../src/lib/square/delivery/classify");
  const { LAWRENCEVILLE_LOCATION_ID } = await import("../src/lib/square/locationDetail");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();

  // LRV discount comparison
  let cursor: string | undefined;
  let appliedDisc = 0;
  let lineDisc = 0;
  let orderDisc = 0;
  let lineGross = 0;
  let returns = 0;
  do {
    const res = await square.orders.search({
      locationIds: [LAWRENCEVILLE_LOCATION_ID],
      cursor,
      limit: 100,
      query: {
        filter: {
          dateTimeFilter: { closedAt: { startAt, endAt } },
          stateFilter: { states: ["COMPLETED"] },
        },
      },
    });
    for (const o of (res as any)?.data?.orders ?? (res as any)?.orders ?? []) {
      const items = (o?.lineItems ?? []).filter(
        (li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD"
      );
      lineGross += items.reduce((s: number, li: any) => s + mc(li?.grossSalesMoney), 0);
      lineDisc += items.reduce((s: number, li: any) => s + mc(li?.totalDiscountMoney), 0);
      orderDisc += mc(o?.totalDiscountMoney);
      appliedDisc += ((o?.discounts ?? []) as any[]).reduce(
        (s, d) => s + mc(d?.appliedMoney),
        0
      );
      for (const ret of o?.returns ?? []) {
        for (const rli of ret?.returnLineItems ?? []) {
          if (String(rli?.itemType ?? "").toUpperCase() === "CUSTOM_AMOUNT") continue;
          returns += mc(rli?.grossReturnMoney);
        }
      }
    }
    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor;
  } while (cursor);

  console.log("LRV lineGross", lineGross / 100);
  console.log("appliedDisc", appliedDisc / 100, "lineDisc", lineDisc / 100, "orderDisc", orderDisc / 100);
  console.log("net applied", (lineGross - appliedDisc - returns) / 100);
  console.log("net lineDisc", (lineGross - lineDisc - returns) / 100);
  console.log("net orderDisc", (lineGross - orderDisc - returns) / 100);
  console.log("target 10176");

  // Delivery tips/service for SF/Cranberry
  for (const id of ["LZGJ6T9JYFG7W", "LEAVYE5AMZF06"]) {
    cursor = undefined;
    let g = 0,
      tax = 0,
      tip = 0,
      sc = 0,
      tm = 0;
    do {
      const res = await square.orders.search({
        locationIds: [id],
        cursor,
        limit: 100,
        query: {
          filter: {
            dateTimeFilter: { closedAt: { startAt, endAt } },
            stateFilter: { states: ["COMPLETED"] },
          },
        },
      });
      for (const o of (res as any)?.data?.orders ?? (res as any)?.orders ?? []) {
        if (!isThirdPartyDeliveryOrder(o)) continue;
        g += (o.lineItems ?? []).reduce(
          (s: number, li: any) => s + mc(li?.grossSalesMoney),
          0
        );
        tax += mc(o?.totalTaxMoney);
        tip += mc(o?.totalTipMoney);
        sc += ((o?.serviceCharges ?? []) as any[]).reduce(
          (s: number, c: any) => s + mc(c?.appliedMoney ?? c?.totalMoney),
          0
        );
        tm += mc(o?.totalMoney);
      }
      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor;
    } while (cursor);
    console.log(`\n${id} delivery g=${(g / 100).toFixed(2)} tax=${(tax / 100).toFixed(2)} tip=${(tip / 100).toFixed(2)} sc=${(sc / 100).toFixed(2)} tm=${(tm / 100).toFixed(2)}`);
    console.log(`  g+tax+tip=${((g + tax + tip) / 100).toFixed(2)} g+tax+sc=${((g + tax + sc) / 100).toFixed(2)}`);
  }
}

main().catch(console.error);
