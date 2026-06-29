// Puntaje de la llave eliminatoria - modulo ESM puro (sin DOM). Modo local.
//
// PUNTAJE = BASE por marcador (excluyente) + BONUS PENALES (separado):
//   BASE (solo el MARCADOR de cancha; el campo "advances" NO interviene en la tendencia):
//     +5 EXACTO unico (lone wolf) / +3 EXACTO compartido / +1 TENDENCIA (misma direccion:
//     local gana / EMPATE / visita gana) / 0 error. El exacto NO suma ademas tendencia.
//   BONUS PENALES (+1): SOLO si el partido FINALIZO empatado en cancha, el jugador predijo
//     empate, y acerto el equipo que avanzo por penales. NUNCA en vivo. Maximo por cruce = 6.
//
// Podio: +5 campeon / +3 subcampeon / +1 tercero / +1 cuarto, por acierto EXACTO de puesto.
import { calculatePointsForPrediction } from "../liveMatch/liveScoring.js";
import { normalizeResults } from "./bracket.js";

/** Resultado del marcador: "home" | "draw" | "away" | null (marcador incompleto). */
function outcomeOf(homeScore, awayScore) {
  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
}

// Puntaje de podio mundial (debe cuadrar con /reglas y la leyenda de /tabla): +5/+3/+1/+1.
export const PODIUM_POINTS = { champion: 5, runnerUp: 3, third: 1, fourth: 1 };

/**
 * Puntua un cruce: BASE por marcador + BONUS PENALES. Devuelve los tres separados.
 * @param {object} prediction              { homeScore, awayScore, advances: "home"|"away" }
 * @param {object} result                  { homeScore, awayScore, winner: "home"|"away", status }
 * @param {Array}  allPredictionsForMatch  todas las predicciones del cruce (para lone wolf)
 * @returns {{ points:number, base:number, bonus:number, hitType:string }}
 */
export function scoreKnockoutMatch(prediction, result, allPredictionsForMatch = []) {
  if (!prediction || !result) return { points: 0, base: 0, bonus: 0, hitType: "none" };

  // ===== BASE: SOLO por el marcador de cancha (categorías excluyentes; "advances" NO interviene). =====
  const exact = calculatePointsForPrediction(
    { homeScore: prediction.homeScore, awayScore: prediction.awayScore },
    { homeScore: result.homeScore, awayScore: result.awayScore },
    allPredictionsForMatch.map((p) => ({ homeScore: p.homeScore, awayScore: p.awayScore })),
  );
  const predOutcome = outcomeOf(prediction.homeScore, prediction.awayScore);
  const finalOutcome = outcomeOf(result.homeScore, result.awayScore);
  let base = 0;
  let hitType = "none";
  if (exact.hitType === "lone_wolf" || exact.hitType === "exact") {
    base = exact.points; // +5 / +3 (el exacto ya incluye la tendencia; no se suma +1)
    hitType = exact.hitType;
  } else if (predOutcome !== null && predOutcome === finalOutcome) {
    base = 1; // TENDENCIA: misma dirección del marcador (incluye empate-vs-empate)
    hitType = "tendency";
  }

  // ===== BONUS PENALES (+1): SOLO partido FINALIZADO, empatado en cancha, el jugador predijo
  // empate, y acertó el equipo que avanzó por penales. NUNCA en vivo. =====
  const isFinal = result.status === "final" || result.status === "finished";
  const bonus =
    isFinal &&
    finalOutcome === "draw" &&
    predOutcome === "draw" &&
    prediction.advances &&
    result.winner &&
    prediction.advances === result.winner
      ? 1
      : 0;

  return { points: base + bonus, base, bonus, hitType };
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
      const pred = bucket[matchId];
      if (!pred) continue;
      const all = predsByMatch.get(matchId) ?? [];
      const scored = scoreKnockoutMatch(pred, result, all);
      // Marcador EN VIVO: suma PROVISIONAL (la gracia de la polla: cambia con cada gol).
      // Se marca `live` para que la UI lo muestre como tentativo hasta que se finalice.
      const live = Boolean(result && result.status === "live");
      matchPoints += scored.points;
      matchLines.push({ matchId, ...scored, live });
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
