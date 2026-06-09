import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
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

async function probeLawrencevilleAndTruck() {
  const { getLocationWeeklyDetail, LAWRENCEVILLE_LOCATION_ID } = await import(
    "../src/lib/square/locationDetail"
  );
  const { getLocationWeeklySummary } = await import("../src/lib/square/weeklySummary");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");
  const { getSquareClient } = await import("../src/lib/square/client");
  const { shouldExcludeFromInStoreSales } = await import("../src/lib/analytics/exclusions");

  const tz = "America/New_York";
  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), tz);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  const detail = await getLocationWeeklyDetail(LAWRENCEVILLE_LOCATION_ID, range, {
    timeZone: tz,
    forceSquare: true,
  });
  console.log("Lawrenceville detail.netSales:", detail.netSales);
  console.log("Lawrenceville debug:", (detail as any)._debugLawrenceville);

  const truckId = "LWW1CFV8T5DTF";
  const truckDetail = await getLocationWeeklyDetail(truckId, range, { timeZone: tz, forceSquare: true });
  const truckSummary = await getLocationWeeklySummary(truckId, range);
  console.log("\nTruck PGH detail:", {
    gross: truckDetail.grossSales,
    discounts: truckDetail.discounts,
    refunds: truckDetail.refunds,
    net: truckDetail.netSales,
  });
  console.log("Truck PGH summary:", truckSummary);

  const square = getSquareClient();
  let scCents = 0;
  let surchargeCents = 0;
  let excludedGross = 0;
  let unpaidGross = 0;
  let cursor: string | undefined;
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
    const orders: any[] = (res as any)?.data?.orders ?? [];
    for (const o of orders) {
      const sc = ((o?.serviceCharges ?? []) as any[]).reduce(
        (s, c) => s + moneyToCents(c?.appliedMoney ?? c?.totalMoney),
        0
      );
      scCents += sc;
      surchargeCents += moneyToCents(o?.totalCardSurchargeMoney);
      const g = (o?.lineItems ?? [])
        .filter((li: any) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD")
        .reduce((s: number, li: any) => s + moneyToCents(li?.grossSalesMoney), 0);
      if (shouldExcludeFromInStoreSales(o, truckId)) excludedGross += g;
      else if (!o?.tenders?.length) unpaidGross += g;
    }
    cursor = (res as any)?.data?.cursor;
  } while (cursor);
  console.log("\nTruck service charges cents:", scCents / 100);
  console.log("Truck card surcharge cents:", surchargeCents / 100);
  console.log("Truck excluded gross:", excludedGross / 100);
  console.log("Truck unpaid/no-tender gross:", unpaidGross / 100);
  console.log("Truck net + SC:", truckDetail.netSales + scCents / 100);
  console.log("Truck net + surcharge:", truckDetail.netSales + surchargeCents / 100);
}

async function probeDeliveryOrders() {
  const { searchOrdersInRange } = await import("../src/lib/square/delivery/searchOrders");
  const { getWeekRangeMondayToMondayInTimeZone, toIsoNoMillis } = await import("../src/lib/dates/weekRange");

  const range = getWeekRangeMondayToMondayInTimeZone(new Date("2026-06-02T12:00:00.000Z"), "America/New_York");
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  for (const [locId, name, targetDel] of [
    ["LZGJ6T9JYFG7W", "South Fayette", 164.69],
    ["LEAVYE5AMZF06", "Cranberry", 219.6],
    ["LQQKGMSGV8V1M", "Ponte Vedra", 261.42],
  ] as const) {
    const all = await searchOrdersInRange({ locationIds: [locId], startAt, endAt, deliveryOnly: false });
    const deliveryLike = all.filter((o) => {
      const src = String(o?.source?.name ?? "").toLowerCase();
      return (
        src.includes("doordash") ||
        src.includes("uber") ||
        src.includes("grubhub") ||
        src.includes("postmates") ||
        src.includes("delivery")
      );
    });
    console.log(`\n${name} all orders ${all.length}, delivery-like ${deliveryLike.length}, target del ${targetDel}`);
    for (const o of deliveryLike) {
      const g = (o?.lineItems ?? []).reduce(
        (s: number, li: any) => s + moneyToCents(li?.grossSalesMoney),
        0
      );
      const tgm = moneyToCents(o?.totalGrossSalesMoney);
      const disc = moneyToCents(o?.totalDiscountMoney);
      const tm = moneyToCents(o?.totalMoney);
      const tax = moneyToCents(o?.totalTaxMoney);
      const tip = moneyToCents(o?.totalTipMoney);
      console.log(
        `  ${String(o.id).slice(-8)} src=${o?.source?.name} lineGross=${(g / 100).toFixed(2)} tgm=${(tgm / 100).toFixed(2)} disc=${(disc / 100).toFixed(2)} tm-tax-tip=${((tm - tax - tip) / 100).toFixed(2)}`
      );
    }
  }
}

async function main() {
  await probeLawrencevilleAndTruck();
  await probeDeliveryOrders();
}

main().catch(console.error);
