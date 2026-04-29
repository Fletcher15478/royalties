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

function isPaidLike(o: any): boolean {
  const tenders = o?.tenders;
  if (Array.isArray(tenders) && tenders.length > 0) return true;
  if (Array.isArray(o?.paymentIds) && o.paymentIds.length > 0) return true;
  if (Array.isArray(o?.tenderIds) && o.tenderIds.length > 0) return true;
  const due = o?.netAmountDueMoney?.amount ?? o?.net_amount_due_money?.amount;
  const dueN = typeof due === "bigint" ? Number(due) : Number(due ?? NaN);
  if (!Number.isNaN(dueN) && dueN === 0) return true;
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
    let total = 0;
    let completed = 0;
    let withReturns = 0;
    const sampleReturnOrderIds: string[] = [];
    let withRefundedMoney = 0;
    let withFulfillments = 0;
    let withSourceName = 0;
    let withTeamMember = 0;
    let missingTeamMember = 0;
    let withTicketName = 0;
    let withReferenceId = 0;
    let zeroTotal = 0;
    let tinyTotal = 0;
    let unpaid = 0;
    const sampleUnpaid: any[] = [];
    const sourceNames: Record<string, number> = {};
    const sampleIdsBySource: Record<string, string[]> = {};
    const sampleTicketNames: Record<string, string[]> = {};

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
        total += 1;
        const st = String(o?.state ?? "").toUpperCase();
        if (st === "COMPLETED") completed += 1;
        if (Array.isArray(o?.returns) && o.returns.length > 0) withReturns += 1;
        if (
          Array.isArray(o?.returns) &&
          o.returns.length > 0 &&
          sampleReturnOrderIds.length < 5 &&
          o?.id
        ) {
          sampleReturnOrderIds.push(String(o.id));
        }
        if (o?.totalRefundedMoney?.amount != null) withRefundedMoney += 1;
        if (Array.isArray(o?.fulfillments) && o.fulfillments.length > 0) withFulfillments += 1;
        const sn = o?.source?.name;
        if (sn) {
          withSourceName += 1;
          sourceNames[String(sn)] = (sourceNames[String(sn)] ?? 0) + 1;
          const k = String(sn);
          sampleIdsBySource[k] = sampleIdsBySource[k] ?? [];
          if (sampleIdsBySource[k].length < 5 && o?.id) sampleIdsBySource[k].push(String(o.id));
        }
        const tm = o?.createdByTeamMemberId ?? o?.created_by_team_member_id;
        if (tm) withTeamMember += 1;
        else missingTeamMember += 1;

        if (o?.ticketName) {
          withTicketName += 1;
          const tn = String(o.ticketName);
          sampleTicketNames[tn] = sampleTicketNames[tn] ?? [];
          if (sampleTicketNames[tn].length < 3 && o?.id) sampleTicketNames[tn].push(String(o.id));
        }
        if (o?.referenceId) withReferenceId += 1;

        const amt =
          (o?.netAmounts?.totalMoney?.amount ?? o?.totalMoney?.amount ?? 0);
        const n = typeof amt === "bigint" ? Number(amt) : Number(amt);
        if (n === 0) zeroTotal += 1;
        if (n > 0 && n <= 25) tinyTotal += 1; // <= $0.25

        const paidLike = isPaidLike(o);
        if (!paidLike) {
          unpaid += 1;
          if (sampleUnpaid.length < 10) {
            const li: any[] = o?.lineItems ?? [];
            const grossLines = li.reduce((s, x) => s + moneyToCents(x?.grossSalesMoney), 0);
            sampleUnpaid.push({
              id: o?.id,
              state: o?.state,
              createdAt: o?.createdAt,
              closedAt: o?.closedAt,
              source: o?.source?.name,
              tenders: Array.isArray(o?.tenders) ? o.tenders.length : 0,
              paymentIds: Array.isArray(o?.paymentIds) ? o.paymentIds.length : 0,
              tenderIds: Array.isArray(o?.tenderIds) ? o.tenderIds.length : 0,
              netAmountDue: moneyToCents(o?.netAmountDueMoney ?? o?.net_amount_due_money),
              totalMoney: moneyToCents(o?.totalMoney),
              totalTaxMoney: moneyToCents(o?.totalTaxMoney),
              totalTipMoney: moneyToCents(o?.totalTipMoney),
              totalDiscountMoney: moneyToCents(o?.totalDiscountMoney),
              totalServiceChargeMoney: moneyToCents(o?.totalServiceChargeMoney ?? o?.total_service_charge_money),
              totalCardSurchargeMoney: moneyToCents(o?.totalCardSurchargeMoney ?? o?.total_card_surcharge_money),
              grossLines,
              lineItemCount: li.length,
            });
          }
        }
      }

      cursor = (res as any)?.data?.cursor ?? (res as any)?.cursor ?? (res as any)?.result?.cursor;
    } while (cursor);

    return NextResponse.json({
      ok: true,
      locationId,
      range: { startAt, endAt },
      counts: {
        total,
        completed,
        withReturns,
        withRefundedMoney,
        withFulfillments,
        withSourceName,
        withTeamMember,
        missingTeamMember,
        withTicketName,
        withReferenceId,
        zeroTotal,
        tinyTotal,
        unpaid,
      },
      sourceNames,
      sampleIdsBySource,
      sampleTicketNames,
      sampleReturnOrderIds,
      sampleUnpaid,
    });
  } catch (err: unknown) {
    const e = err as any;
    return NextResponse.json(
      { ok: false, message: e?.message ?? "Square error", statusCode: e?.statusCode, body: e?.body },
      { status: 500 }
    );
  }
}

