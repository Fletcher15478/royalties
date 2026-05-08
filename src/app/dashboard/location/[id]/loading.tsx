export default function LocationDashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="h-6 w-20 animate-pulse rounded bg-zinc-100" />
      <div className="mt-2 h-9 w-64 max-w-full animate-pulse rounded bg-zinc-100" />
      <p className="mt-3 text-sm font-medium text-amber-900">Fetching location week…</p>
      <p className="mt-1 text-xs text-zinc-600">Square data is loading; the page will fill in shortly.</p>
      <div className="mt-4 flex gap-2">
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-zinc-100" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
        <div className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-50" />
      </div>
    </main>
  );
}
