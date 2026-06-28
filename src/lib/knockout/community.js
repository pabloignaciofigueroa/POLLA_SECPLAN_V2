// Estadisticas corales de la llave eliminatoria - modulo ESM puro (sin DOM). Modo local.
// Consenso por cruce (a quien hace avanzar la oficina + marcadores mas pronosticados) y
// perfil por jugador. Consume los cartones agregados (predictionsByPlayer).

/**
 * Consenso por cruce.
 * @param {object} predictionsByPlayer  { [playerId]: { [matchId]: { homeScore, awayScore, advances } } }
 * @param {string[]|null} matchIds       limitar a estos cruces (opcional)
 * @returns {object} { [matchId]: { total, advHome, advAway, lean, consensusPct, topScores:[{score,count}] } }
 */
export function buildMatchConsensus(predictionsByPlayer = {}, matchIds = null) {
  const allow = matchIds ? new Set(matchIds) : null;
  const acc = {};

  for (const bucket of Object.values(predictionsByPlayer)) {
    for (const [matchId, pred] of Object.entries(bucket ?? {})) {
      if (allow && !allow.has(matchId)) continue;
      if (!pred) continue;
      if (!acc[matchId]) acc[matchId] = { total: 0, advHome: 0, advAway: 0, scores: new Map() };
      const m = acc[matchId];
      m.total += 1;
      if (pred.advances === "home") m.advHome += 1;
      else if (pred.advances === "away") m.advAway += 1;
      if (pred.homeScore != null && pred.awayScore != null) {
        const key = `${pred.homeScore}-${pred.awayScore}`;
        m.scores.set(key, (m.scores.get(key) ?? 0) + 1);
      }
    }
  }

  const out = {};
  for (const [matchId, m] of Object.entries(acc)) {
    const topScores = [...m.scores.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => b.count - a.count || a.score.localeCompare(b.score))
      .slice(0, 3);
    const lean = m.advHome > m.advAway ? "home" : m.advAway > m.advHome ? "away" : "split";
    const consensusPct = m.total ? Math.round((100 * Math.max(m.advHome, m.advAway)) / m.total) : 0;
    out[matchId] = { total: m.total, advHome: m.advHome, advAway: m.advAway, lean, consensusPct, topScores };
  }
  return out;
}

/** Cuántos cartones hay cargados (jugadores con al menos un pronóstico). */
export function countCartones(predictionsByPlayer = {}) {
  return Object.values(predictionsByPlayer).filter((b) => b && Object.keys(b).length > 0).length;
}

/**
 * Perfil corto de un jugador: cuántos cruces pronosticó y su podio.
 * @param {object} bucket  { [matchId]: { homeScore, awayScore, advances } }
 * @param {object} podium  { champion, runnerUp, third, fourth }
 */
export function buildPlayerProfile(bucket = {}, podium = {}) {
  const entries = Object.values(bucket ?? {});
  const predicted = entries.filter((p) => p && p.homeScore != null && p.awayScore != null && (p.advances === "home" || p.advances === "away")).length;
  const podiumFilled = ["champion", "runnerUp", "third", "fourth"].filter((k) => podium?.[k]).length;
  return { predicted, podiumFilled };
}
