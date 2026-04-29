"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setLoading(false);
      setError(data?.error ?? "Login failed");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12">
            <Image src="/millies-cone.svg" alt="Millie's cone" fill priority />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
            <p className="mt-0.5 text-sm text-zinc-600">Admin access to the royalties dashboard.</p>
          </div>
        </div>

        <form className="mt-6 flex flex-col gap-3" onSubmit={onSubmit}>
          <label className="text-sm font-medium text-zinc-800">
            Email
            <input
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>
          <label className="text-sm font-medium text-zinc-800">
            Password
            <input
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <button
            className="mt-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

