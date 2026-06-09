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

function moneyToCents(m: any): number {
  const a = m?.amount ?? m;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

async function analyzeTruck() {
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { getLocationWeeklyDetail } = await import("../src/lib/square/locationDetail");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const truckId = "LWW1CFV8T5DTF";
  const detail = await getLocationWeeklyDetail(truckId, range, { timeZone: "America/New_York", forceSquare: true });

  const square = getSquareClient();
  let cursor: string | undefined;
  let refundsFromReturns = 0;
  let returnsTax = 0;
  let returnsTotal = 0;
  let refundsFromObjects = 0;
  let grossLines = 0;
  let discount = 0;
  let unpaidGross = 0;
  let noSaleGross = 0;

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
    const orders: any[] = (res as any)?.data?.orders ?? (res as any)?.orders ?? [];
    for (const o of orders) {
      const lineItems = (o?.lineItems ?? []).filter(
        (li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD"
      );
      const g = lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);
      grossLines += g;
      const d = Math.max(
        lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.totalDiscountMoney), 0),
        moneyToCents(o?.totalDiscountMoney)
      );
      discount += d;

      const tenders = o?.tenders ?? [];
      if (!tenders.length) unpaidGross += g - d;
      const noSale =
        tenders.length > 0 &&
        tenders.every((t: any) => String(t?.type ?? "").toUpperCase() === "NO_SALE") &&
        tenders.reduce((s: number, t: any) => s + moneyToCents(t?.amountMoney), 0) === 0;
      if (noSale) noSaleGross += g - d;

      for (const ret of o?.returns ?? []) {
        const rlis = ret?.returnLineItems ?? [];
        const eligible = rlis.filter(
          (rli: any) => String(rli?.itemType ?? "").toUpperCase() !== "CUSTOM_AMOUNT"
        );
        refundsFromReturns += eligible.reduce(
          (s: number, rli: any) => s + moneyToCents(rli?.grossReturnMoney),
          0
        );
        returnsTax += eligible.reduce(
          (s: number, rli: any) => s + moneyToCents(rli?.totalTaxMoney),
          0
        );
        returnsTotal += moneyToCents(ret?.returnAmounts?.totalMoney) || moneyToCents(ret?.returnAmountMoney);
      }
      for (const rf of o?.refunds ?? []) {
        const st = String(rf?.status ?? "").toUpperCase();
        if (st === "APPROVED" || st === "COMPLETED") {
          refundsFromObjects += moneyToCents(rf?.amountMoney);
        }
      }
    }
    cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor;
  } while (cursor);

  console.log("=== Truck PGH ===");
  console.log("detail", detail);
  console.log("computed gross", grossLines / 100, "discount", discount / 100);
  console.log("returns merch", refundsFromReturns / 100, "returns tax", returnsTax / 100, "returns total", returnsTotal / 100);
  console.log("refund objects", refundsFromObjects / 100);
  console.log("unpaid gross", unpaidGross / 100, "nosale gross", noSaleGross / 100);
  console.log("net merch returns", (grossLines / 100 - discount / 100 - refundsFromReturns / 100).toFixed(2));
  console.log("net total returns", (grossLines / 100 - discount / 100 - returnsTotal / 100).toFixed(2));
  console.log("net merch+tax as return", (grossLines / 100 - discount / 100 - (refundsFromReturns + returnsTax) / 100).toFixed(2));
}

async function analyzeLawrenceville() {
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { LAWRENCEVILLE_LOCATION_ID } = await import("../src/lib/square/locationDetail");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();

  let cursor: string | undefined;
  let strictNet = 0;
  let standardNet = 0;
  let giftCardGross = 0;
  let noTenderNet = 0;

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
    for (const o of (res as any)?.data?.orders ?? []) {
      const lineItems = (o?.lineItems ?? []).filter(
        (li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD"
      );
      const gc = (o?.lineItems ?? []).filter(
        (li: any) => String(li?.itemType ?? "").toUpperCase() === "GIFT_CARD"
      );
      giftCardGross += gc.reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);

      const g = lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);
      const d = Math.max(
        lineItems.reduce((s: number, li: any) => s + moneyToCents(li?.totalDiscountMoney), 0),
        ((o?.discounts ?? []) as any[]).reduce((s, od) => s + moneyToCents(od?.appliedMoney), 0)
      );
      let returns = 0;
      for (const ret of o?.returns ?? []) {
        for (const rli of ret?.returnLineItems ?? []) {
          if (String(rli?.itemType ?? "").toUpperCase() === "CUSTOM_AMOUNT") continue;
          returns += moneyToCents(rli?.grossReturnMoney);
        }
      }
      standardNet += g - d - returns;
      const od = ((o?.discounts ?? []) as any[]).reduce((s, od) => s + moneyToCents(od?.appliedMoney), 0);
      strictNet += g - od - returns;
      if (!(o?.tenders ?? []).length && g - od - returns > 0) noTenderNet += g - od - returns;
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);

  console.log("\n=== Lawrenceville ===");
  console.log("standardNet", (standardNet / 100).toFixed(2));
  console.log("strictNet (line-discounts-returns)", (strictNet / 100).toFixed(2));
  console.log("noTenderNet", (noTenderNet / 100).toFixed(2));
  console.log("giftCardGross", (giftCardGross / 100).toFixed(2));
  console.log("strict - 131.56", (strictNet / 100 - 131.56).toFixed(2));
}

