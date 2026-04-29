import { Suspense } from "react";
import { LoginClient } from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
            <p className="mt-1 text-sm text-zinc-600">Loading…</p>
          </div>
        </main>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

