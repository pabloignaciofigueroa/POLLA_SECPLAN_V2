// Resolucion de la llave eliminatoria - modulo ESM puro (sin DOM). Modo local.
//
// Dado el set de cruces (knockout-matches) + resultados oficiales + asignaciones de
// placeholders, resuelve CADA slot a un equipo concreto cuando se puede:
//   - type "team"            -> el code es el equipo (o el code asignado si era placeholder)
//   - type "group"/"third"   -> se resuelve via slotAssignments[code] (1L/2K/3CEFHI -> code real)
//   - type "winner"          -> ganador del cruce 'from' (recursivo)
//   - type "runner-up"       -> perdedor del cruce 'from' (recursivo)
// Propaga los ganadores ronda a ronda y desbloquea progresivamente: un cruce es
// predecible cuando AMBOS lados son equipos concretos y todavia NO se jugo.
import { resolveSlot } from "./canPredict.js";

/** Normaliza results (array o map) a un map matchId -> { homeScore, awayScore, winner }. */
export function normalizeResults(results) {
  if (!results) return {};
  if (Array.isArray(results)) {
    const map = {};
    for (const r of results) if (r && r.matchId) map[r.matchId] = r;
    return map;
  }
  return results;
}

/** Lado que avanza de un resultado: explicito o inferido del marcador (null si empate sin avance). */
export function resultWinnerSide(result) {
  if (!result) return null;
  if (result.winner === "home" || result.winner === "away") return result.winner;
  const h = Number(result.homeScore);
  const a = Number(result.awayScore);
  if (Number.isFinite(h) && Number.isFinite(a) && h !== a) return h > a ? "home" : "away";
  return null;
}

function resolveSideTeamCode(matchId, side, ctx, seen) {
  if (seen.has(matchId)) return null; // guarda anti-ciclo (la llave es un DAG)
  seen.add(matchId);
  const match = ctx.matchById.get(matchId);
  if (!match) return null;
  const slot = side === "home" ? match.slotA : match.slotB;
  return resolveSlotCode(slot, ctx, seen);
}

/** Devuelve el CODE del equipo concreto de un slot, o null si aun no se resuelve. */
export function resolveSlotCode(slot, ctx, seen = new Set()) {
  if (!slot) return null;
  if (slot.type === "team") {
    // Un slot "team" trae el code definitivo; igual respetamos una asignacion si existiera.
    return ctx.assignments[slot.code] ?? slot.code ?? null;
  }
  if (slot.type === "group" || slot.type === "third") {
    return ctx.assignments[slot.code] ?? null;
  }
  if (slot.type === "winner" || slot.type === "runner-up") {
    const result = ctx.results[slot.from];
    // El cuadro solo AVANZA con resultados FINALIZADOS: un marcador EN VIVO no mueve equipos.
    if (result && result.status === "live") return null;
    const side = resultWinnerSide(result);
    if (!side) return null;
    const wanted = slot.type === "winner" ? side : side === "home" ? "away" : "home";
    return resolveSideTeamCode(slot.from, wanted, ctx, new Set(seen));
  }
  return null;
}

function buildResolvedSlot(slot, code, teamsByCode) {
  if (code) {
    const team = teamsByCode?.get?.(code);
    return {
      code,
      name: team?.name ?? code,
      shortCode: team?.shortCode ?? code,
      flag: team?.flag ?? null,
      crest: team?.crest ?? null,
      coverImage: team?.coverImage ?? null,
      concrete: true,
    };
  }
  // Sin resolver: usar el display de placeholder (label "Ganador P74" / "3º C/E/F/H/I").
  return resolveSlot(slot, teamsByCode);
}

/**
 * Resuelve toda la llave.
 * @param {Array}  matches      knockout-matches.matches
 * @param {object} opts
 * @param {object} [opts.assignments]  { "3CEFHI": "POR", "1L": "ENG", ... }
 * @param {Array|object} [opts.results]  resultados por matchId
 * @param {Map}    [opts.teamsByCode]  buildTeamsByCode(teams.json)
 * @returns {Array} items { match, slotA, slotB, codeA, codeB, predictionEnabled, played, winnerCode, loserCode }
 */
