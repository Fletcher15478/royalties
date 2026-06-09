export default function WeeklyPerformanceLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-amber-900">Loading weekly performance…</p>
        <p className="mt-1 text-sm text-zinc-600">
          Pulling Square order data for all locations. This can take a minute when comparing multiple weeks.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["a", "b", "c", "d"].map((k) => (
          <div key={k} className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
        ))}
      </div>
      <div className="mt-8 h-96 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
    </main>
  );
}
