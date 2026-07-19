import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const WRITES_ENABLED =
  String(import.meta.env.VITE_ENABLE_SUPABASE_WRITES ?? "false") === "true";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  if (!url || !key) {
    throw new Error(
      "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  const isBrowser = typeof window !== "undefined";
  cached = createClient(url, key, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      storage: isBrowser ? window.localStorage : undefined,
    },
    global: {
      fetch: (input, init) => {
        // sb_publishable_* keys are opaque, not JWTs. Strip the default Bearer
        // header that supabase-js appends so PostgREST doesn't try to parse it.
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return cached;
}
