import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays } from "date-fns";
import { DashboardWeekNav } from "@/components/DashboardWeekNav";
import {
  formatWeekParam,
  getWeekRangeMondayToMondayInTimeZone,
  parseWeekParam,
  weekLabelFromMondayYmd,
} from "@/lib/dates/weekRange";
import { getSquareClient } from "@/lib/square/client";
import { MILLIES_LOCATIONS } from "@/lib/locations/millies";
import { getLocationWeeklySummary } from "@/lib/square/weeklySummary";
import { computeRoyalties } from "@/lib/royalties/calc";
import { getLocationWeeklyDetail, LAWRENCEVILLE_LOCATION_ID } from "@/lib/square/locationDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dollars(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function LocationDashboardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { week?: string };
}) {
  const anchor = parseWeekParam(searchParams?.week) ?? new Date();

  const square = getSquareClient();
  const locRes = await square.locations.list();
  const locations: any[] = (locRes as any)?.data?.locations ?? [];
  const locationOptions = MILLIES_LOCATIONS.map((m) => ({ id: m.id, name: m.name }));

  const location = locations.find((l) => l?.id === params.id);
  if (!location) {
    // Allow navigation even if Square marks it inactive/unlisted; we still want the page to load.
    const fallback = MILLIES_LOCATIONS.find((m) => m.id === params.id);
    if (!fallback) notFound();
  }

  const reportTz =
    params.id === LAWRENCEVILLE_LOCATION_ID
      ? "America/New_York"
      : (location?.timezone ?? "America/New_York");
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, reportTz);
  const weekParam = formatWeekParam(range.weekStart);
  const prevWeekParam = formatWeekParam(addDays(range.weekStart, -7));
  const nextWeekParam = formatWeekParam(addDays(range.weekStart, 7));
  const detail = await getLocationWeeklyDetail(params.id, range, { timeZone: reportTz });
  const s = await getLocationWeeklySummary(params.id, range);
  // Net sales returned by getLocationWeeklyDetail already excludes delivery marketplaces,
  // so we do not subtract delivery again when computing the royalty base.
  const r = computeRoyalties(params.id, detail.netSales, {
    excludeDeliveryNetSales: 0,
    weekStartYmd: detail.weekStart,
    weekEndYmd: detail.weekEnd,
    techFeeCadence: "monthly",
  });
  const weekLabel = weekLabelFromMondayYmd(weekParam);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link className="text-sm font-semibold text-zinc-700 hover:underline" href="/dashboard">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {location?.name ?? MILLIES_LOCATIONS.find((m) => m.id === params.id)?.name ?? params.id}
          </h1>
          {r.configured ? (
            <p className="mt-1 text-sm text-zinc-700">{r.owner} • {r.entity}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-700">Not configured for royalties yet</p>
          )}
        </div>
        <DashboardWeekNav
          basePath={`/dashboard/location/${params.id}`}
          weekParam={weekParam}
          prevWeekParam={prevWeekParam}
          nextWeekParam={nextWeekParam}
          weekLabel={weekLabel}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Net sales</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{dollars(detail.netSales)}</div>
          <div className="mt-2 text-xs text-zinc-600">Orders {detail.ordersCount.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Royalty</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {r.configured && r.royaltyAmount != null ? dollars(r.royaltyAmount) : "—"}
          </div>
          <div className="mt-2 text-xs text-zinc-600">
            Rate {r.configured && r.royaltyRate != null ? `${(r.royaltyRate * 100).toFixed(2)}%` : "—"} • Tech fee{" "}
            {r.configured && r.techFee != null ? dollars(r.techFee) : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Total due</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {r.configured && r.totalDue != null ? dollars(r.totalDue) : "—"}
          </div>
          <div className="mt-2 text-xs text-zinc-600">Royalty base {r.configured && r.royaltyBase != null ? dollars(r.royaltyBase) : "—"}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Discounts / returns</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">
            {dollars(detail.discounts)} / {dollars(detail.refunds)}
          </div>
          <div className="mt-2 text-xs text-zinc-600">Delivery excluded: {dollars(detail.delivery.netSales)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Square metrics</h2>
          <p className="mt-1 text-xs text-zinc-600">For spot-checking against Square reports.</p>
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
          <div className="border-b border-zinc-200 p-5 sm:border-b-0 sm:border-r">
            <div className="text-xs font-medium text-zinc-600"># Orders</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{detail.ordersCount.toLocaleString()}</div>
            <div className="mt-4 text-xs font-medium text-zinc-600">Gross Sales</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.grossSales)}</div>
            <div className="mt-2 text-sm text-zinc-700">Discounts: {dollars(detail.discounts)}</div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-zinc-600">Net Sales</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.netSales)}</div>
            <div className="mt-2 text-sm text-zinc-700">Refunds: {dollars(detail.refunds)}</div>
            <div className="mt-2 text-sm text-zinc-700">Tax: {dollars(detail.tax)}</div>
            <div className="mt-2 text-sm text-zinc-700">Tips: {dollars(detail.tips)}</div>
            <div className="mt-2 text-sm text-zinc-700">Gift Card Sales: {dollars(detail.giftCardSales)}</div>
            <div className="mt-4 text-xs font-medium text-zinc-600">Total Sales</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.totalSales)}</div>
            <div className="mt-4 text-xs font-medium text-zinc-600">Collected</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.collected)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Gift card activity</h2>
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-3">
          <div className="p-5 sm:border-r sm:border-zinc-200">
            <div className="text-xs font-medium text-zinc-600">Sold (Deferred sales)</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.giftCardActivity.sold)}</div>
          </div>
          <div className="p-5 sm:border-r sm:border-zinc-200">
            <div className="text-xs font-medium text-zinc-600">Activated</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.giftCardActivity.activated)}</div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-zinc-600">Redeemed</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">{dollars(detail.giftCardActivity.redeemed)}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-0 border-t border-zinc-200 sm:grid-cols-2">
          <div className="p-5 sm:border-r sm:border-zinc-200">
            <div className="text-xs font-medium text-zinc-600">Commission (on sold)</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">
              {detail.giftCardActivity.commission != null ? dollars(detail.giftCardActivity.commission) : "—"}
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs font-medium text-zinc-600">Load fees (~2.5% of activated)</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900">
              {detail.giftCardActivity.loadFees != null ? dollars(detail.giftCardActivity.loadFees) : "—"}
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-600">
          Activated can differ from sold (e.g. donations). Commission is 5% of sold; load fee is 2.5% of sold (HQ gift-card workbook).
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700 shadow-sm">
        Spot-check tip: If numbers look off for a given week, open the debug endpoint for that store/week and we’ll align the calculation source (Orders vs Payments).
      </div>
    </main>
  );
}