export function resolveBracket(matches = [], { assignments = {}, results = {}, teamsByCode } = {}) {
  const ctx = {
    matchById: new Map(matches.map((m) => [m.id, m])),
    assignments: assignments ?? {},
    results: normalizeResults(results),
  };

  return matches.map((match) => {
    const codeA = resolveSlotCode(match.slotA, ctx);
    const codeB = resolveSlotCode(match.slotB, ctx);
    const result = ctx.results[match.id];
    const side = resultWinnerSide(result);
    // "played" = cruce CERRADO/finalizado: avanza el cuadro, deriva podio y sale de "próximo".
    // Un marcador EN VIVO suma puntos PROVISIONAL (scoring) pero NO está "played".
    const isFinal = Boolean(result) && result.status !== "live";
    const played = Boolean(side) && isFinal;
    const winnerCode = played ? (side === "home" ? codeA : codeB) : null;
    const loserCode = played ? (side === "home" ? codeB : codeA) : null;

    return {
      match,
      slotA: buildResolvedSlot(match.slotA, codeA, teamsByCode),
      slotB: buildResolvedSlot(match.slotB, codeB, teamsByCode),
      codeA,
      codeB,
      // Desbloqueo progresivo: predecible cuando ambos lados son concretos y no se jugo.
      predictionEnabled: Boolean(codeA) && Boolean(codeB) && !played,
      played,
      winnerCode,
      loserCode,
    };
  });
}

/**
 * Deriva el podio EN VIVO: igual que deriveActualPodium, pero un marcador EN CURSO ya define
 * ganador PROVISIONAL (P104 -> campeon/subcampeon, P103 -> 3o/4o). Misma convencion que el
 * puntaje por cruce, que tambien suma provisional y cambia con cada gol.
 *
 * NO altera el cuadro: `resolveBracket` sigue sin avanzar equipos con marcador en vivo. Aca solo
 * se leen `codeA`/`codeB` (que YA estan resueltos, porque dependen de rondas anteriores cerradas)
 * y se decide el lado con el marcador actual. Empate en curso => sin ganador (null): no se inventa.
 *
 * @returns {{champion,runnerUp,third,fourth, live:{champion,runnerUp,third,fourth}}}
 *          `live[slot] = true` => provisional (partido en curso), para marcarlo en la UI.
 */
export function deriveLivePodium(matches = [], { assignments = {}, results = {}, teamsByCode } = {}) {
  const items = resolveBracket(matches, { assignments, results, teamsByCode });
  const byId = new Map(items.map((it) => [it.match.id, it]));
  const map = normalizeResults(results);

  const sidesOf = (matchId) => {
    const item = byId.get(matchId);
    if (!item) return null;
    const result = map[matchId];
    const side = resultWinnerSide(result); // null si empate o sin marcador
    if (!side) return null;
    return {
      winner: (side === "home" ? item.codeA : item.codeB) ?? null,
      loser: (side === "home" ? item.codeB : item.codeA) ?? null,
      live: Boolean(result) && result.status === "live",
    };
  };

  const final = sidesOf("P104");
  const third = sidesOf("P103");
  return {
    champion: final?.winner ?? null,
    runnerUp: final?.loser ?? null,
    third: third?.winner ?? null,
    fourth: third?.loser ?? null,
    live: {
      champion: Boolean(final?.live),
      runnerUp: Boolean(final?.live),
      third: Boolean(third?.live),
      fourth: Boolean(third?.live),
    },
  };
}

/** Deriva el podio REAL desde los resultados: Final (P104) -> campeon/subcampeon, 3er puesto (P103) -> 3o/4o. */
export function deriveActualPodium(matches = [], { assignments = {}, results = {}, teamsByCode } = {}) {
  const items = resolveBracket(matches, { assignments, results, teamsByCode });
  const byId = new Map(items.map((it) => [it.match.id, it]));
  const final = byId.get("P104");
  const third = byId.get("P103");
  return {
    champion: final?.winnerCode ?? null,
    runnerUp: final?.loserCode ?? null,
    third: third?.winnerCode ?? null,
    fourth: third?.loserCode ?? null,
  };
}
