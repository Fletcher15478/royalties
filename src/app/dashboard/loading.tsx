export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-amber-900">Loading dashboard…</p>
        <p className="mt-1 text-sm text-zinc-600">
          Fetching week data from Square. This can take a moment when many locations are included.
        </p>
        <div className="mt-4 flex gap-2">
          <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-100" />
          <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["a", "b", "c", "d"].map((k) => (
          <div key={k} className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
        ))}
      </div>
      <div className="mt-8 h-64 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
    </main>
  );
}
