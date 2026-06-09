"use client";

import Link from "next/link";

export default function WeeklyPerformanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-red-900">Could not load weekly performance</h1>
        <p className="mt-2 text-sm text-red-800">
          Square data took too long or failed to load. This page pulls several weeks of orders across all locations,
          so it can time out on a slow connection or during heavy Square API load.
        </p>
        {error.message ? (
          <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-red-900">{error.message}</p>
        ) : null}
        {error.digest ? <p className="mt-2 text-xs text-red-700">Digest: {error.digest}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-red-900 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
          >
            Back to royalties
          </Link>
        </div>
      </div>
    </main>
  );
}
