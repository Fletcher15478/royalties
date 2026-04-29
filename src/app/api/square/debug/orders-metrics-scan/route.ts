import { NextResponse } from "next/server";
import { getSquareClient } from "@/lib/square/client";
import { getWeekRangeMondayToMonday, toIsoNoMillis } from "@/lib/dates/weekRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function moneyToCents(m: any): number {
  const a = m?.amount;
  if (a == null) return 0;
  return typeof a === "bigint" ? Number(a) : Number(a);
}

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

function hasPaidMarker(o: any) {
  if (Array.isArray(o?.tenders) && o.tenders.length > 0) return true;
  if (Array.isArray(o?.paymentIds) && o.paymentIds.length > 0) return true;
  if (Array.isArray(o?.tenderIds) && o.tenderIds.length > 0) return true;
  return false;
}

function isCompLikeNoTender(o: any) {
  const hasMarker = hasPaidMarker(o);
  if (hasMarker) return false;
  const due = o?.netAmountDueMoney?.amount ?? o?.net_amount_due_money?.amount;
  const total = o?.totalMoney?.amount ?? o?.total_money?.amount;
  const dueN = typeof due === "bigint" ? Number(due) : Number(due ?? NaN);
  const totalN = typeof total === "bigint" ? Number(total) : Number(total ?? NaN);
  if (!Number.isNaN(dueN) && dueN === 0 && !Number.isNaN(totalN) && totalN > 0) return true;
  return false;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? "";
  const week = url.searchParams.get("week"); // yyyy-MM-dd
  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Missing ?locationId=" }, { status: 400 });
  }

  const anchor = week ? new Date(`${week}T12:00:00.000Z`) : new Date();
  const range = getWeekRangeMondayToMonday(anchor);
  const startAt = toIsoNoMillis(range.weekStart);
  const endAt = toIsoNoMillis(range.weekEnd);

  try {
    const square = getSquareClient();
    let cursor: string | undefined;

    const counts: Record<string, number> = {
      total: 0,
      completed: 0,
      paid: 0,
      hasFulfillments: 0,
      hasDeliveryFulfillment: 0,
      hasTicketName: 0,
      hasReferenceId: 0,
      missingTeamMember: 0,
      hasSourceName: 0,
      taxRemitted: 0,
      taxDoordashUberGrubhub: 0,
      lineItemHasDeliveryWord: 0,
      lineItemHasGiftCardWord: 0,
      lineItemTypeGiftCard: 0,
    };

    const taxNameCounts: Record<string, number> = {};
    const sourceNameCounts: Record<string, number> = {};
    const giftCardOrderIds: string[] = [];
    const giftCardOrderAmounts: Array<{ id: string; gcSaleCents: number; name?: string }> = [];
    const paidSourceNameCounts: Record<string, number> = {};
    const paidSourceNameOrders: Record<string, string[]> = {};
    const refundOrderIds: string[] = [];
    const refundSamples: Array<{ id: string; amountCents: number; tipCents: number; taxCents: number }> = [];
    const paidZeroGrossOrderIds: string[] = [];
    const paidZeroGrossSamples: Array<{ id: string; totalMoneyCents: number; taxCents: number; tipCents: number; source?: string }> = [];
    const paidMissingLineGrossIds: string[] = [];
    const paidMissingLineGrossSamples: Array<{ id: string; totalMoneyCents: number; totalDiscountCents: number; lineItems: number; source?: string }> = [];
    const compNoTenderIds: string[] = [];
    const compNoTenderSamples: Array<{ id: string; totalMoneyCents: number; grossCents: number; discountCents: number; taxCents: number; tipCents: number; lineItems: number }> = [];
    const noSaleTenderIds: string[] = [];
    const noSaleTenderSamples: Array<{ id: string; tenderAmountCents: number; totalMoneyCents: number; grossCents: number }> = [];
    const tipNoTaxIds: string[] = [];
    const tipNoTaxSamples: Array<{ id: string; totalMoneyCents: number; grossCents: number; tipCents: number }> = [];

    let grossCentsAll = 0;
    let grossCentsPaid = 0;
    let serviceChargeCentsPaid = 0;
    const serviceChargeOrderIds: string[] = [];
    const serviceChargeSamples: Array<{ id: string; serviceChargeCents: number }> = [];
    let grossFromTotalsCentsAll = 0;
    let discountsAppliedCentsAll = 0;
    const grossDeltaSamples: Array<{
      id: string;
      closedAt?: string;
      source?: string;
      lineGrossCents: number;
      grossFromTotalsCents: number;
      deltaCents: number;
      totalMoneyCents: number;
      taxCents: number;
      tipCents: number;
      discountAppliedCents: number;
      totalDiscountCents: number;
      serviceChargeCents: number;
      cardSurchargeCents: number;
      lineItems: number;
    }> = [];

    do {
      const res = await square.orders.search({
        locationIds: [locationId],
        cursor,
        limit: 100,
        query: {
          filter: {
            dateTimeFilter: { closedAt: { startAt, endAt } },
            stateFilter: { states: ["COMPLETED", "CANCELED"] },
          },
          sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
        },
        returnEntries: false,
      });

      const orders: any[] =
        (res as any)?.data?.orders ?? (res as any)?.orders ?? (res as any)?.result?.orders ?? [];

      for (const o of orders) {
        counts.total += 1;
        const st = String(o?.state ?? "").toUpperCase();
        if (st === "COMPLETED") counts.completed += 1;

        const paid = hasPaidMarker(o);
        if (paid) counts.paid += 1;

        const lineItems: any[] = o?.lineItems ?? [];
        const regularLineItems = lineItems.filter(
          (li) => String(li?.itemType ?? "").toUpperCase() !== "GIFT_CARD"
        );
        const g = regularLineItems.reduce((sum, li) => sum + moneyToCents(li?.grossSalesMoney), 0);
        grossCentsAll += g;
        if (paid) grossCentsPaid += g;

        const sc = moneyToCents(o?.totalServiceChargeMoney ?? o?.total_service_charge_money);
        if (paid) serviceChargeCentsPaid += sc;
        if (sc > 0 && serviceChargeOrderIds.length < 15 && o?.id) {
          serviceChargeOrderIds.push(String(o.id));
          serviceChargeSamples.push({ id: String(o.id), serviceChargeCents: sc });
        }

        const tendersAny: any[] = o?.tenders ?? [];
        const hasNoSale = tendersAny.some((ten) => String(ten?.type ?? "").toUpperCase() === "NO_SALE");
        if (hasNoSale && noSaleTenderIds.length < 15 && o?.id) {
          noSaleTenderIds.push(String(o.id));
          noSaleTenderSamples.push({
            id: String(o.id),
            tenderAmountCents: tendersAny.reduce((s, ten) => s + moneyToCents(ten?.amountMoney), 0),
            totalMoneyCents: moneyToCents(o?.totalMoney),
            grossCents: g,
          });
        }

        const taxC = moneyToCents(o?.totalTaxMoney);
        const tipC = moneyToCents(o?.totalTipMoney);
        const totalC = moneyToCents(o?.totalMoney);
        const totalDiscountC = moneyToCents(o?.totalDiscountMoney);
        const discountAppliedC = ((o?.discounts ?? []) as any[]).reduce(
          (s: number, d: any) => s + moneyToCents(d?.appliedMoney),
          0
        );
        const cardSurchargeC = moneyToCents(o?.totalCardSurchargeMoney ?? o?.total_card_surcharge_money);
        const grossFromTotalsC = Math.max(
          0,
          totalC - taxC - tipC - sc - cardSurchargeC + discountAppliedC
        );
        grossFromTotalsCentsAll += grossFromTotalsC;
        discountsAppliedCentsAll += discountAppliedC;
        const delta = grossFromTotalsC - g;
        if (delta !== 0 && grossDeltaSamples.length < 25 && o?.id) {
          grossDeltaSamples.push({
            id: String(o.id),
            closedAt: o?.closedAt,
            source: o?.source?.name,
            lineGrossCents: g,
            grossFromTotalsCents: grossFromTotalsC,
            deltaCents: delta,
            totalMoneyCents: totalC,
            taxCents: taxC,
            tipCents: tipC,
            discountAppliedCents: discountAppliedC,
            totalDiscountCents: totalDiscountC,
            serviceChargeCents: sc,
            cardSurchargeCents: cardSurchargeC,
            lineItems: (lineItems?.length ?? 0),
          });
        }
        if (paid && taxC === 0 && tipC > 0 && tipNoTaxIds.length < 15 && o?.id) {
          tipNoTaxIds.push(String(o.id));
          tipNoTaxSamples.push({ id: String(o.id), totalMoneyCents: totalC, grossCents: g, tipCents: tipC });
        }

        if (isCompLikeNoTender(o) && compNoTenderIds.length < 15 && o?.id) {
          compNoTenderIds.push(String(o.id));
          compNoTenderSamples.push({
            id: String(o.id),
            totalMoneyCents: moneyToCents(o?.totalMoney),
            grossCents: g,
            discountCents: moneyToCents(o?.totalDiscountMoney),
            taxCents: moneyToCents(o?.totalTaxMoney),
            tipCents: moneyToCents(o?.totalTipMoney),
            lineItems: (lineItems?.length ?? 0),
          });
        }

        if (paid && g === 0 && paidZeroGrossOrderIds.length < 10 && o?.id) {
          paidZeroGrossOrderIds.push(String(o.id));
          paidZeroGrossSamples.push({
            id: String(o.id),
            totalMoneyCents: moneyToCents(o?.totalMoney),
            taxCents: moneyToCents(o?.totalTaxMoney),
            tipCents: moneyToCents(o?.totalTipMoney),
            source: o?.source?.name,
          });
        }

        if (
          paid &&
          g === 0 &&
          (lineItems?.length ?? 0) > 0 &&
          moneyToCents(o?.totalMoney) > 0 &&
          paidMissingLineGrossIds.length < 10 &&
          o?.id
        ) {
          paidMissingLineGrossIds.push(String(o.id));
          paidMissingLineGrossSamples.push({
            id: String(o.id),
            totalMoneyCents: moneyToCents(o?.totalMoney),
            totalDiscountCents: moneyToCents(o?.totalDiscountMoney),
            lineItems: (lineItems?.length ?? 0),
            source: o?.source?.name,
          });
        }

        const fulfillments: any[] = o?.fulfillments ?? [];
        if (fulfillments.length > 0) counts.hasFulfillments += 1;
        if (fulfillments.some((f) => String(f?.type).toUpperCase() === "DELIVERY")) {
          counts.hasDeliveryFulfillment += 1;
        }

        if (o?.ticketName) counts.hasTicketName += 1;
        if (o?.referenceId) counts.hasReferenceId += 1;

        const tm = o?.createdByTeamMemberId ?? o?.created_by_team_member_id;
        if (!tm) counts.missingTeamMember += 1;

        const sn = o?.source?.name;
        if (sn) {
          counts.hasSourceName += 1;
          sourceNameCounts[String(sn)] = (sourceNameCounts[String(sn)] ?? 0) + 1;
          if (paid) {
            const key = String(sn);
            paidSourceNameCounts[key] = (paidSourceNameCounts[key] ?? 0) + 1;
            const arr = paidSourceNameOrders[key] ?? [];
            if (arr.length < 10 && o?.id) arr.push(String(o.id));
            paidSourceNameOrders[key] = arr;
          }
        }

        const taxes: any[] = o?.taxes ?? [];
        const taxText = taxes.map((t) => String(t?.name ?? "")).join(" ").toLowerCase();
        if (taxText.includes("remitted")) counts.taxRemitted += 1;
        if (taxText.includes("doordash") || taxText.includes("uber") || taxText.includes("grubhub")) {
          counts.taxDoordashUberGrubhub += 1;
        }
        for (const t of taxes) {
          const name = String(t?.name ?? "UNKNOWN");
          taxNameCounts[name] = (taxNameCounts[name] ?? 0) + 1;
        }

        const liText = lineItems.map((li) => String(li?.name ?? "")).join(" ").toLowerCase();
        if (liText.includes("delivery")) counts.lineItemHasDeliveryWord += 1;
        if (liText.includes("gift card") || liText.includes("giftcard")) counts.lineItemHasGiftCardWord += 1;
        const gcLis = lineItems.filter((li) => String(li?.itemType ?? "").toUpperCase() === "GIFT_CARD");
        if (gcLis.length > 0) {
          counts.lineItemTypeGiftCard += 1;
          if (giftCardOrderIds.length < 10 && o?.id) giftCardOrderIds.push(String(o.id));
          const gcSale = gcLis.reduce((sum, li) => sum + moneyToCents(li?.grossSalesMoney), 0);
          if (o?.id) {
            giftCardOrderAmounts.push({
              id: String(o.id),
              gcSaleCents: gcSale,
              name: gcLis[0]?.name,
            });
          }
        }

        const refundsArr: any[] = o?.refunds ?? [];
        if (refundsArr.length > 0 && refundOrderIds.length < 10 && o?.id) {
          refundOrderIds.push(String(o.id));
          const amt = refundsArr.reduce((s, rf) => s + moneyToCents(rf?.amountMoney), 0);
          refundSamples.push({
            id: String(o.id),
            amountCents: amt,
            tipCents: refundsArr.reduce((s, rf) => s + moneyToCents(rf?.tipMoney), 0),
            taxCents: refundsArr.reduce((s, rf) => s + moneyToCents(rf?.taxMoney), 0),
          });
        }
      }

      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
    } while (cursor);

    return NextResponse.json({
      ok: true,
      locationId,
      range: { startAt, endAt },
      counts,
      grossSales: {
        allOrders: centsToDollars(grossCentsAll),
        paidOnly: centsToDollars(grossCentsPaid),
      },
      grossFromTotals: {
        allOrders: centsToDollars(grossFromTotalsCentsAll),
        discountsApplied: centsToDollars(discountsAppliedCentsAll),
      },
      grossDeltaSamples: grossDeltaSamples
        .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
        .map((x) => ({
          ...x,
          lineGross: centsToDollars(x.lineGrossCents),
          grossFromTotals: centsToDollars(x.grossFromTotalsCents),
          delta: centsToDollars(x.deltaCents),
          totalMoney: centsToDollars(x.totalMoneyCents),
          tax: centsToDollars(x.taxCents),
          tip: centsToDollars(x.tipCents),
          discountApplied: centsToDollars(x.discountAppliedCents),
          totalDiscount: centsToDollars(x.totalDiscountCents),
          serviceCharge: centsToDollars(x.serviceChargeCents),
          cardSurcharge: centsToDollars(x.cardSurchargeCents),
        })),
      serviceCharges: {
        paidOnly: Math.round(serviceChargeCentsPaid) / 100,
        sampleOrders: serviceChargeSamples.map((s) => ({ ...s, serviceCharge: s.serviceChargeCents / 100 })),
      },
      sourceNameCounts,
      paidSourceNameCounts,
      paidSourceNameOrders,
      topTaxNames: Object.entries(taxNameCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25),
      giftCardOrderIds,
      giftCardOrderAmounts: giftCardOrderAmounts
        .sort((a, b) => b.gcSaleCents - a.gcSaleCents)
        .slice(0, 10)
        .map((x) => ({ ...x, gcSale: x.gcSaleCents / 100 })),
      refundOrderIds,
      refundSamples: refundSamples.map((x) => ({
        ...x,
        amount: x.amountCents / 100,
        tip: x.tipCents / 100,
        tax: x.taxCents / 100,
      })),
      paidZeroGrossOrderIds,
      paidZeroGrossSamples: paidZeroGrossSamples.map((x) => ({
        ...x,
        totalMoney: x.totalMoneyCents / 100,
        tax: x.taxCents / 100,
        tip: x.tipCents / 100,
      })),
      paidMissingLineGrossIds,
      paidMissingLineGrossSamples: paidMissingLineGrossSamples.map((x) => ({
        ...x,
        totalMoney: x.totalMoneyCents / 100,
        totalDiscount: x.totalDiscountCents / 100,
      })),
      compNoTenderIds,
      compNoTenderSamples: compNoTenderSamples.map((x) => ({
        ...x,
        totalMoney: x.totalMoneyCents / 100,
        gross: x.grossCents / 100,
        discount: x.discountCents / 100,
        tax: x.taxCents / 100,
        tip: x.tipCents / 100,
      })),
      noSaleTenderIds,
      noSaleTenderSamples: noSaleTenderSamples.map((x) => ({
        ...x,
        tenderAmount: x.tenderAmountCents / 100,
        totalMoney: x.totalMoneyCents / 100,
        gross: x.grossCents / 100,
      })),
      tipNoTaxIds,
      tipNoTaxSamples: tipNoTaxSamples.map((x) => ({
        ...x,
        totalMoney: x.totalMoneyCents / 100,
        gross: x.grossCents / 100,
        tip: x.tipCents / 100,
      })),
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

