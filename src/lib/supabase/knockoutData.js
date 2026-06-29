// Capa de datos de ELIMINATORIAS sobre Supabase (BROWSER, solo lectura).
// Devuelve los datos con la MISMA forma que los JSON commiteados, para que las
// secciones los usen como drop-in. Si Supabase no está configurado, los fetch
// devuelven null y el caller cae al dataset local.
import { getSupabase, isSupabaseConfigured } from "./client.js";

export { isSupabaseConfigured };

/**
 * Submissions con la forma del dataset knockout-predictions.json:
 * [{ playerId, predictions: { [matchId]: { homeScore, awayScore, advances } }, podium: {...} }]
 * @returns {Promise<Array|null>} null si Supabase no está configurado / falla.
 */
export async function fetchSubmissions() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const [{ data: preds, error: e1 }, { data: pods, error: e2 }] = await Promise.all([
    supabase.from("knockout_predictions").select("player_id,match_id,home_score,away_score,advances"),
    supabase.from("knockout_podium").select("player_id,champion,runner_up,third,fourth"),
  ]);
  if (e1 || e2) return null;

  const byPlayer = new Map();
  const ensure = (pid) => {
    if (!byPlayer.has(pid)) byPlayer.set(pid, { playerId: pid, predictions: {}, podium: {} });
    return byPlayer.get(pid);
  };
  for (const r of preds ?? []) {
    ensure(r.player_id).predictions[r.match_id] = {
      homeScore: r.home_score, awayScore: r.away_score, advances: r.advances,
    };
  }
  for (const r of pods ?? []) {
    ensure(r.player_id).podium = {
      champion: r.champion, runnerUp: r.runner_up, third: r.third, fourth: r.fourth,
    };
  }
  return Array.from(byPlayer.values());
}

/**
 * Resultados oficiales con la forma de seedResults:
 * [{ matchId, homeScore, awayScore, winner, status }]
 * @returns {Promise<Array|null>}
 */
export async function fetchResults() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("knockout_results")
    .select("match_id,home_score,away_score,winner,status");
  if (error) return null;
  return (data ?? []).map((r) => ({
    matchId: r.match_id, homeScore: r.home_score, awayScore: r.away_score,
    winner: r.winner, status: r.status,
  }));
}

/**
 * Realtime: llama callback cuando cambian predicciones/resultados/podio.
 * @returns {Promise<() => void>} función para desuscribirse (no-op si no hay Supabase).
 */
export async function subscribeKnockout(callback) {
  const supabase = await getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel("knockout-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "knockout_predictions" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "knockout_results" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "knockout_podium" }, callback)
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch {} };
}
