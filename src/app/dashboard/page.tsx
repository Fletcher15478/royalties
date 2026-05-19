import Link from "next/link";
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
import { loadLocationRoyaltyBundle } from "@/lib/royalties/locationBundle";
import { readSessionFromCookies } from "@/lib/auth/session";
import { displayNameForEmail } from "@/lib/auth/displayName";

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
  const session = await readSessionFromCookies();
  const displayName = displayNameForEmail(session?.email);
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
  const bundles: Awaited<ReturnType<typeof loadLocationRoyaltyBundle>>[] = [];
  for (const l of includedLocations) {
    bundles.push(
      await loadLocationRoyaltyBundle({
        locationId: l.id,
        range,
        timeZone: "America/New_York",
      })
    );
  }

  const totalCombinedNet = bundles.reduce((sum, b) => sum + b.combinedNetSales, 0);
  const totalInStoreNet = bundles.reduce((sum, b) => sum + b.inStoreNetSales, 0);
  const totalDeliveryNet = bundles.reduce((sum, b) => sum + b.deliveryNetSales, 0);
  const totalGross = bundles.reduce((sum, b) => sum + b.detail.grossSales, 0);
  const totalDiscounts = bundles.reduce((sum, b) => sum + b.detail.discounts, 0);
  const totalReturns = bundles.reduce((sum, b) => sum + b.detail.refunds, 0);
  const totalOrders = bundles.reduce((sum, b) => sum + b.detail.ordersCount, 0);
  const totalPlatformFees = bundles.reduce((sum, b) => sum + b.delivery.platformFees, 0);
  const totalRoyalty = bundles.reduce((sum, b) => sum + (b.royalty.royaltyAmount ?? 0), 0);
  const totalTechFees = bundles.reduce((sum, b) => sum + (b.royalty.techFee ?? 0), 0);
  const totalDue = bundles.reduce((sum, b) => sum + (b.royalty.totalDue ?? 0), 0);

  const weekLabel = weekLabelFromMondayYmd(weekParam);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Millie’s Royalties</h1>
          <p className="text-sm text-zinc-700">
            {displayName ? `Welcome ${displayName}. ` : ""}Monday 12:00am → Sunday 11:59pm (reporting week)
          </p>
        </div>
        <DashboardWeekNav
          basePath="/dashboard"
          weekParam={weekParam}
          prevWeekParam={prevWeekParam}
          nextWeekParam={nextWeekParam}
          weekLabel={weekLabel}
          showWeeklyDownload
        />
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
          <div className="text-sm font-medium text-zinc-700">Combined net sales</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900">{dollars(totalCombinedNet)}</div>
          <div className="mt-2 text-xs text-zinc-600">
            In-store {dollars(totalInStoreNet)} • Delivery {dollars(totalDeliveryNet)}
            {totalPlatformFees > 0 ? ` • Platform fees ${dollars(totalPlatformFees)}` : ""}
          </div>
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
            Royalties on combined in-store + delivery net. Delivery net deducts platform fees, marketing promos, returns, and refunds.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-700">
              <tr>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Combined net</th>
                <th className="px-5 py-3 font-medium">Delivery net</th>
                <th className="px-5 py-3 font-medium">Rate</th>
                <th className="px-5 py-3 font-medium">Royalty</th>
                <th className="px-5 py-3 font-medium">Tech fee</th>
                <th className="px-5 py-3 font-medium">Total due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {bundles
                .sort((a, b) => b.combinedNetSales - a.combinedNetSales)
                .map((b) => {
                  const loc = milliesSquareLocations.find((l) => String(l.id) === b.detail.locationId);
                  const r = b.royalty;
                  return (
                    <tr key={b.detail.locationId} className="hover:bg-zinc-50">
                      <td className="px-5 py-3">
                        <Link
                          className="font-semibold text-zinc-900 hover:underline"
                          href={`/dashboard/location/${b.detail.locationId}?week=${b.detail.weekStart}`}
                        >
                          {loc?.name ?? b.detail.locationId}
                        </Link>
                        {r.configured ? (
                          <div className="mt-0.5 text-xs text-zinc-600">{r.owner} • {r.entity}</div>
                        ) : (
                          <div className="mt-0.5 text-xs text-zinc-600">Not configured for royalties yet</div>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-medium text-zinc-900">{dollars(b.combinedNetSales)}</td>
                      <td className="px-5 py-3 tabular-nums text-zinc-800">
                        {b.delivery.orderCount > 0 ? (
                          <>
                            {dollars(b.deliveryNetSales)}
                            <div className="mt-0.5 text-[11px] text-zinc-500">
                              {b.delivery.orderCount} orders
                              {b.delivery.platformFees > 0 ? ` • fees ${dollars(b.delivery.platformFees)}` : ""}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
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

