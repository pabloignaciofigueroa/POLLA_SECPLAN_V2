// Validacion de la polla - modulo ESM puro (sin DOM).
// Se usa en el browser (predicciones.client.js) para bloquear descargas incompletas.
//
// Contrato de datos (buckets de UN jugador):
//   predictions: { [matchId]: { homeScore: number|null, awayScore: number|null, groupId } }
//   qualified:   { [groupId]: { firstPlaceTeamId: string|null, secondPlaceTeamId: string|null } }
//   groups:      [{ id, label, teams[], matchIds[] }]
//   matches:     [{ id, matchNumber, groupId, ... }]

export const MATCHES_PER_GROUP = 6;
export const TOTAL_GROUPS = 12;
export const TOTAL_MATCHES = 72;
export const QUALIFIED_SLOTS_PER_GROUP = 2;
export const TOTAL_QUALIFIED_SLOTS = TOTAL_GROUPS * QUALIFIED_SLOTS_PER_GROUP; // 24

/** Normaliza un valor a entero >= 0, o null si no es un marcador válido. */
export function toScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Estado de un marcador: "complete" | "partial" | "empty". */
export function scoreStatus(homeScore, awayScore) {
  const hasHome = toScore(homeScore) !== null;
  const hasAway = toScore(awayScore) !== null;
  if (hasHome && hasAway) return "complete";
  if (hasHome || hasAway) return "partial";
  return "empty";
}

/** ¿El marcador guardado de un partido está completo y es válido? */
function matchIsComplete(prediction) {
  if (!prediction) return false;
  return scoreStatus(prediction.homeScore, prediction.awayScore) === "complete";
}

/**
 * Valida un grupo. (Comanda §4)
 * @param {string} groupId
 * @param {object} predictions  bucket del jugador { [matchId]: {...} }
 * @param {object} qualified    bucket del jugador { [groupId]: {...} }
 * @param {Array}  groupMatches los 6 partidos del grupo
 */
export function validateGroup(groupId, predictions = {}, qualified = {}, groupMatches = []) {
  const completedMatches = groupMatches.filter((m) => matchIsComplete(predictions[m.id])).length;

  const q = qualified[groupId] ?? {};
  const firstPlaceSelected = Boolean(q.firstPlaceTeamId);
  const secondPlaceSelected = Boolean(q.secondPlaceTeamId);
  const duplicatedQualified =
    firstPlaceSelected && secondPlaceSelected && q.firstPlaceTeamId === q.secondPlaceTeamId;

  const missing = [];
  if (completedMatches < MATCHES_PER_GROUP) {
    const pending = MATCHES_PER_GROUP - completedMatches;
    missing.push(`${pending} ${pending === 1 ? "marcador" : "marcadores"}`);
  }
  if (!firstPlaceSelected) missing.push("1° clasificado");
  if (!secondPlaceSelected) missing.push("2° clasificado");
  if (duplicatedQualified) missing.push("clasificados duplicados");

  const isComplete =
    completedMatches === MATCHES_PER_GROUP &&
    firstPlaceSelected &&
    secondPlaceSelected &&
    !duplicatedQualified;

  return {
    groupId,
    totalMatches: MATCHES_PER_GROUP,
    completedMatches,
    firstPlaceSelected,
    secondPlaceSelected,
    duplicatedQualified,
    isComplete,
    missing,
  };
}

/**
 * Valida la polla completa. (Comanda §5)
 * Devuelve contadores globales + detalle por grupo + resumen legible de lo que falta.
 */
export function validateFullPrediction(predictions = {}, qualified = {}, groups = [], matches = []) {
  const matchesByGroup = new Map();
  for (const match of matches) {
    if (!matchesByGroup.has(match.groupId)) matchesByGroup.set(match.groupId, []);
    matchesByGroup.get(match.groupId).push(match);
  }

  const groupResults = groups.map((group) =>
    validateGroup(group.id, predictions, qualified, matchesByGroup.get(group.id) ?? [])
  );

  let completedMatches = 0;
  let completedGroups = 0;
  let completedQualifiedSlots = 0;
  const missingSummary = [];

  for (const result of groupResults) {
    completedMatches += result.completedMatches;
    if (result.isComplete) completedGroups += 1;

    // Un slot cuenta solo si está seleccionado y el grupo no tiene duplicado.
    if (!result.duplicatedQualified) {
      if (result.firstPlaceSelected) completedQualifiedSlots += 1;
      if (result.secondPlaceSelected) completedQualifiedSlots += 1;
    }

    if (!result.isComplete) {
      const group = groups.find((g) => g.id === result.groupId);
      const label = group?.label ?? `Grupo ${result.groupId}`;
      missingSummary.push(`${label}: ${result.missing.join(", ")}`);
    }
  }

  const isComplete =
    completedMatches === TOTAL_MATCHES &&
    completedGroups === groups.length &&
    completedQualifiedSlots === TOTAL_QUALIFIED_SLOTS;

  return {
    totalMatches: TOTAL_MATCHES,
    completedMatches,
    totalGroups: TOTAL_GROUPS,
    completedGroups,
    totalQualifiedSlots: TOTAL_QUALIFIED_SLOTS,
    completedQualifiedSlots,
    isComplete,
    groups: groupResults,
    missingSummary,
  };
}
