import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseKey = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

let client = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return client;
}
