// Resuelve cómo CERRAR un cruce eliminatorio desde el /admin (módulo puro, sin DOM, testeable).
// Separa: marcador de cancha + método de definición + quién avanza.
//   - Gana en cancha (marcador con ganador) -> winner = lado del marcador, resolution
//     "regular_time", se puede finalizar.
//   - Empate en cancha -> se define por PENALES: hay que elegir quién avanza; NO se puede
//     finalizar sin ese ganador. resolution = "penalties".
// Modelo por LADO ("home"/"away"), consistente con result.winner y prediction.advances.
// (Los penales no cambian el marcador; no se distingue alargue: no afecta el puntaje.)

function toInt(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * @param {{ homeScore:any, awayScore:any, draftWinner?:"home"|"away"|null }} args
 * @returns {{ complete:boolean, outcome:"home"|"away"|"draw"|null, winner:"home"|"away"|null,
 *             resolution:"regular_time"|"penalties"|null, requiresPenaltyWinner:boolean, canFinalize:boolean }}
 */
export function resolveResult({ homeScore, awayScore, draftWinner = null } = {}) {
  const h = toInt(homeScore);
  const a = toInt(awayScore);
  const complete = h !== null && a !== null;
  if (!complete) {
    return { complete: false, outcome: null, winner: null, resolution: null, requiresPenaltyWinner: false, canFinalize: false };
  }
  if (h !== a) {
    // Gana en cancha: el ganador es el del marcador. Sin penales (limpia cualquier pick previo).
    const winner = h > a ? "home" : "away";
    return { complete: true, outcome: winner, winner, resolution: "regular_time", requiresPenaltyWinner: false, canFinalize: true };
  }
  // Empate en cancha -> PENALES: hay que elegir quién avanza para poder finalizar.
  const winner = draftWinner === "home" || draftWinner === "away" ? draftWinner : null;
  return {
    complete: true,
    outcome: "draw",
    winner,
    resolution: "penalties",
    requiresPenaltyWinner: true,
    canFinalize: winner !== null,
  };
}
