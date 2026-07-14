// Topologia de la llave para el render tipo "arbol espejo" - modulo ESM puro (sin DOM).
//
// A partir de knockout-matches.matches (P73-P104) reconstruye la estructura del bracket
// SOLO desde el encadenamiento `winnerTo` (no hardcodea ids):
//   - LEFT  = subarbol que alimenta la SF izquierda  (P101)
//   - RIGHT = subarbol que alimenta la SF derecha     (P102)
//   - CENTER= Final (round "F", P104) + Tercer puesto (round "3P", P103)
//
// El orden vertical de cada ronda NO es por bracketSlot plano: es el recorrido
// POST-ORDEN del arbol (los feeders de cada cruce ordenados por bracketSlot ascendente),
// de modo que las parejas que alimentan un mismo cruce quedan adyacentes y los conectores
// calzan. Para R32 esto reproduce el orden de referencia
//   LEFT  = [P74,P77,P73,P75,P83,P84,P81,P82]
//   RIGHT = [P76,P78,P79,P80,P86,P88,P85,P87]

// ETAPA SEMIFINALES: 16avos (R32), octavos (R16) y cuartos (QF) YA se jugaron y se OCULTAN del
// árbol visual. La Semifinal (SF) queda como única columna por lado (izquierda y derecha) y el
// CENTRO —Final + Tercer puesto— toma el protagonismo. (El bracket completo sigue en datos y en
// `buildBracketTree`; acá solo se decide qué rondas se renderizan por lado.)
const SIDE_ROUNDS = ["SF"];

/** Mapa targetId -> [matches que lo alimentan], cada lista ordenada por bracketSlot asc. */
function buildFeederIndex(matches) {
  const feeders = new Map();
  for (const m of matches) {
    const target = m?.winnerTo;
    if (!target) continue;
    if (!feeders.has(target)) feeders.set(target, []);
    feeders.get(target).push(m);
  }
  for (const list of feeders.values()) {
    list.sort(
      (a, b) =>
        (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0) ||
        (a.matchNumber ?? 0) - (b.matchNumber ?? 0),
    );
  }
  return feeders;
}

/** Recolecta un lado del arbol desde su raiz (la SF), en orden post-orden por ronda. */
function collectSide(rootId, byId, feeders) {
  const buckets = { R32: [], R16: [], QF: [], SF: [] };
  const seen = new Set();
  const walk = (id) => {
    if (!id || seen.has(id)) return; // guarda anti-ciclo (la llave es un DAG)
    seen.add(id);
    const match = byId.get(id);
    if (!match) return;
    for (const feeder of feeders.get(id) ?? []) walk(feeder.id);
    if (buckets[match.round]) buckets[match.round].push(match);
  };
  walk(rootId);
  return buckets;
}

/**
 * Construye la topologia del arbol espejo.
 * @param {Array} matches  knockout-matches.matches (objetos crudos, sin resolver)
 * @returns {{ left:Object, right:Object, center:{final:Object|null, third:Object|null}, roots:{left:string|null,right:string|null} }}
 *   left/right = { R32:[...m], R16:[...m], QF:[...m], SF:[m] } en orden vertical (top->bottom).
 */
export function buildBracketTree(matches = []) {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const feeders = buildFeederIndex(matches);

  const finalMatch = matches.find((m) => m.round === "F") ?? null;
  const thirdMatch = matches.find((m) => m.round === "3P") ?? null;

  // Raices de cada lado: las SF de origen de la Final; fallback = SF ordenadas por bracketSlot.
  const sfSorted = matches
    .filter((m) => m.round === "SF")
    .slice()
    .sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0));
  const leftRootId = finalMatch?.slotA?.from ?? sfSorted[0]?.id ?? null;
  const rightRootId = finalMatch?.slotB?.from ?? sfSorted[1]?.id ?? null;

  return {
    left: collectSide(leftRootId, byId, feeders),
    right: collectSide(rightRootId, byId, feeders),
    center: { final: finalMatch, third: thirdMatch },
    roots: { left: leftRootId, right: rightRootId },
  };
}

/** Rondas de un lado, de afuera hacia el centro (R32 -> SF). Util para iterar en el render. */
export const sideRoundsOrder = SIDE_ROUNDS;
