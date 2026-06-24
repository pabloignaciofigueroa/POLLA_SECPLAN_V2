// F11 - Logica pura del panel de cierre de grupo (Admin: DEFINICION SIMULTANEA).
//
// Todo lo que decide "que mostrar" y "que se va a consolidar" vive aqui, SIN window
// ni remoto, para poder testearlo offline (node:test). El cliente admin solo orquesta
// el DOM y dispara las RPC (closeGroup/reopenGroup) ya existentes en liveMatchState.js.
//
// INVARIANTES (criterios de rechazo F11):
//  - CERO formula nueva: el 1o/2o, el estado y closureStale salen de computeGroupSituation
//    (fundacion). Los bonos del preview salen de buildGroupBonuses (mismo gate
//    isGroupDefinitionStarted). Aqui NO se recalcula puntaje ni se re-gatea el bono.
//  - El panel SOLO aparece en PENDING_CLOSE / FINAL / REOPENED. EN DEFINICION (en vivo)
//    no se ofrece cerrar.
//  - Idempotencia: el cierre es upsert + version++ en la RPC; aqui solo se decide si el
//    boton "VALIDAR Y CERRAR" se ofrece (no en FINAL coherente) -> apoyo a la idempotencia
//    en UI (la garantia dura vive en la RPC).

import { computeGroupSituation, GROUP_STATE, getGroupFinalMatches } from "../fixture/groupState.js";
import { buildGroupBonuses, GROUP_BONUS } from "../scoring/groupBonuses.js";
import { resolveLiveMatchPhase } from "../liveMatch/liveMatchPhase.js";

/**
 * Gatea los marcadores vivos del snapshot a SOLO los que cuentan (fase "live"), igual que F1
 * en el sitio publico. CRITICO: sin esto, un partido PREPARADO 0-0 (status "pending", antes de
 * la hora) se contaria como un empate JUGADO e inflaria PJ/puntos y el estado del grupo
 * (computeGroupSituation espera `live` ya gateado por F1; el admin pasaba el crudo).
 * @returns {object[]} los payloads vivos cuya fase es "live".
 */
function gateLiveMatches(snapshot, fixture, now = Date.now()) {
  const matches = Array.isArray(fixture) ? fixture : fixture?.matches ?? [];
  const byId = new Map(matches.map((m) => [m.id, m]));
  const official = snapshot?.officialResults ?? [];
  return (snapshot?.liveMatches ?? []).filter((payload) => {
    if (!payload?.matchId) return false;
    const fixtureMatch = byId.get(payload.matchId);
    if (!fixtureMatch) return false;
    const home = payload.homeTeamScore ?? payload.homeScore;
    const away = payload.awayTeamScore ?? payload.awayScore;
    const phase = resolveLiveMatchPhase({
      liveMatch: { ...payload, homeTeamScore: home, awayTeamScore: away },
      fixtureMatch,
      officialResults: official,
      now,
    });
    return phase === "live";
  });
}

/** Estados en que el panel de cierre es relevante (no EN DEFINICION / no PENDING). */
export const CLOSE_PANEL_STATES = Object.freeze([
  GROUP_STATE.PENDING_CLOSE,
  GROUP_STATE.FINAL,
  GROUP_STATE.REOPENED,
]);

/** Estados "en juego" para el desglose en vivo del admin: incluye EN DEFINICION (finales en
 *  curso) ademas de los de cierre. PENDING (sin empezar) queda fuera. */
export const IN_PLAY_STATES = Object.freeze([
  GROUP_STATE.IN_DEFINITION,
  GROUP_STATE.PENDING_CLOSE,
  GROUP_STATE.FINAL,
  GROUP_STATE.REOPENED,
]);

/** groupId -> closure, desde el array de closures del snapshot. */
export function closuresByGroupId(groupClosures = []) {
  const map = {};
  for (const closure of groupClosures ?? []) {
    if (closure?.groupId) map[closure.groupId] = closure;
  }
  return map;
}

/**
 * La situacion del grupo (fuente unica). Pura; no recalcula nada propio.
 * @param {object} group  entrada de groups.json
 * @param {{ fixture:any, snapshot:object }} ctx
 * @returns {import('../scoring/types').GroupSituation}
 */
export function situationFor(group, { fixture, snapshot }) {
  const closures = closuresByGroupId(snapshot?.groupClosures ?? []);
  return computeGroupSituation(group.id, {
    group,
    fixture,
    official: snapshot?.officialResults ?? [],
    live: gateLiveMatches(snapshot, fixture), // NO contar 0-0 preparados (fase pending)
    closure: closures[group.id] ?? null,
  });
}

