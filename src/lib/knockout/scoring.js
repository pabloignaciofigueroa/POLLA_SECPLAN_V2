// Puntaje de la llave eliminatoria - modulo ESM puro (sin DOM). Modo local.
//
// Tiers por cruce (excluyentes, gana el mayor):
//   marcador EXACTO unico (lone wolf) ... +5
//   marcador EXACTO compartido .......... +3
//   CLASIFICADO correcto (acertaste quien avanza, marcador no exacto) ... +1
//   error ............................... 0
// Reusa calculatePointsForPrediction (fuente unica del 5/3/1/0 de marcador) y solo
// reemplaza la "tendencia" por el "clasificado correcto" (semantica de eliminacion directa).
//
// Podio: +8 campeon / +5 subcampeon / +3 tercero / +1 cuarto, por acierto EXACTO de puesto.
import { calculatePointsForPrediction } from "../liveMatch/liveScoring.js";
import { normalizeResults, resultWinnerSide } from "./bracket.js";

// Puntaje de podio mundial (debe cuadrar con /reglas y la leyenda de /tabla): +8/+5/+3/+1.
export const PODIUM_POINTS = { champion: 8, runnerUp: 5, third: 3, fourth: 1 };

/**
 * Puntua un cruce para una prediccion.
 * @param {object} prediction              { homeScore, awayScore, advances }
 * @param {object} result                  { homeScore, awayScore, winner }
 * @param {Array}  allPredictionsForMatch  todas las predicciones del cruce (para lone wolf)
 * @returns {{ points:number, hitType:string }}
 */
export function scoreKnockoutMatch(prediction, result, allPredictionsForMatch = []) {
  if (!prediction || !result) return { points: 0, hitType: "none" };

  const base = calculatePointsForPrediction(
    { homeScore: prediction.homeScore, awayScore: prediction.awayScore },
    { homeScore: result.homeScore, awayScore: result.awayScore },
    allPredictionsForMatch.map((p) => ({ homeScore: p.homeScore, awayScore: p.awayScore })),
  );

  // Marcador exacto (unico o compartido): tier mayor.
  if (base.hitType === "lone_wolf" || base.hitType === "exact") {
    return { points: base.points, hitType: base.hitType };
  }

  // Marcador no exacto: +1 si acertaste quien clasifica.
  const actualSide = resultWinnerSide(result);
  if (actualSide && prediction.advances === actualSide) {
    return { points: 1, hitType: "qualifier" };
  }

  return { points: 0, hitType: "none" };
}

/**
 * Puntua el podio de un jugador contra el podio real.
 * @param {object} podium        { champion, runnerUp, third, fourth }
 * @param {object} actualPodium  idem (codes reales)
 */
export function scorePodium(podium = {}, actualPodium = {}) {
  let points = 0;
  const lines = [];
  for (const slot of ["champion", "runnerUp", "third", "fourth"]) {
    const pick = podium?.[slot] ?? null;
    const actual = actualPodium?.[slot] ?? null;
    const hit = Boolean(pick) && Boolean(actual) && pick === actual;
    const pts = hit ? PODIUM_POINTS[slot] : 0;
    points += pts;
    lines.push({ slot, pick, actual, hit, points: pts });
  }
  return { points, lines };
}

/**
 * Construye la tabla de posiciones de la polla de eliminatorias.
 * @param {object} args
 * @param {Array}  args.players              [{ id, name }]
 * @param {object} args.predictionsByPlayer  { [playerId]: { [matchId]: { homeScore, awayScore, advances } } }
 * @param {object} args.podiumByPlayer       { [playerId]: { champion, runnerUp, third, fourth } }
 * @param {Array|object} args.results        resultados oficiales
 * @param {object|null}  args.actualPodium   podio real derivado (o null si aun no hay final)
 * @returns {Array} filas ordenadas { position, playerId, name, total, matchPoints, podiumPoints, ... }
 */
export function buildKnockoutLeaderboard({
  players = [],
  predictionsByPlayer = {},
  podiumByPlayer = {},
  results = {},
  actualPodium = null,
} = {}) {
  const resultsMap = normalizeResults(results);

  // Todas las predicciones por cruce (necesario para el lone wolf).
  const predsByMatch = new Map();
  for (const [playerId, bucket] of Object.entries(predictionsByPlayer)) {
    for (const [matchId, pred] of Object.entries(bucket ?? {})) {
      if (!predsByMatch.has(matchId)) predsByMatch.set(matchId, []);
      predsByMatch.get(matchId).push({ playerId, ...pred });
    }
  }

  const rows = players.map((player) => {
    const bucket = predictionsByPlayer[player.id] ?? {};
    let matchPoints = 0;
    const matchLines = [];
    for (const [matchId, result] of Object.entries(resultsMap)) {
      // Marcador EN VIVO (jugándose): aún no suma puntos hasta que se finalice.
      if (result && result.status === "live") continue;
      const pred = bucket[matchId];
      if (!pred) continue;
      const all = predsByMatch.get(matchId) ?? [];
      const scored = scoreKnockoutMatch(pred, result, all);
      matchPoints += scored.points;
      matchLines.push({ matchId, ...scored });
    }
    const podiumScored = actualPodium
      ? scorePodium(podiumByPlayer[player.id] ?? {}, actualPodium)
      : { points: 0, lines: [] };

    return {
      playerId: player.id,
      name: player.name ?? player.id,
      total: matchPoints + podiumScored.points,
      matchPoints,
      podiumPoints: podiumScored.points,
      matchLines,
      podiumLines: podiumScored.lines,
    };
  });

  rows.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}
