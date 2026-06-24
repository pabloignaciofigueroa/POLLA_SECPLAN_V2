// Ventana de DISPLAY de /tabla (DEFINICION SIMULTANEA, presentacional).
//
// A diferencia de resolveActiveWindow (F1), que SOLO incluye lo VIVO para fines de PUNTAJE,
// esta resuelve que partidos PRESENTAR en el hero cuando hay una ventana simultanea: el
// conjunto de partidos que arrancan a la MISMA hora (mismo dateUtc) que el partido actual que
// el hero ya resolvio, agrupados por groupId. Incluye los PREPARADOS (pending) para comunicar
// "se juegan dos a la vez" desde antes del pitazo. NO puntua nada: el ranking sigue saliendo
// de buildPointLedger (cero formula nueva aqui). El gating de fase lo decide resolveLiveMatchPhase.

import { resolveLiveMatchPhase } from "../liveMatch/liveMatchPhase.js";

const toMatches = (fixture) => (Array.isArray(fixture) ? fixture : fixture?.matches ?? []);

const readScores = (payload) => {
  const h = Number(payload?.homeScore ?? payload?.homeTeamScore);
  const a = Number(payload?.awayScore ?? payload?.awayTeamScore);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return null;
  return { home: h, away: a };
};

function buildDisplayMatch(fixtureMatch, { officialById, liveById, official, now }) {
  const off = officialById.get(fixtureMatch.id);
  const livePayload = liveById.get(fixtureMatch.id) ?? null;
  let phase = "pending";
  let scores = null;
  if (off) {
    phase = "official";
    scores = readScores(off);
  } else {
    phase =
      resolveLiveMatchPhase({
        liveMatch: livePayload
          ? {
              ...livePayload,
              homeTeamScore: livePayload.homeTeamScore ?? livePayload.homeScore,
              awayTeamScore: livePayload.awayTeamScore ?? livePayload.awayScore,
            }
          : null,
        fixtureMatch,
        officialResults: official,
        now,
      }) ?? "pending";
    if (phase === "live") scores = readScores(livePayload);
  }
  return {
    matchId: fixtureMatch.id,
    groupId: fixtureMatch.groupId,
    matchNumber: fixtureMatch.matchNumber ?? 0,
    dateUtc: fixtureMatch.dateUtc ?? null,
    location: fixtureMatch.location ?? "",
    phase, // "official" | "live" | "pending"
    homeScore: scores ? scores.home : null,
    awayScore: scores ? scores.away : null,
    homeTeam: fixtureMatch.homeTeam ?? null,
    awayTeam: fixtureMatch.awayTeam ?? null,
  };
}

/**
 * @param {object} input
 * @param {{matches:object[]}|object[]} input.fixture
 * @param {object[]} [input.official]   payloads oficiales (*TeamScore)
 * @param {object[]} [input.live]       payloads vivos del seam (liveMatches[])
 * @param {string|null} [input.anchorMatchId]  matchId que el hero ya resolvio como actual
 * @param {number} [input.now]
 * @returns {{ isSimultaneous:boolean, anchorGroupId:string|null, groupIds:string[],
 *            byGroup:Record<string,object[]>, matches:object[] }}
 */
export function resolveDisplayWindow({
  fixture,
  official = [],
  live = [],
  anchorMatchId = null,
  now = Date.now(),
}) {
  const empty = { isSimultaneous: false, anchorGroupId: null, groupIds: [], byGroup: {}, matches: [] };
  const matches = toMatches(fixture);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const anchor = anchorMatchId ? byId.get(anchorMatchId) : null;
  if (!anchor || !anchor.dateUtc) return empty;

  const officialById = new Map();
  for (const r of official) if (r?.matchId) officialById.set(r.matchId, r);
  const liveById = new Map();
  for (const p of live) if (p?.matchId) liveById.set(p.matchId, p);

  // La ventana = los partidos que arrancan a la MISMA hora que el actual (la pareja/grupo de
  // la 3a fecha que se juega a la vez). Orden determinista por matchNumber.
  const windowMatches = matches
    .filter((m) => m.dateUtc === anchor.dateUtc)
    .sort((a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0));

  if (windowMatches.length < 2) return empty; // N<=1 -> modo normal (cero regresion)

  const out = windowMatches.map((m) => buildDisplayMatch(m, { officialById, liveById, official, now }));
  const byGroup = {};
  for (const dm of out) (byGroup[dm.groupId] ??= []).push(dm);

  return {
    isSimultaneous: true,
    anchorGroupId: anchor.groupId,
    groupIds: Object.keys(byGroup),
    byGroup,
    matches: out,
  };
}

/**
 * Impacto PROVISIONAL (en vivo) de la ventana para UN jugador, desde sus lineas del ledger.
 * Suma SOLO lineas `provisional` de los dos partidos del par + el bono `provisional` del grupo
 * ancla. NO incluye lo banqueado `final` (eso ya esta en el ranking oficial). Asi el headline
 * "Pts en vivo" cuadra EXACTO con el desglose A/B/CLAS y representa el impacto de ESTA ventana
 * (no el total del jugador), como pide la comanda. Cero formula nueva: solo agrega lo del libro.
 *
 * @param {object[]} lines  ledger.byPlayer[id].lines
 * @param {{ matchAId?:string|null, matchBId?:string|null, groupId?:string|null }} win
 * @returns {{ a:number, b:number, clas:number, total:number }}
 */
export function windowImpactForPlayer(lines = [], { matchAId = null, matchBId = null, groupId = null } = {}) {
  const provMatch = (matchId) =>
    !matchId
      ? 0
      : lines
          .filter((l) => l.origen === "match" && l.evento === matchId && l.estado === "provisional")
          .reduce((s, l) => s + (Number(l.puntos) || 0), 0);
  const a = provMatch(matchAId);
  const b = provMatch(matchBId);
  const clas = lines
    .filter((l) => l.origen === "group" && l.group === groupId && l.estado === "provisional")
    .reduce((s, l) => s + (Number(l.puntos) || 0), 0);
  return { a, b, clas, total: a + b + clas };
}
