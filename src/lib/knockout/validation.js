// Validacion de la llave eliminatoria - modulo ESM puro (sin DOM). Modo local.
//
// Contrato (bucket de UN jugador):
//   predictions: { [matchId]: { matchId, homeScore: number|null, awayScore: number|null,
//                               advances: "home"|"away"|null, status } }
//   matches:     [{ id, bracketSlot, matchNumber, predictionEnabled, ... }]
//
// Un cruce eliminatorio puede empatar en 90' y aun asi alguien avanza (prorroga/penales),
// por eso se exige ademas el "avance" (que lado pasa), no solo el marcador.
// Solo se validan/cuentan los cruces PREDECIBLES (predictionEnabled === true): R32 con
// ambos lados ya concretos. Los placeholders y rondas futuras no entran al conteo.

/** Normaliza un valor a entero >= 0, o null si no es un marcador valido. */
export function toScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** Estado del marcador: "complete" | "partial" | "empty". */
export function scoreStatus(homeScore, awayScore) {
  const hasHome = toScore(homeScore) !== null;
  const hasAway = toScore(awayScore) !== null;
  if (hasHome && hasAway) return "complete";
  if (hasHome || hasAway) return "partial";
  return "empty";
}

/** ¿Esta seteado el avance (que lado pasa)? */
export function isAdvanceSet(advances) {
  return advances === "home" || advances === "away";
}

/**
 * Deriva el lado ganador a partir del marcador. Si no es empate, gana el de mayor
 * marcador (no se puede avanzar al perdedor); si es empate, devuelve null (hay que
 * elegir quien pasa por penales).
 */
export function inferAdvance(homeScore, awayScore) {
  const h = toScore(homeScore);
  const a = toScore(awayScore);
  if (h === null || a === null) return null;
  if (h > a) return "home";
  if (a > h) return "away";
  return null; // empate -> decision manual
}

/** ¿El marcador cargado es empate (ambos lados con el mismo entero valido)? */
export function isTie(homeScore, awayScore) {
  const h = toScore(homeScore);
  const a = toScore(awayScore);
  return h !== null && a !== null && h === a;
}

/** Estado del cruce completo (marcador + avance): "complete" | "partial" | "empty". */
export function predictionStatus(prediction) {
  if (!prediction) return "empty";
  const s = scoreStatus(prediction.homeScore, prediction.awayScore);
  const adv = isAdvanceSet(prediction.advances);
  if (s === "complete" && adv) return "complete";
  if (s === "empty" && !adv) return "empty";
  return "partial";
}

/** ¿El cruce esta completo (marcador valido + avance elegido)? */
export function matchIsComplete(prediction) {
  return predictionStatus(prediction) === "complete";
}

/** Solo los cruces predecibles (R32 con ambos lados concretos). */
export function predictableMatches(matches = []) {
  return matches.filter((m) => m && m.predictionEnabled === true);
}

/**
 * Valida la llave completa sobre los cruces PREDECIBLES. Devuelve contadores + faltantes.
 * @param {object} predictions bucket del jugador { [matchId]: {...} }
 * @param {Array}  matches     todos los cruces (se filtra por predictionEnabled)
 */
export function validateKnockout(predictions = {}, matches = []) {
  const predictable = predictableMatches(matches);
  const total = predictable.length;
  let completedMatches = 0;
  const missing = [];

  for (const match of predictable) {
    if (matchIsComplete(predictions[match.id])) {
      completedMatches += 1;
    } else {
      missing.push(`Cruce ${match.bracketSlot ?? match.matchNumber}`);
    }
  }

  return {
    totalMatches: total,
    completedMatches,
    isComplete: total > 0 && completedMatches === total,
    missing,
  };
}
