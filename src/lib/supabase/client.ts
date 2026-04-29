import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = requireSupabaseEnv();
  return createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

