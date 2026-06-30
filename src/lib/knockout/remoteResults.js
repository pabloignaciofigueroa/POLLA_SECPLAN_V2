// Conecta los RESULTADOS de Supabase a una sección (lectura): hace el pull inicial y se suscribe a
// realtime, llamando onResults(resultsArray) cada vez que cambian. Así la sección usa el SQL como
// fuente de verdad (igual que /tabla) y se ve igual en cualquier dispositivo.
//
// No-op si Supabase no está configurado (devuelve un unsubscribe vacío): la sección sigue 100% local
// con el seed + localStorage. Mismo patrón que ya usa tabla.knockout.client.js, extraído para reusar.
import { isSupabaseConfigured, fetchResults, subscribeKnockout } from "../supabase/knockoutData.js";

/**
 * @param {(results: Array) => void} onResults  recibe los resultados de Supabase (forma seedResults).
 * @returns {() => void} función para desuscribirse.
 */
export function attachRemoteResults(onResults) {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return () => {};
  let unsub = () => {};
  let dead = false;
  const pull = async () => {
    try {
      const res = await fetchResults();
      if (!dead && Array.isArray(res)) onResults(res);
    } catch {}
  };
  pull();
  // Realtime: re-pull en cada cambio de knockout_results (otro dispositivo carga/finaliza un partido).
  subscribeKnockout(() => { pull(); }).then((u) => {
    if (dead) { try { u(); } catch {} } else { unsub = u; }
  });
  return () => { dead = true; try { unsub(); } catch {} };
}
