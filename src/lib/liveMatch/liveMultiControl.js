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
import { resolveCurrentMatch } from "./liveMatchState.js";

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

const readControlScores = (payload) => {
  const home = Number(payload?.homeScore ?? payload?.homeTeamScore);
  const away = Number(payload?.awayScore ?? payload?.awayTeamScore);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) return null;
  return { home, away };
};

/**
 * Ventana de control del ADMIN para DEFINICION SIMULTANEA (bootstrap).
 *
 * A diferencia de buildLiveControlModels (que SOLO ve lo que YA esta vivo y por eso no puede
 * ARRANCAR el segundo partido), esta resuelve el PAR SIMULTANEO ACTUAL desde el FIXTURE: el
 * partido "actual" (misma definicion que el control single del hero, via resolveCurrentMatch,
 * para que dual y single NUNCA divergan) + sus hermanos del mismo grupo a la misma hora (los
 * dos finales de la 3a fecha). Permite poner en vivo ambos desde cero.
 *
 * NO toca resolveActiveWindow (el scoring publico sigue contando SOLO lo vivo y gateado).
 *
 * controls[].phase:
 *   - "live"     status live -> editable, puntua (en vivo).
 *   - "ready"    preparable (aun no en vivo) -> editable, parte en 0 (o el marcador preparado).
 *   - "official" finalizado -> read-only (contexto del par).
 *
 * @param {object} input
 * @param {{matches:object[]}|object[]} input.fixture
 * @param {object[]} [input.officialResults]
 * @param {object[]} [input.liveMatches]
 * @param {number}   [input.now]
 * @returns {{ simultaneous:boolean, controls:object[], byGroup:Record<string,object[]>,
 *            currentMatchId:string|null, liveCount:number }}
 */
export function resolveAdminControlWindow({
  fixture,
  officialResults = [],
  liveMatches = [],
  now = Date.now(),
}) {
  const matches = Array.isArray(fixture) ? fixture : fixture?.matches ?? [];
  const officialById = new Map();
  for (const r of officialResults) if (r?.matchId) officialById.set(r.matchId, r);
  const liveById = new Map();
  for (const p of liveMatches) if (p?.matchId) liveById.set(p.matchId, p);

  // "Partido actual" = el mismo que resuelve el hero single, pero ignorando los ya
  // finalizados (para avanzar al siguiente par cuando un grupo se termina).
  const nonFinal = matches.filter((m) => !officialById.has(m.id));
  // Prefiere un partido EN VIVO (status live, no finalizado): mantiene el dual ANCLADO a su
  // par hasta que ambos finalicen, aunque el partido se alargue mas alla de la ventana de
  // reloj (LIVE_WINDOW_MS) que usa resolveCurrentMatch. Solo si no hay ninguno vivo cae al
  // "actual" por reloj (misma definicion que el control single del hero).
  const liveNonFinal = nonFinal
    .filter((m) => String(liveById.get(m.id)?.status) === "live")
    .sort(
      (a, b) =>
        (Date.parse(a.dateUtc ?? "") || 0) - (Date.parse(b.dateUtc ?? "") || 0) ||
        (a.matchNumber ?? 0) - (b.matchNumber ?? 0)
    );
  const current = liveNonFinal[0] ?? resolveCurrentMatch(nonFinal, now);
  if (!current) {
    return { simultaneous: false, controls: [], byGroup: {}, currentMatchId: null, liveCount: 0 };
  }

  // Par simultaneo = mismo grupo + misma hora de inicio (los 2 finales). Incluye al current;
  // si su hermano ya es oficial entra read-only para dar el contexto del par.
  const pair = matches
    .filter((m) => m.groupId === current.groupId && m.dateUtc === current.dateUtc)
    .sort(
      (a, b) =>
        Date.parse(a.dateUtc ?? "") - Date.parse(b.dateUtc ?? "") ||
        (a.matchNumber ?? 0) - (b.matchNumber ?? 0)
    );

  const controls = pair.map((m) =>
    buildAdminControl(m, officialById.get(m.id), liveById.get(m.id))
  );

  const byGroup = {};
  for (const c of controls) (byGroup[c.groupId] ??= []).push(c);

  return {
    simultaneous: pair.length >= 2,
    controls,
    byGroup,
    currentMatchId: current.id,
    liveCount: controls.filter((c) => c.phase === "live").length,
  };
}

function buildAdminControl(fixtureMatch, official, live) {
  let phase = "ready";
  let scores = { home: 0, away: 0 };
  if (official) {
    phase = "official";
    scores = readControlScores(official) ?? scores;
  } else if (live) {
    const liveScores = readControlScores(live);
    // status "live" puntua; cualquier otro (p.ej. "pending" preparado) es preparable.
    phase = String(live.status) === "live" ? "live" : "ready";
    scores = liveScores ?? scores;
  }
  return {
    matchId: fixtureMatch.id,
    groupId: fixtureMatch.groupId,
    matchNumber: fixtureMatch.matchNumber ?? 0,
    displayNumber: fixtureMatch.displayNumber ?? fixtureMatch.matchNumber ?? 0,
    dateUtc: fixtureMatch.dateUtc ?? null,
    phase,
    editable: phase !== "official",
    homeScore: scores.home,
    awayScore: scores.away,
    homeTeam: teamSlim(fixtureMatch.homeTeam),
    awayTeam: teamSlim(fixtureMatch.awayTeam),
  };
}
