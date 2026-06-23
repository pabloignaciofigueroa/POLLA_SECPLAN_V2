// Numero correlativo CRONOLOGICO de partido, derivado del fixture completo.
//
// La FIFA asigna `matchNumber` por espectacularidad/horario estelar, no en orden
// correlativo (ej. Qatar-Suiza = 8 se juega antes que Haiti-Escocia = 5). Para la
// app eso desordena el fixture, el grafico de Carrera de Puntaje y la racha. Aqui
// derivamos un numero por orden de dia/hora real (dateUtc), estable sobre los 72
// partidos, que se usa SOLO para mostrar/ordenar en pantalla.
//
// IMPORTANTE: esto es puramente visual. El `matchNumber` FIFA de fixture.json NO
// cambia y sigue siendo lo que viaja a Supabase (columna match_number) y a
// official-results.json. Los JSON son biblia.

/**
 * @param {Array<{ id: string, dateUtc: string, matchNumber: number }>} matches
 * @returns {Map<string, number>} matchId -> numero correlativo cronologico (1..N)
 */
export function buildMatchSequence(matches = []) {
  // Orden estable total: dateUtc -> matchNumber -> matchId. El ultimo desempate
  // (matchId) cubre el caso raro de mismo dateUtc Y mismo matchNumber (no deberia
  // pasar) para que el numero correlativo nunca dependa del orden del array de
  // entrada. NUNCA se usa un timestamp de finalizacion / carga aqui.
  const ordered = [...matches].sort(
    (a, b) =>
      new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime() ||
      (a.matchNumber ?? 0) - (b.matchNumber ?? 0) ||
      String(a.id).localeCompare(String(b.id))
  );
  const byId = new Map();
  ordered.forEach((match, index) => {
    if (match && match.id) byId.set(match.id, index + 1);
  });
  return byId;
}

/** Etiqueta a dos digitos: 1 -> "01". */
export const padLabel = (value) => String(value ?? "").padStart(2, "0");
