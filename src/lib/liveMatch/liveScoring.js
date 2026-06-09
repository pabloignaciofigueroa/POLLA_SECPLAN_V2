// Fuente unica de calculo de la Polla (puntaje + precision visual).
//
// REGLA MADRE:
//   PUNTOS    = regla oficial (ordena el ranking).
//   PRECISION = lectura visual de cercania (NO entrega puntos).
//
// Modelo de puntaje (no aditivo):
//   exacto unico (Lone Wolf) = 5
//   exacto compartido        = 3
//   tendencia (gana/empate)  = 1
//   nada                     = 0
//
// Modulo puro y dependency-free: lo importan el SSR (lib/tabla/*.ts) y el
// recompute en vivo (tabla.client.js, dentro del bundle cliente). Coercion Number() en todos los
// cruces para evitar el bug "2" !== 2.

// ── Puntaje ────────────────────────────────────────────────────────────────

export function getOutcome(homeScore, awayScore) {
  const home = Number(homeScore);
  const away = Number(awayScore);
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export function hasCompletePrediction(prediction) {
  if (!prediction) return false;
  const home = prediction.homeScore;
  const away = prediction.awayScore;
  if (home === null || home === undefined || away === null || away === undefined) return false;
  return Number.isInteger(Number(home)) && Number.isInteger(Number(away));
}

export function isExact(prediction, result) {
  return (
    Number(prediction.homeScore) === Number(result.homeScore) &&
    Number(prediction.awayScore) === Number(result.awayScore)
  );
}

export function isTendencyCorrect(prediction, result) {
  return (
    getOutcome(prediction.homeScore, prediction.awayScore) ===
    getOutcome(result.homeScore, result.awayScore)
  );
}

// Cuantos jugadores pusieron exactamente este resultado (para Lone Wolf).
export function countExactPredictionsForResult(allPredictionsForMatch, result) {
  return (allPredictionsForMatch ?? []).filter(
    (prediction) =>
      hasCompletePrediction(prediction) &&
      Number(prediction.homeScore) === Number(result.homeScore) &&
      Number(prediction.awayScore) === Number(result.awayScore)
  ).length;
}

/**
 * Puntos oficiales de una prediccion contra el marcador (vivo u oficial).
 * @returns {{ points:number, hitType:string, label:string }}
 */
export function calculatePointsForPrediction(prediction, result, allPredictionsForMatch) {
  if (!hasCompletePrediction(prediction)) {
    return { points: 0, hitType: "no_info", label: "SIN INFO" };
  }

  if (isExact(prediction, result)) {
    const exactCount = countExactPredictionsForResult(allPredictionsForMatch, result);
    if (exactCount === 1) {
      return { points: 5, hitType: "lone_wolf", label: "LONE WOLF" };
    }
    return { points: 3, hitType: "exact", label: "EXACTO" };
  }

  if (isTendencyCorrect(prediction, result)) {
    return { points: 1, hitType: "tendency", label: "TENDENCIA" };
  }

  return { points: 0, hitType: "none", label: "SIN PUNTOS" };
}

// ── Precision visual (NO es puntaje) ───────────────────────────────────────

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// En futbol los goles no bajan: detectar si el exacto todavia es alcanzable.
export function getExactStatus(prediction, liveResult) {
  const predictedHome = Number(prediction.homeScore);
  const predictedAway = Number(prediction.awayScore);
  const liveHome = Number(liveResult.homeScore);
  const liveAway = Number(liveResult.awayScore);

  if (predictedHome === liveHome && predictedAway === liveAway) return "exact_now";
  if (predictedHome >= liveHome && predictedAway >= liveAway) return "reachable";
  return "impossible";
}

export function getGoalDistance(prediction, liveResult) {
  return (
    Math.abs(Number(prediction.homeScore) - Number(liveResult.homeScore)) +
    Math.abs(Number(prediction.awayScore) - Number(liveResult.awayScore))
  );
}

export function getGoalsNeededToExact(prediction, liveResult) {
  return {
    home: Math.max(0, Number(prediction.homeScore) - Number(liveResult.homeScore)),
    away: Math.max(0, Number(prediction.awayScore) - Number(liveResult.awayScore)),
  };
}

export function getOvershoot(prediction, liveResult) {
  return {
    home: Math.max(0, Number(liveResult.homeScore) - Number(prediction.homeScore)),
    away: Math.max(0, Number(liveResult.awayScore) - Number(prediction.awayScore)),
  };
}

/**
 * Porcentaje visual de cercania al exacto contra el marcador actual.
 * No entrega puntos. Distingue exacto alcanzable vs imposible.
 * @returns {{ percentage:number, exactStatus:string, label:string }}
 */
export function calculateLiveAccuracy(prediction, liveResult) {
  if (!hasCompletePrediction(prediction)) {
    return { percentage: 0, exactStatus: "no_info", label: "SIN INFO" };
  }

  const exactStatus = getExactStatus(prediction, liveResult);
  const distance = getGoalDistance(prediction, liveResult);
  const trendCorrect = isTendencyCorrect(prediction, liveResult);

  if (exactStatus === "exact_now") {
    return { percentage: 100, exactStatus, label: "EXACTO AHORA" };
  }

  let percentage = 0;
  let label = "";

  if (exactStatus === "reachable") {
    const distanceBonus = Math.max(0, 30 - distance * 8);
    if (trendCorrect) {
      percentage = Math.min(55 + distanceBonus, 90);
      label = "TENDENCIA CORRECTA · EXACTO ALCANZABLE";
    } else {
      percentage = Math.min(40 + distanceBonus, 70);
      label = "EXACTO ALCANZABLE";
    }
  } else {
    // impossible
    const overshoot = getOvershoot(prediction, liveResult);
    const overshootTotal = overshoot.home + overshoot.away;
    const smallDistanceBonus = Math.max(0, 20 - distance * 6 - overshootTotal * 8);
    if (trendCorrect) {
      percentage = Math.min(35 + smallDistanceBonus, 65);
      label = "TENDENCIA CORRECTA · EXACTO IMPOSIBLE";
    } else {
      percentage = Math.min(10 + smallDistanceBonus, 35);
      label = "EXACTO IMPOSIBLE";
    }
  }

  return { percentage: clamp(Math.round(percentage), 0, 100), exactStatus, label };
}

// Bucket de % -> nivel para el color de la barra (mantiene los niveles existentes).
export function accuracyLevelFromPercent(percentage) {
  if (percentage >= 90) return "excellent";
  if (percentage >= 65) return "close";
  if (percentage >= 45) return "regular";
  if (percentage >= 25) return "far";
  return "very_far";
}
