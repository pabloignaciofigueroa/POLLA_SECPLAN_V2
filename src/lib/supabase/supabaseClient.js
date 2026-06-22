import { createClient } from "@supabase/supabase-js";

// import.meta.env.PUBLIC_* lo inyecta Vite en build (reemplazo estatico textual; el
// try/catch no cambia eso). El try lo vuelve seguro bajo Node (tests), donde
// import.meta.env no existe y acceder a .PUBLIC_* lanzaria.
let supabaseUrl = "";
let supabaseKey = "";
try {
  supabaseUrl = String(import.meta.env.PUBLIC_SUPABASE_URL ?? "").trim();
  supabaseKey = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
} catch {}

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
