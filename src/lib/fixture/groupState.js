// Maquina de estados del grupo + situacion en vivo (DEFINICION SIMULTANEA, F2c).
//
// Estados (comanda 6.2): pending -> in_definition -> pending_close -> final ->
// (reopened) -> recalculo -> final. El grupo NO pasa a final por finalizacion
// automatica: requiere closure validada por Admin (state==='final').
//
// Reusa buildMergedGroupStandings (F2a) y resolveFirstSecond (F2b). El `live` que
// recibe ya viene gateado por F1 (no se re-decide fase aqui; addendum A4).

import { buildMergedGroupStandings } from "./groupStandings.js";
import { resolveFirstSecond } from "./groupTiebreakers.js";
import { resolveLiveMatchPhase } from "../liveMatch/liveMatchPhase.js";

/** @typedef {import('../scoring/types').GroupSituation} GroupSituation */
/** @typedef {import('../scoring/types').GroupClosure} GroupClosure */

export const GROUP_STATE = Object.freeze({
  PENDING: "pending",
  IN_DEFINITION: "in_definition",
  PENDING_CLOSE: "pending_close",
  FINAL: "final",
  REOPENED: "reopened",
});

const toMatches = (fixture) => (Array.isArray(fixture) ? fixture : fixture?.matches ?? []);

// Normaliza un payload de marcador a la forma *TeamScore que lee resolveLiveMatchPhase.
// Tolera AMBAS formas: el payload crudo del seam (homeTeamScore/awayTeamScore) y el ya
// gateado por F1 que viaja como homeScore/awayScore (p.ej. el `gatedLive` que arma
// buildPointLedger). Sin esto, el gating por la ruta del ledger no veria marcador.
function toPhaseInput(payload) {
  if (!payload) return null;
  const home = payload.homeTeamScore ?? payload.homeScore;
  const away = payload.awayTeamScore ?? payload.awayScore;
  return { ...payload, homeTeamScore: home, awayTeamScore: away };
}

/**
 * Los DOS finales de 3a fecha de un grupo = los 2 partidos con mayor dateUtc (la pareja
 * simultanea). Pura. (Addendum F6: el gatillo del bono se ancla a estos dos.)
 * @param {string} groupId
 * @param {{ group?:object, fixture:any }} input
 * @returns {object[]} hasta 2 matches del fixture
 */
export function getGroupFinalMatches(groupId, { group, fixture }) {
  const matches = toMatches(fixture).filter((m) => m.groupId === groupId);
  return [...matches]
    .sort((a, b) => Date.parse(b.dateUtc ?? 0) - Date.parse(a.dateUtc ?? 0))
    .slice(0, 2);
}

/**
 * La ventana de definicion del grupo "empezo" si >=1 de sus DOS finales esta en vivo o ya
 * es oficial. Basta UNO (el segundo entra segundos despues por accion humana). Esta es la
 * FUENTE UNICA del gatillo del bono de grupo (1o +1 / 2o +3): F6/F7/F9 la heredan; un grupo
 * con solo fechas 1 y 2 jugadas queda BLOQUEADO (sin bonos). El gating de fase sigue siendo
 * resolveLiveMatchPhase (no se re-implementa); aqui solo se normaliza la forma del marcador.
 * @param {string} groupId
 * @param {{ group?:object, fixture:any, official?:object[], live?:object[], now?:number }} input
 * @returns {boolean}
 */
export function isGroupDefinitionStarted(
  groupId,
  { group, fixture, official = [], live = [], now = Date.now() }
) {
  const finals = getGroupFinalMatches(groupId, { group, fixture });
  return finals.some((m) => {
    const hasOfficial = (official ?? []).some((r) => r?.matchId === m.id);
    if (hasOfficial) return true;
    const payload = (live ?? []).find((l) => l?.matchId === m.id) ?? null;
    return (
      resolveLiveMatchPhase({
        liveMatch: toPhaseInput(payload),
        fixtureMatch: m,
        officialResults: official,
        now,
      }) === "live"
    );
  });
}

/**
 * Estado del grupo (pura). El cierre validado manda; si no, lo derivan los conteos.
 * @param {{ totalMatches?:number, finishedCount?:number, liveCount?:number, closure?:GroupClosure|null }} input
 * @returns {string}
 */
