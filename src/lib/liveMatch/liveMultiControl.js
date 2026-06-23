// Logica pura del control MULTI-marcador del Admin (DEFINICION SIMULTANEA, Stage 2).
//
// CONTRATO: dado el fixture + el snapshot del seam (liveMatches[] + officialResults),
// decide QUE controles de marcador mostrar y con que estado. NO toca el DOM ni Supabase:
// es testeable offline. La UI (liveMultiControl.client.js) consume estos modelos y la
// escritura va por setLiveScore/clearLiveScore/finalizeOfficialResult del seam (RPC).
//
// Reusa resolveActiveWindow (UNICA fuente de "que marcador vivo cuenta" + mapeo
// *TeamScore->*Score). NO reimplementa el gating de fase.

import { resolveActiveWindow } from "./activeWindow.js";

const fixtureMatchById = (fixture) => {
  const matches = Array.isArray(fixture) ? fixture : fixture?.matches ?? [];
  return new Map(matches.map((match) => [match.id, match]));
};

const teamSlim = (team) => ({
  id: team?.id ?? null,
  name: team?.name ?? team?.id ?? "",
  shortCode: team?.shortCode ?? "",
});

/**
 * Modelos de control a renderizar. Devuelve UN control por partido ACTIVO de la ventana
 * (live = editable/puntuando; official = hermano ya finalizado, mostrado read-only para
 * dar contexto del par). Agrupado por grupo y ordenado cronologicamente.
 *
 * @param {object} input
 * @param {{matches:object[]}|object[]} input.fixture
 * @param {object[]} [input.liveMatches]  payloads live del seam (liveMatches[]).
 * @param {object[]} [input.officialResults]  payloads oficiales.
 * @param {number}   [input.now]
 * @returns {{
 *   controls: object[],
 *   byGroup: Record<string, object[]>,
 *   liveControls: object[],
 *   isSimultaneous: boolean,
 *   liveCount: number,
 * }}
 */
export function buildLiveControlModels({
  fixture,
  liveMatches = [],
  officialResults = [],
  now = Date.now(),
}) {
  const window = resolveActiveWindow({
    fixture,
    official: officialResults,
    live: liveMatches,
    now,
  });
  const matchById = fixtureMatchById(fixture);

  const controls = window.matches.map((wm) => {
    const fixtureMatch = matchById.get(wm.matchId) ?? {};
    return {
      matchId: wm.matchId,
      groupId: wm.groupId,
      matchNumber: wm.matchNumber,
      displayNumber: wm.displayNumber || wm.matchNumber,
      dateUtc: wm.dateUtc,
      phase: wm.phase, // "live" | "official"
      editable: wm.phase === "live",
      homeScore: wm.homeScore ?? 0,
      awayScore: wm.awayScore ?? 0,
      homeTeam: teamSlim(fixtureMatch.homeTeam),
      awayTeam: teamSlim(fixtureMatch.awayTeam),
    };
  });

  const byGroup = {};
  for (const control of controls) {
    (byGroup[control.groupId] ??= []).push(control);
  }

  const liveControls = controls.filter((control) => control.editable);

  return {
    controls,
    byGroup,
    liveControls,
    isSimultaneous: window.isSimultaneous,
    liveCount: liveControls.length,
  };
}

/**
 * Payload para setLiveScore de UN control (upsert por match_id). Mismo shape que
 * buildState del control single, pero parametrizado por matchId (no singleton 'current').
 */
export function buildLiveScorePayload(control, { homeScore, awayScore, status = "live" } = {}) {
  if (!control || !control.matchId) {
    throw new Error("buildLiveScorePayload: falta el control/matchId.");
  }
  const h = clampScore(homeScore ?? control.homeScore);
  const a = clampScore(awayScore ?? control.awayScore);
  return {
    matchId: control.matchId,
    matchNumber: control.matchNumber,
    status,
    homeTeam: control.homeTeam.name,
    awayTeam: control.awayTeam.name,
    homeTeamId: control.homeTeam.id,
    awayTeamId: control.awayTeam.id,
    homeTeamShort: control.homeTeam.shortCode,
    awayTeamShort: control.awayTeam.shortCode,
    homeTeamScore: h,
    awayTeamScore: a,
    lastEvent: "Actualizacion manual desde Admin (multi)",
    updatedBy: "admin",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Payload del RESULTADO OFICIAL para finalizeOfficialResult de UN control (por matchId).
 * Finalizar uno NO toca el otro: la RPC polla_finalize_match limpia SOLO la fila live de
 * este match (delete where match_id = result.matchId) y, opcionalmente, setea el siguiente.
 */
export function buildFinalizeResult(control, { homeScore, awayScore } = {}) {
  if (!control || !control.matchId) {
    throw new Error("buildFinalizeResult: falta el control/matchId.");
  }
  return {
    matchId: control.matchId,
    matchNumber: control.matchNumber,
    homeTeamId: control.homeTeam.id,
    awayTeamId: control.awayTeam.id,
    homeTeam: control.homeTeam.name,
    awayTeam: control.awayTeam.name,
    homeTeamScore: clampScore(homeScore ?? control.homeScore),
    awayTeamScore: clampScore(awayScore ?? control.awayScore),
    finishedAt: new Date().toISOString(),
  };
}

function clampScore(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
