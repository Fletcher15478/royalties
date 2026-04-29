import { createClient } from "@supabase/supabase-js";
import { env, requireSupabaseEnv } from "@/lib/env";

// Server-side only: bypasses RLS. Never import into client components.
const supabaseEnv = requireSupabaseEnv();
export const supabaseAdmin = createClient(supabaseEnv.SUPABASE_URL, supabaseEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