async function analyzeDeliveryGaps() {
  const { calculateDeliveryOrderNetRoyalty } = await import("../src/lib/square/delivery/netRoyalty");
  const { buildRefundTotalsByPaymentId } = await import("../src/lib/square/delivery/refunds");
  const { searchOrdersInRange } = await import("../src/lib/square/delivery/searchOrders");
  const { isThirdPartyDeliveryOrder } = await import("../src/lib/square/delivery/classify");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  for (const [id, name, targetDel] of [
    ["LZGJ6T9JYFG7W", "SF", 164.69],
    ["LEAVYE5AMZF06", "Cranberry", 219.6],
    ["LQQKGMSGV8V1M", "PV", 261.42],
  ] as const) {
    const refundByPaymentId = await buildRefundTotalsByPaymentId({
      locationId: id,
      beginTime: startAt,
      endTime: endAt,
    });
    const orders = await searchOrdersInRange({ locationIds: [id], startAt, endAt, deliveryOnly: false });
    let delNet = 0;
    let delGross = 0;
    let delLeadership = 0;
    for (const o of orders) {
      if (!isThirdPartyDeliveryOrder(o)) continue;
      const br = calculateDeliveryOrderNetRoyalty(o, refundByPaymentId)!;
      const src = String(o?.source?.name ?? "");
      const excludePv =
        id === "LQQKGMSGV8V1M" &&
        (src.toLowerCase().includes("postmates") || src.toLowerCase().includes("storefront"));
      delNet += br.netRoyaltyEligible;
      delGross += br.grossSales;
      if (!excludePv) delLeadership += br.netRoyaltyEligible;
    }
    console.log(`\n${name} delivery net ${delNet.toFixed(2)} leadership-style ${delLeadership.toFixed(2)} target ${targetDel}`);
  }
}

async function analyzeDeliveryTax() {
  const { searchOrdersInRange } = await import("../src/lib/square/delivery/searchOrders");
  const { isThirdPartyDeliveryOrder } = await import("../src/lib/square/delivery/classify");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  for (const [id, name, targetDel] of [
    ["LZGJ6T9JYFG7W", "SF", 164.69],
    ["LEAVYE5AMZF06", "Cranberry", 219.6],
    ["LQQKGMSGV8V1M", "PV", 261.42],
  ] as const) {
    const orders = await searchOrdersInRange({ locationIds: [id], startAt, endAt, deliveryOnly: false });
    let gross = 0;
    let tax = 0;
    for (const o of orders) {
      if (!isThirdPartyDeliveryOrder(o)) continue;
      const g = (o.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      gross += g;
      tax += moneyToCents(o?.totalTaxMoney);
    }
    console.log(
      `${name} del gross ${(gross / 100).toFixed(2)} tax ${(tax / 100).toFixed(2)} gross+tax ${((gross + tax) / 100).toFixed(2)} target ${targetDel}`
    );
  }
}

async function analyzeTruckReturnsDetail() {
  const { getSquareClient } = await import("../src/lib/square/client");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);
  const square = getSquareClient();
  let cursor: string | undefined;
  const lines: { merch: number; tax: number; total: number; type: string }[] = [];

  do {
    const res = await square.orders.search({
      locationIds: ["LWW1CFV8T5DTF"],
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
        for (const rli of ret?.returnLineItems ?? []) {
          const typ = String(rli?.itemType ?? "").toUpperCase();
          lines.push({
            type: typ,
            merch: moneyToCents(rli?.grossReturnMoney) / 100,
            tax: moneyToCents(rli?.totalTaxMoney) / 100,
            total: moneyToCents(rli?.totalMoney) / 100,
          });
        }
      }
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);

  console.log("\nTruck return lines:", lines);
  console.log("Sum merch", lines.reduce((s, l) => s + l.merch, 0));
  console.log("Sum tax", lines.reduce((s, l) => s + l.tax, 0));
  console.log("CUSTOM only", lines.filter((l) => l.type === "CUSTOM_AMOUNT"));
}

async function analyzeLawrencevilleDetail() {
  const { getLocationWeeklyDetail, LAWRENCEVILLE_LOCATION_ID } = await import("../src/lib/square/locationDetail");
  const { getWeekRangeMondayToMondayInTimeZone } = await import("../src/lib/dates/weekRange");
  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const d = await getLocationWeeklyDetail(LAWRENCEVILLE_LOCATION_ID, range, {
    timeZone: "America/New_York",
    forceSquare: true,
  });
  console.log("\nLRV detail giftCard", d.giftCardSales, "net-gift", d.netSales - d.giftCardSales);
}

async function main() {
  await analyzeTruck();
  await analyzeTruckReturnsDetail();
  await analyzeLawrencevilleDetail();
  await analyzeLawrenceville();
  await analyzeDeliveryGaps();
  await analyzeDeliveryTax();
}

main().catch(console.error);