/**
 * Grupos relevantes para el panel (PENDING_CLOSE / FINAL / REOPENED), en el orden de
 * `groups`. Cada item lleva su situacion ya computada (no se recomputa despues).
 * @param {object[]} groups
 * @param {{ fixture:any, snapshot:object }} ctx
 * @returns {{ group:object, situation:object }[]}
 */
export function groupsReadyToClose(groups = [], { fixture, snapshot }) {
  const out = [];
  for (const group of groups) {
    const situation = situationFor(group, { fixture, snapshot });
    if (CLOSE_PANEL_STATES.includes(situation.state)) {
      out.push({ group, situation });
    }
  }
  return out;
}

/**
 * Grupos "en juego" (EN DEFINICION / PENDING_CLOSE / FINAL / REOPENED) para el desglose en
 * vivo de "quien suma" en el admin. Mismo shape que groupsReadyToClose pero incluye ademas los
 * grupos con finales en curso, para ver el desglose mientras el marcador cambia.
 * @param {object[]} groups
 * @param {{ fixture:any, snapshot:object }} ctx
 * @returns {{ group:object, situation:object }[]}
 */
export function groupsInPlay(groups = [], { fixture, snapshot }) {
  const liveMatches = snapshot?.liveMatches ?? [];
  const official = snapshot?.officialResults ?? [];
  const out = [];
  for (const group of groups) {
    const situation = situationFor(group, { fixture, snapshot });

    // "Proximo a definirse": el admin ya PREPARO/juega un final de 3a fecha del grupo (hay una
    // fila preparada/viva/oficial para alguno de sus dos finales), aunque la definicion aun no
    // sume. Permite mostrar las predicciones del grupo CON GUION antes de que arranque, para
    // corroborar. En dias normales (ningun final tocado) no se gatilla -> sin regresion.
    const finalIds = new Set(getGroupFinalMatches(group.id, { group, fixture }).map((m) => m.id));
    const hasFinalRow =
      liveMatches.some((p) => p?.matchId && finalIds.has(p.matchId)) ||
      official.some((r) => r?.matchId && finalIds.has(r.matchId));

    const inCloseState = CLOSE_PANEL_STATES.includes(situation.state);
    // EN DEFINICION solo si la definicion REALMENTE empezo (no por un marcador de fechas 1-2).
    const inDefinition =
      situation.state === GROUP_STATE.IN_DEFINITION && situation.definitionStarted;

    if (inCloseState || inDefinition || hasFinalRow) {
      out.push({ group, situation });
    }
  }
  return out;
}

/**
 * Preview de los bonos que se CONSOLIDARAN al cerrar un grupo. Reusa buildGroupBonuses
 * (mismo gate / misma formula que el ranking) y agrega el conteo por posicion. NO inventa
 * puntaje: solo cuenta aciertos del libro de bonos del grupo.
 *
 * @param {object} group
 * @param {{ players:object[], qualifiedPredictions:object[], groups:object[], fixture:any, snapshot:object }} ctx
 * @returns {{ firstHits:number, secondHits:number, firstPoints:number, secondPoints:number, totalPoints:number, firstValue:number, secondValue:number, lines:object[] }}
 */
export function bonusPreviewFor(group, { players, qualifiedPredictions, groups, fixture, snapshot }) {
  const closuresByGroup = closuresByGroupId(snapshot?.groupClosures ?? []);
  const { byGroup } = buildGroupBonuses({
    players: players ?? [],
    qualifiedPredictions: qualifiedPredictions ?? [],
    groups: groups ?? [],
    fixture,
    official: snapshot?.officialResults ?? [],
    live: gateLiveMatches(snapshot, fixture), // NO contar 0-0 preparados (fase pending)
    closuresByGroup,
  });

  const lines = byGroup[group.id] ?? [];
  let firstHits = 0;
  let secondHits = 0;
  let firstPoints = 0;
  let secondPoints = 0;
  for (const line of lines) {
    if (line.regla === "group_first") {
      firstHits += 1;
      firstPoints += line.puntos;
    } else if (line.regla === "group_second") {
      secondHits += 1;
      secondPoints += line.puntos;
    }
  }
  return {
    firstHits,
    secondHits,
    firstPoints,
    secondPoints,
    totalPoints: firstPoints + secondPoints,
    firstValue: GROUP_BONUS.first,
    secondValue: GROUP_BONUS.second,
    lines,
  };
}