export function deriveGroupState({ totalMatches = 0, finishedCount = 0, liveCount = 0, closure = null }) {
  const closureState = closure?.state ?? null;
  if (closureState === GROUP_STATE.FINAL) return GROUP_STATE.FINAL;
  if (closureState === GROUP_STATE.REOPENED) return GROUP_STATE.REOPENED;

  // Todos los partidos oficiales pero sin closure validada: decidido, falta validar.
  if (totalMatches > 0 && finishedCount >= totalMatches) return GROUP_STATE.PENDING_CLOSE;
  // Uno finalizo oficial y el otro sigue vivo (comanda: in_definition -> pending_close).
  if (finishedCount > 0 && liveCount > 0) return GROUP_STATE.PENDING_CLOSE;
  // Marcadores vivos sin ningun oficial todavia: definicion en curso, volatil.
  if (liveCount > 0) return GROUP_STATE.IN_DEFINITION;
  // Nada vivo (0 o partidos viejos finalizados, pero la definicion no esta activa).
  return GROUP_STATE.PENDING;
}

/**
 * Closure CONGELADA que ya no coincide con la realidad (addendum A2). Si devuelve true
 * el panel admin (F11) debe FORZAR reapertura: corregir/desfinalizar un partido de un
 * grupo cerrado dejaria el 1o/2o oficial mintiendo.
 * @returns {boolean}
 */
export function isClosureStale(groupId, { group, fixture, official = [], live = [], closure = null }) {
  if (!closure || closure.state !== GROUP_STATE.FINAL) return false;
  const matches = toMatches(fixture);
  const merged = buildMergedGroupStandings({ group, matches, official, live });
  // Un grupo final debia tener todos sus partidos completos; si ya no, algo se corrigio.
  if (merged.totalMatches > 0 && merged.completedMatches < merged.totalMatches) return true;
  const { first, second } = resolveFirstSecond(merged);
  if (first !== (closure.officialFirstTeam ?? null)) return true;
  if (second !== (closure.officialSecondTeam ?? null)) return true;
  return false;
}

/**
 * Situacion completa de un grupo: standings, 1o/2o, estado, y banderas de provisional
 * y staleness. Cuando state==='final' devuelve los standings/1o/2o CONGELADOS de la
 * closure (plano oficial inmutable hasta reapertura), pero ademas expone liveFirst/
 * liveSecond recomputados y closureStale para detectar incoherencias.
 *
 * @param {string} groupId
 * @param {{ group:object, fixture:any, official?:object[], live?:object[], closure?:GroupClosure|null }} input
 * @returns {GroupSituation}
 */
export function computeGroupSituation(groupId, { group, fixture, official = [], live = [], closure = null }) {
  const matches = toMatches(fixture);
  const merged = buildMergedGroupStandings({ group, matches, official, live });
  const { first: liveFirst, second: liveSecond } = resolveFirstSecond(merged);

  const state = deriveGroupState({
    totalMatches: merged.totalMatches,
    finishedCount: merged.finishedCount,
    liveCount: merged.liveCount,
    closure,
  });

  let first = liveFirst;
  let second = liveSecond;
  let standings = merged.standings;
  if (state === GROUP_STATE.FINAL && closure) {
    first = closure.officialFirstTeam ?? liveFirst;
    second = closure.officialSecondTeam ?? liveSecond;
    if (Array.isArray(closure.officialStandings) && closure.officialStandings.length) {
      standings = closure.officialStandings;
    }
  }

  return {
    groupId,
    standings,
    first,
    second,
    liveFirst,
    liveSecond,
    state,
    finishedCount: merged.finishedCount,
    liveCount: merged.liveCount,
    totalMatches: merged.totalMatches,
    isProvisional: state !== GROUP_STATE.FINAL,
    closureStale: isClosureStale(groupId, { group, fixture: matches, official, live, closure }),
    // BLOQUEADO (false y state!==final) vs EN DEFINICION / DEFINITIVO: lo decide el gatillo
    // por final de 3a fecha, no por fechas 1-2. Aditivo; no altera el resto del situation.
    definitionStarted: isGroupDefinitionStarted(groupId, { group, fixture: matches, official, live }),
  };
}
