// Liquidacion de clasificados 1o/2o (DEFINICION SIMULTANEA, F4).
//
// Evento SEPARADO del puntaje de partido. Cada bono es una linea con su clave logica
// `group:${groupId}:${playerId}:first|second` (idempotente, last-wins). Modos:
//   - final: el grupo esta cerrado y validado (closure.state==='final') -> estado 'final'.
//   - projected: grupo abierto/en definicion -> estado 'provisional' (rotulado por la UI).
//
// El 1o/2o oficial sale de computeGroupSituation (fuente unica; congelado si final).
// Solo se emiten bonos para grupos que ya empezaron (o estan final): un grupo sin
// jugar no genera puntos proyectados sobre standings vacios.

import { computeGroupSituation, GROUP_STATE, isGroupDefinitionStarted } from "../fixture/groupState.js";

/** @typedef {import('./types').GroupBonusLine} GroupBonusLine */
/** @typedef {import('./types').PointLedgerLine} PointLedgerLine */

// Fuente unica del valor de los bonos (NO sale de scoring-rules.json: ese es de partido).
// El 2o vale mas porque es mas dificil de achuntar.
export const GROUP_BONUS = Object.freeze({ first: 1, second: 3 });

function bonusLineFor({ groupId, playerId, position, predictedTeamId, officialTeamId, mode, groupState }) {
  const evento = position === 1 ? "first" : "second";
  let regla = "group_miss";
  let puntos = 0;
  if (predictedTeamId && officialTeamId && predictedTeamId === officialTeamId) {
    regla = position === 1 ? "group_first" : "group_second";
    puntos = position === 1 ? GROUP_BONUS.first : GROUP_BONUS.second;
  }
  return {
    group: groupId,
    playerId,
    position,
    evento,
    predictedTeamId: predictedTeamId ?? null,
    officialTeamId: officialTeamId ?? null,
    regla,
    puntos,
    estado: mode === "final" ? "final" : "provisional",
    groupState,
    key: `group:${groupId}:${playerId}:${evento}`,
  };
}

/** GroupBonusLine -> PointLedgerLine (origen 'group'). */
function toLedgerLine(bonus) {
  return {
    playerId: bonus.playerId,
    origen: "group",
    evento: bonus.evento,
    regla: bonus.regla,
    puntos: bonus.puntos,
    estado: bonus.estado,
    group: bonus.group,
    groupState: bonus.groupState,
    ts: null,
    key: bonus.key,
  };
}

/**
 * @param {object} input
 * @param {object[]} input.players               [{id,...}]
 * @param {object[]} input.qualifiedPredictions  [{playerId,groupId,position:1|2,teamId}]
 * @param {object[]} input.groups                groups.json [{id,label,teams,matchIds}]
 * @param {any}      input.fixture               fixture completo
 * @param {object[]} [input.official]            payloads oficiales (todo el torneo)
 * @param {object[]} [input.live]                payloads live YA gateados por F1
 * @param {Record<string,object>} [input.closuresByGroup]  groupId -> GroupClosure
 * @returns {{ lines: PointLedgerLine[], byGroup: Record<string, GroupBonusLine[]> }}
 */
export function buildGroupBonuses({
  players = [],
  qualifiedPredictions = [],
  groups = [],
  fixture,
  official = [],
  live = [],
  closuresByGroup = {},
}) {
  // Indice: playerId -> groupId -> { 1: teamId, 2: teamId }
  const qpIndex = new Map();
  for (const qp of qualifiedPredictions) {
    if (!qp?.playerId || !qp?.groupId) continue;
    if (qp.position !== 1 && qp.position !== 2) continue;
    let byGroupMap = qpIndex.get(qp.playerId);
    if (!byGroupMap) {
      byGroupMap = new Map();
      qpIndex.set(qp.playerId, byGroupMap);
    }
    let byPos = byGroupMap.get(qp.groupId);
    if (!byPos) {
      byPos = {};
      byGroupMap.set(qp.groupId, byPos);
    }
    byPos[qp.position] = qp.teamId;
  }

  const lines = [];
  const byGroup = {};

  for (const group of groups) {
    const closure = closuresByGroup[group.id] ?? null;
    const situation = computeGroupSituation(group.id, { group, fixture, official, live, closure });
    // Gatillo correcto (F6): el bono se activa cuando >=1 FINAL de 3a fecha esta live/oficial,
    // NO con cualquier partido de fechas 1-2. Fuente unica isGroupDefinitionStarted (fundacion).
    const started = isGroupDefinitionStarted(group.id, { group, fixture, official, live });
    if (!started && situation.state !== GROUP_STATE.FINAL) continue; // grupo no en definicion: BLOQUEADO, sin bonos

    const mode = situation.state === GROUP_STATE.FINAL ? "final" : "projected";
    const groupLines = [];
    for (const player of players) {
      const predByPos = qpIndex.get(player.id)?.get(group.id) ?? {};
      const first = bonusLineFor({
        groupId: group.id,
        playerId: player.id,
        position: 1,
        predictedTeamId: predByPos[1] ?? null,
        officialTeamId: situation.first,
        mode,
        groupState: situation.state,
      });
      const second = bonusLineFor({
        groupId: group.id,
        playerId: player.id,
        position: 2,
        predictedTeamId: predByPos[2] ?? null,
        officialTeamId: situation.second,
        mode,
        groupState: situation.state,
      });
      groupLines.push(first, second);
      lines.push(toLedgerLine(first), toLedgerLine(second));
    }
    byGroup[group.id] = groupLines;
  }

  return { lines, byGroup };
}