/**
 * Desglose POR JUGADOR de quien suma el bono del grupo (+1 por el 1o, +3 por el 2o), para el
 * admin en vivo. Reusa bonusPreviewFor -> buildGroupBonuses: CERO formula nueva. Una fila por
 * jugador con su pick de 1o/2o, si acerto cada uno y su subtotal. Ordenada por puntos desc y
 * luego por el orden de `players`.
 *
 * @param {object} group
 * @param {{ players:object[], qualifiedPredictions:object[], groups:object[], fixture:any, snapshot:object }} ctx
 * @returns {{ rows:object[], firstValue:number, secondValue:number, totalPoints:number }}
 */
export function scorerRowsFor(group, ctx) {
  const players = ctx.players ?? [];
  const qualifiedPredictions = ctx.qualifiedPredictions ?? [];
  const situation = situationFor(group, { fixture: ctx.fixture, snapshot: ctx.snapshot });
  // started = el bono YA cuenta (definicion empezada o grupo final). Si no, mostramos las
  // predicciones con guion (nadie suma todavia, igual que un partido sin empezar).
  const started =
    Boolean(situation.definitionStarted) || situation.state === GROUP_STATE.FINAL;

  // Picks 1o/2o por jugador desde las predicciones (SIEMPRE: para corroborar antes de empezar).
  const order = new Map(players.map((p, i) => [p.id, i]));
  const picksByPlayer = new Map();
  for (const qp of qualifiedPredictions) {
    if (qp?.groupId !== group.id || !qp?.playerId) continue;
    if (qp.position !== 1 && qp.position !== 2) continue;
    const byPos = picksByPlayer.get(qp.playerId) ?? {};
    byPos[qp.position] = qp.teamId;
    picksByPlayer.set(qp.playerId, byPos);
  }

  // Puntos/aciertos REALES desde buildGroupBonuses (CERO formula nueva). Vacio si no empezo.
  const preview = bonusPreviewFor(group, ctx);
  const bonusByPlayer = new Map();
  for (const line of preview.lines) {
    const b = bonusByPlayer.get(line.playerId) ?? {};
    if (line.position === 1) {
      b.firstHit = line.regla === "group_first";
      b.firstPoints = line.puntos;
    } else if (line.position === 2) {
      b.secondHit = line.regla === "group_second";
      b.secondPoints = line.puntos;
    }
    bonusByPlayer.set(line.playerId, b);
  }

  const rows = players.map((p) => {
    const picks = picksByPlayer.get(p.id) ?? {};
    const b = bonusByPlayer.get(p.id) ?? {};
    const firstPoints = b.firstPoints ?? 0;
    const secondPoints = b.secondPoints ?? 0;
    return {
      playerId: p.id,
      firstTeamId: picks[1] ?? null,
      secondTeamId: picks[2] ?? null,
      firstHit: Boolean(b.firstHit),
      secondHit: Boolean(b.secondHit),
      firstPoints,
      secondPoints,
      points: firstPoints + secondPoints,
    };
  });
  rows.sort(
    (a, b) => b.points - a.points || (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0)
  );
  return {
    rows,
    started,
    firstValue: preview.firstValue,
    secondValue: preview.secondValue,
    totalPoints: preview.totalPoints,
  };
}

/**
 * Idempotencia en UI: cuando OFRECER "VALIDAR Y CERRAR". Se ofrece en PENDING_CLOSE y en
 * REOPENED (hay que (re)consolidar), y tambien en FINAL si la closure quedo STALE (hay que
 * recerrar con la nueva realidad). NO se ofrece en FINAL coherente (ya esta, recerrar solo
 * subiria la version sin cambiar nada). La garantia dura (upsert + version++) vive en la RPC.
 * @param {object} situation
 * @returns {boolean}
 */
export function canOfferClose(situation) {
  if (!situation) return false;
  if (situation.state === GROUP_STATE.PENDING_CLOSE) return true;
  if (situation.state === GROUP_STATE.REOPENED) return true;
  if (situation.state === GROUP_STATE.FINAL && situation.closureStale) return true;
  return false;
}

/** Cuando OFRECER "REABRIR": solo para un grupo ya FINAL (haya o no quedado stale). */
export function canOfferReopen(situation) {
  return Boolean(situation && situation.state === GROUP_STATE.FINAL);
}

/** Una closure FINAL que ya no coincide con la realidad: el panel debe forzar reapertura. */
export function isClosureStaleSituation(situation) {
  return Boolean(situation && situation.state === GROUP_STATE.FINAL && situation.closureStale);
}
