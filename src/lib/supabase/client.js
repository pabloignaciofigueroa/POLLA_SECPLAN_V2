// Cliente ÚNICO de Supabase para el BROWSER (lectura pública con la publishable key).
// Gated por env: si no hay PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_PUBLISHABLE_KEY, devuelve
// null y la web sigue 100% local (lee los JSON commiteados). @supabase/supabase-js
// se carga DINÁMICAMENTE solo cuando está configurado, así no infla el bundle si está off.
// (Acepta el nombre legado PUBLIC_SUPABASE_ANON_KEY como fallback.)
const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE =
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE);

let clientPromise = null;
export function getSupabase() {
  if (!isSupabaseConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE, { auth: { persistSession: false } }),
      )
      .catch(() => null);
  }
  return clientPromise;
}
