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

import { computeGroupSituation, GROUP_STATE } from "../fixture/groupState.js";
import { buildGroupBonuses, GROUP_BONUS } from "../scoring/groupBonuses.js";

/** Estados en que el panel de cierre es relevante (no EN DEFINICION / no PENDING). */
export const CLOSE_PANEL_STATES = Object.freeze([
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
    live: snapshot?.liveMatches ?? [],
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
    live: snapshot?.liveMatches ?? [],
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
