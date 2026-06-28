// Agenda de la llave - modulo ESM puro (sin DOM, sin Date). Modo local.
// Sobre la salida de resolveBracket, encuentra el PROXIMO cruce relevante y los resultados
// recientes. La hora "ahora" se pasa como string "YYYY-MM-DDTHH:mm" (hora Chile) para ser
// determinista/testeable; el cliente la deriva del navegador.

/** Clave cronologica de un item del bracket resuelto. */
export function scheduleKey(item) {
  const m = item?.match ?? {};
  return `${m.dateCL ?? "9999-12-31"}T${m.timeCL ?? "00:00"}`;
}

/**
 * Proximo cruce: el mas temprano que YA tiene ambos equipos concretos y NO se jugo.
 * Si se pasa `nowKey`, prioriza el primero a partir de ahora; si todos pasaron, el ultimo concreto.
 * @param {Array} items   salida de resolveBracket
 * @param {object} [opts]
 * @param {string|null} [opts.nowKey]
 * @returns {object|null}
 */
export function findNextMatch(items = [], { nowKey = null } = {}) {
  const candidates = items
    .filter((it) => it && it.codeA && it.codeB && !it.played)
    .sort((a, b) => scheduleKey(a).localeCompare(scheduleKey(b)));
  if (!candidates.length) return null;
  if (nowKey) {
    const upcoming = candidates.find((it) => scheduleKey(it) >= nowKey);
    return upcoming ?? candidates[candidates.length - 1];
  }
  return candidates[0];
}

/** Resultados recientes (cruces jugados), del mas nuevo al mas viejo. */
export function recentResults(items = [], { limit = 6 } = {}) {
  return items
    .filter((it) => it && it.played)
    .sort((a, b) => scheduleKey(b).localeCompare(scheduleKey(a)))
    .slice(0, limit);
}
