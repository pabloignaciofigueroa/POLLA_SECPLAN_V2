// Ventana activa 1..N por grupo (DEFINICION SIMULTANEA, F1).
//
// Reemplaza, para FINES DE PUNTAJE, la logica de reloj de getRelevantMatches por una
// ventana basada en estado REAL (lo que el Admin puso vivo / lo que ya es oficial).
// getRelevantMatches sigue existiendo para la card "hero" de /proximo-partido.
//
// CONTRATO CLAVE (addendum A4): este modulo es el UNICO lugar que decide "que
// marcadores vivos cuentan" (gating de fase) y que mapea *TeamScore -> *Score. F2/F3/F4
// consumen su salida (la ventana y resolveEffectiveResults), nunca el payload crudo+now.

import { resolveLiveMatchPhase } from "./liveMatchPhase.js";
import { buildMatchSequence } from "../fixture/matchSequence.js";

/** @typedef {import('./types').ActiveWindow} ActiveWindow */
/** @typedef {import('./types').ActiveWindowMatch} ActiveWindowMatch */
/** @typedef {import('./types').EffectiveResult} EffectiveResult */

const readScores = (payload) => {
  const home = payload?.homeScore ?? payload?.homeTeamScore;
  const away = payload?.awayScore ?? payload?.awayTeamScore;
  const h = Number(home);
  const a = Number(away);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return null;
  return { homeScore: h, awayScore: a };
};

const readTs = (payload) => {
  const raw = payload?.finishedAt ?? payload?.updatedAt ?? null;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
};

const toMatches = (fixture) => (Array.isArray(fixture) ? fixture : fixture?.matches ?? []);

function buildWindowMatch(fixtureMatch, sequence, phase, scores, ts) {
  return {
    matchId: fixtureMatch.id,
    groupId: fixtureMatch.groupId,
    displayNumber: sequence.get(fixtureMatch.id) ?? 0,
    matchNumber: fixtureMatch.matchNumber ?? 0,
    dateUtc: fixtureMatch.dateUtc ?? null,
    phase,
    homeScore: scores ? scores.homeScore : null,
    awayScore: scores ? scores.awayScore : null,
    homeTeamId: fixtureMatch.homeTeam?.id ?? null,
    awayTeamId: fixtureMatch.awayTeam?.id ?? null,
    ts,
  };
}

/**
 * @param {object} input
 * @param {{matches:object[]}|object[]} input.fixture  fixture completo.
 * @param {object[]} [input.official]  payloads de polla_official_results (*TeamScore/*Score).
 * @param {object[]} [input.live]      payloads live (*TeamScore) del seam (liveMatches[]).
 * @param {number}   [input.now]       epoch ms inyectable (tests).
 * @returns {ActiveWindow}
 */
export function resolveActiveWindow({ fixture, official = [], live = [], now = Date.now() }) {
  const matches = toMatches(fixture);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const sequence = buildMatchSequence(matches);
  const officialById = new Map();
  for (const result of official) {
    if (result?.matchId) officialById.set(result.matchId, result);
  }

  // 1) Live gateado por fase (unica fuente de "que cuenta" + mapeo *TeamScore->*Score).
  const activeById = new Map();
  for (const payload of live) {
    const matchId = payload?.matchId;
    if (!matchId) continue;
    const fixtureMatch = matchById.get(matchId);
    if (!fixtureMatch) continue;
    const phase = resolveLiveMatchPhase({
      liveMatch: payload,
      fixtureMatch,
      officialResults: official,
      now,
    });
    if (phase !== "live") continue;
    activeById.set(
      matchId,
      buildWindowMatch(fixtureMatch, sequence, "live", readScores(payload), readTs(payload))
    );
  }

  // 2) Grupos con >=1 partido live.
  const liveGroups = new Set(Array.from(activeById.values()).map((match) => match.groupId));

  // 3) Activos = live + hermanos OFICIALES en esos grupos (para mostrar el par completo).
  if (liveGroups.size) {
    for (const fixtureMatch of matches) {
      if (!liveGroups.has(fixtureMatch.groupId)) continue;
      if (activeById.has(fixtureMatch.id)) continue;
      const off = officialById.get(fixtureMatch.id);
      if (!off) continue;
      activeById.set(
        fixtureMatch.id,
        buildWindowMatch(fixtureMatch, sequence, "official", readScores(off), readTs(off))
      );
    }
  }

  const activeMatches = Array.from(activeById.values()).sort(
    (a, b) =>
      Date.parse(a.dateUtc ?? "") - Date.parse(b.dateUtc ?? "") ||
      a.displayNumber - b.displayNumber
  );

  const byGroup = {};
  for (const match of activeMatches) {
    (byGroup[match.groupId] ??= []).push(match);
  }

  let isSimultaneous = false;
  for (const groupId of Object.keys(byGroup)) {
    const liveInGroup = byGroup[groupId].filter((match) => match.phase === "live").length;
    if (liveInGroup >= 2) {
      isSimultaneous = true;
      break;
    }
  }

  return { matches: activeMatches, byGroup, isSimultaneous };
}

/**
 * Resultados EFECTIVOS por partido (oficial pisa live). Fuente unica de marcadores
 * para los builders (F3). Toma TODOS los oficiales del torneo + los live de la ventana.
 *
 * @param {object} input
 * @param {object[]} [input.official]  payloads oficiales (todo el torneo).
 * @param {ActiveWindow|null} [input.window]  salida de resolveActiveWindow (ya gateada).
 * @returns {{ byMatch: Map<string, EffectiveResult> }}
 */
export function resolveEffectiveResults({ official = [], window = null }) {
  const byMatch = new Map();
  for (const result of official) {
    if (!result?.matchId) continue;
    const scores = readScores(result);
    if (!scores) continue;
    byMatch.set(result.matchId, {
      matchId: result.matchId,
      homeScore: scores.homeScore,
      awayScore: scores.awayScore,
      official: true,
      ts: readTs(result),
    });
  }
  for (const match of window?.matches ?? []) {
    if (match.phase !== "live") continue;
    if (match.homeScore === null || match.awayScore === null) continue;
    if (byMatch.has(match.matchId)) continue; // oficial pisa live
    byMatch.set(match.matchId, {
      matchId: match.matchId,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      official: false,
      ts: match.ts ?? null,
    });
  }
  return { byMatch };
}
