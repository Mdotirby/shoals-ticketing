import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client — used for auth in client components
// Uses the anon key (safe for browser) with auth auto-refresh
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (_client) return _client;

  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );

  return _client;
}
