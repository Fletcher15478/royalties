import Link from "next/link";
import { addDays, format } from "date-fns";
import { DashboardControls } from "@/components/DashboardControls";
import {
  formatWeekParam,
  getWeekRangeMondayToMondayInTimeZone,
  parseWeekParam,
} from "@/lib/dates/weekRange";
import { getSquareClient } from "@/lib/square/client";
import { MILLIES_LOCATIONS } from "@/lib/locations/millies";
import { computeRoyalties } from "@/lib/royalties/calc";
import { getLocationWeeklyDetail } from "@/lib/square/locationDetail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dollars(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const anchor = parseWeekParam(searchParams?.week) ?? new Date();
  const range = getWeekRangeMondayToMondayInTimeZone(anchor, "America/New_York");
  const weekParam = formatWeekParam(range.weekStart);
  const prevWeekParam = formatWeekParam(addDays(range.weekStart, -7));
  const nextWeekParam = formatWeekParam(addDays(range.weekStart, 7));

  const square = getSquareClient();
  const locRes = await square.locations.list();
  const locations: any[] = (locRes as any)?.data?.locations ?? [];

  const includedLocations = MILLIES_LOCATIONS.filter((l) => l.includeInRoyaltiesDashboard !== false);
  const squareById = new Map<string, any>(locations.map((l) => [String(l.id), l]));
  const milliesSquareLocations = includedLocations.map((m) => squareById.get(m.id) ?? { id: m.id, name: m.name, status: "UNKNOWN" });
  const locationOptions = includedLocations.map((m) => ({ id: m.id, name: m.name }));

  // Avoid hammering Square with a fully-parallel fanout (can cause 429s/timeouts and blank the page).
  const details: Awaited<ReturnType<typeof getLocationWeeklyDetail>>[] = [];
  for (const l of includedLocations) {
    details.push(await getLocationWeeklyDetail(l.id, range, { timeZone: "America/New_York" }));
  }

  const totalNet = details.reduce((sum, s) => sum + s.netSales, 0);
  const totalGross = details.reduce((sum, s) => sum + s.grossSales, 0);
  const totalDiscounts = details.reduce((sum, s) => sum + s.discounts, 0);
  const totalReturns = details.reduce((sum, s) => sum + s.refunds, 0);
  const totalOrders = details.reduce((sum, s) => sum + s.ordersCount, 0);
  const totalRoyalty = details.reduce(
    (sum, s) =>
      sum +
      (computeRoyalties(s.locationId, s.netSales, {
        excludeDeliveryNetSales: 0,
        weekStartYmd: s.weekStart,
        weekEndYmd: s.weekEnd,
        techFeeCadence: "monthly",
      }).royaltyAmount ?? 0),
    0
  );
  const totalTechFees = details.reduce(
    (sum, s) =>
      sum +
      (computeRoyalties(s.locationId, s.netSales, {
        excludeDeliveryNetSales: 0,
        weekStartYmd: s.weekStart,
        weekEndYmd: s.weekEnd,
        techFeeCadence: "monthly",
      }).techFee ?? 0),
    0
  );
  const totalDue = details.reduce(
    (sum, s) =>
      sum +
      (computeRoyalties(s.locationId, s.netSales, {
        excludeDeliveryNetSales: 0,
        weekStartYmd: s.weekStart,
        weekEndYmd: s.weekEnd,
        techFeeCadence: "monthly",
      }).totalDue ?? 0),
    0
  );

  const weekLabel = `${format(range.weekStart, "MMM d")} – ${format(addDays(range.weekEnd, -1), "MMM d, yyyy")}`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Millie’s Royalties</h1>
          <p className="text-sm text-zinc-700">Monday 12:00am → Sunday 11:59pm (reporting week)</p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
              href={`/dashboard?week=${prevWeekParam}`}
            >
              ← Prev week
            </Link>
            <Link
              className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
              href={`/dashboard?week=${nextWeekParam}`}
            >
              Next week →
            </Link>
            <a
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              href={`/api/reports/weekly?week=${weekParam}`}
            >
              Download this week&apos;s report
            </a>
          </div>
          <DashboardControls
            weekStart={weekParam}
            weekLabel={weekLabel}
          />
        </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Total due</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{dollars(totalDue)}</div>
          <div className="mt-2 text-xs text-zinc-600">
            Royalty {dollars(totalRoyalty)} + Tech fees {dollars(totalTechFees)}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Net sales</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{dollars(totalNet)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Discounts</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{dollars(totalDiscounts)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-zinc-700">Orders</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{totalOrders.toLocaleString()}</div>
          <div className="mt-2 text-xs text-zinc-600">Gross {dollars(totalGross)} • Returns {dollars(totalReturns)}</div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Locations</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Net Sales = Gross − Discounts − Returns. Royalties = Net Sales × rate. Total Due = Royalties + tech fee.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Net sales</th>
                <th className="px-5 py-3 font-medium">Rate</th>
                <th className="px-5 py-3 font-medium">Royalty</th>
                <th className="px-5 py-3 font-medium">Tech fee</th>
                <th className="px-5 py-3 font-medium">Total due</th>
                <th className="px-5 py-3 font-medium">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {details
                .sort((a, b) => b.netSales - a.netSales)
                .map((s) => {
                  const loc = milliesSquareLocations.find((l) => String(l.id) === s.locationId);
                  const r = computeRoyalties(s.locationId, s.netSales, {
                    excludeDeliveryNetSales: 0,
                    weekStartYmd: s.weekStart,
                    weekEndYmd: s.weekEnd,
                    techFeeCadence: "monthly",
                  });
                  return (
                    <tr key={s.locationId} className="hover:bg-zinc-50">
                      <td className="px-5 py-3">
                        <Link
                          className="font-semibold text-zinc-900 hover:underline"
                          href={`/dashboard/location/${s.locationId}?week=${s.weekStart}`}
                        >
                          {loc?.name ?? s.locationId}
                        </Link>
                        {r.configured ? (
                          <div className="mt-0.5 text-xs text-zinc-600">{r.owner} • {r.entity}</div>
                        ) : (
                          <div className="mt-0.5 text-xs text-zinc-600">Not configured for royalties yet</div>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-medium text-zinc-900">{dollars(s.netSales)}</td>
                      <td className="px-5 py-3 tabular-nums text-zinc-800">
                        {r.configured && r.royaltyRate != null ? `${(r.royaltyRate * 100).toFixed(2)}%` : "—"}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-zinc-900">
                        {r.configured && r.royaltyAmount != null ? dollars(r.royaltyAmount) : "—"}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-zinc-900">
                        {r.configured && r.techFee != null ? dollars(r.techFee) : "—"}
                        {r.configured && r.techFeeAssessed === false ? (
                          <div className="mt-0.5 text-[11px] text-zinc-500">assessed monthly</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-zinc-900">
                        {r.configured && r.totalDue != null ? dollars(r.totalDue) : "—"}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-zinc-800">{s.ordersCount.toLocaleString()}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

