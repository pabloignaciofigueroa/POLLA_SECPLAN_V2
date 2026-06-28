// Libro contable derivado (DEFINICION SIMULTANEA, F3).
//
// REGLA DE ORO: el total NUNCA se guarda; se reconstruye sumando lineas.
//   total oficial    = suma de lineas 'final'
//   total proyectado = suma de lineas 'final' + 'provisional'   ('anulado' aporta 0)
//
// Funcion pura de (resultado efectivo) x (prediccion bloqueada) x (reglas) +
// (bonos de clasificacion F4). El gating de fase y el mapeo *TeamScore->*Score ocurren
// UNA sola vez en F1 (resolveActiveWindow); este builder consume esa salida (addendum
// A4): nunca re-filtra payloads crudos. Reusa calculatePointsForPrediction (fuente
// unica de puntaje de partido) y buildGroupBonuses (F4) para las lineas de grupo.

import { calculatePointsForPrediction } from "../liveMatch/liveScoring.js";
import { resolveActiveWindow, resolveEffectiveResults } from "../liveMatch/activeWindow.js";

/** @typedef {import('./types').PointLedgerLine} PointLedgerLine */

// hitType de liveScoring -> regla del libro (la comanda usa exact_shared para 'exact').
const HITTYPE_TO_REGLA = {
  lone_wolf: "lone_wolf",
  exact: "exact_shared",
  tendency: "tendency",
  none: "none",
  no_info: "none",
};

const toMatches = (fixture) => (Array.isArray(fixture) ? fixture : fixture?.matches ?? []);

const emptyAgg = () => ({
  official: 0,
  projected: 0,
  match: { official: 0, projected: 0 },
  group: { official: 0, projected: 0 },
  lines: [],
});

// Reapertura: una key invalidada emite una linea 'anulado' (0, auditoria) ADEMAS de la
// recomputada. El proyectado solo refleja la fresca (anulado aporta 0). Sin duplicar.
function pushWithInvalidation(lines, line, invalid) {
  if (invalid.has(line.key)) {
    lines.push({ ...line, estado: "anulado", puntos: 0, key: `${line.key}:anulado` });
  }
  lines.push(line);
}

/**
 * @param {object} input
 * @param {object[]} input.players               [{id,...}]
 * @param {object[]} input.predictions           [{playerId,matchId,groupId,homeScore,awayScore}]
 * @param {object[]} input.qualifiedPredictions  [{playerId,groupId,position:1|2,teamId}]
 * @param {object[]} input.groups                groups.json
 * @param {any}      input.fixture               fixture completo
 * @param {object[]} [input.official]            payloads oficiales (todo el torneo)
 * @param {object[]} [input.live]                payloads live crudos del seam (se gatean por F1)
 * @param {import('../liveMatch/types').ActiveWindow|null} [input.window]  ventana ya resuelta (opcional)
 * @param {Record<string,object>} [input.closuresByGroup]
 * @param {Iterable<string>|null} [input.invalidatedKeys]  keys a anular (reapertura)
 * @param {number}   [input.now]
 * @returns {{ lines: PointLedgerLine[], byPlayer: Record<string, object> }}
 */
export function buildPointLedger({
  players = [],
  predictions = [],
  qualifiedPredictions = [],
  groups = [],
  fixture,
  official = [],
  live = [],
  window = null,
  closuresByGroup = {},
  invalidatedKeys = null,
  now = Date.now(),
}) {
  const matches = toMatches(fixture);
  const activeWindow = window ?? resolveActiveWindow({ fixture: matches, official, live, now });
  const { byMatch } = resolveEffectiveResults({ official, window: activeWindow });

  const invalid = invalidatedKeys instanceof Set ? invalidatedKeys : new Set(invalidatedKeys ?? []);

  // predicciones por partido (para lone-wolf: necesita TODAS las de ese partido).
  const predsByMatch = new Map();
  for (const pred of predictions) {
    if (!pred?.matchId) continue;
    let arr = predsByMatch.get(pred.matchId);
    if (!arr) {
      arr = [];
      predsByMatch.set(pred.matchId, arr);
    }
    arr.push(pred);
  }

  const lines = [];

  // --- Lineas de PARTIDO ---
  for (const [matchId, result] of byMatch) {
    const allForMatch = predsByMatch.get(matchId);
    if (!allForMatch || !allForMatch.length) continue;
    const estado = result.official ? "final" : "provisional";
    const allScores = allForMatch.map((p) => ({ homeScore: p.homeScore, awayScore: p.awayScore }));
    for (const pred of allForMatch) {
      const { points, hitType } = calculatePointsForPrediction(
        { homeScore: pred.homeScore, awayScore: pred.awayScore },
        { homeScore: result.homeScore, awayScore: result.awayScore },
        allScores
      );
      pushWithInvalidation(
        lines,
        {
          playerId: pred.playerId,
          origen: "match",
          evento: matchId,
          regla: HITTYPE_TO_REGLA[hitType] ?? "none",
          puntos: points,
          estado,
          group: pred.groupId ?? null,
          groupState: null,
          ts: result.ts ?? null,
          key: `match:${matchId}:${pred.playerId}`,
        },
        invalid
      );
    }
  }

  // NOTA (V2 eliminatorias): las lineas de bono de GRUPO (clasificados 1o/2o) fueron
  // eliminadas junto con la fase de grupos. El puntaje de eliminatorias (partido + podio)
  // se definira en la fase B reusando calculatePointsForPrediction.

  // --- Agregacion (totales reconstruidos) ---
  const byPlayer = {};
  for (const player of players) byPlayer[player.id] = emptyAgg();

  for (const line of lines) {
    const agg = (byPlayer[line.playerId] ??= emptyAgg());
    agg.lines.push(line);
    if (line.estado === "anulado") continue;
    const isFinal = line.estado === "final";
    agg.projected += line.puntos;
    if (isFinal) agg.official += line.puntos;
    const bucket = line.origen === "group" ? agg.group : agg.match;
    bucket.projected += line.puntos;
    if (isFinal) bucket.official += line.puntos;
  }

  return { lines, byPlayer };
}
