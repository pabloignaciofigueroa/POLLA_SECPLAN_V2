// Motor de diff "Que cambio" (F8, SOLO LECTURA).
//
// F8 NO recalcula puntaje ni re-gatea: LEE dos snapshots consecutivos (el ANTERIOR y
// el ACTUAL) que el recompute de /proximo-partido YA produjo con las libs F0-F5 y narra
// las DIFERENCIAS. Cero formula nueva: toda cifra mostrada proviene de
//   - effectiveByMatch  (resolveEffectiveResults: marcadores efectivos por partido),
//   - situations        (computeGroupSituation por grupo EN DEFINICION; first/second/standings),
//   - byPlayer          (buildPointLedger().byPlayer: official/projected/lines),
//   - ranking           (orden de jugadores derivado por projected; lectura, no puntaje).
//
// INVARIANTE: la cronologia se arma por DIFERENCIA de snapshots EN EL CLIENTE; el `ts`
// del libro es best-effort y NO se usa como linea de tiempo. El orden de los eventos de
// un mismo snapshot es deterministico: goles -> reordenamientos -> impactos. Entre
// snapshots, manda el orden de llegada (lo decide quien acumula la lista, no este motor).
//
// INVARIANTE (gate heredado de la fundacion): los eventos de 1o/2o (reorder y la parte
// `group` del impacto) SOLO se narran para grupos EN DEFINICION. Este motor solo mira los
// grupos presentes en `situations`; ademas se defiende exigiendo definitionStarted/final.

/** @typedef {{ homeScore:number, awayScore:number, official?:boolean }} EffectiveResult */
/** @typedef {import('../scoring/types').GroupSituation} GroupSituation */

/**
 * @typedef {object} ChangeSnapshot
 * @property {Map<string, EffectiveResult>} effectiveByMatch  marcadores efectivos por matchId.
 * @property {Record<string, GroupSituation>} situations      situacion por grupo EN DEFINICION.
 * @property {Record<string, {official:number, projected:number, lines:object[]}>} byPlayer
 * @property {string[]} ranking                               orden de jugadores (mejor primero).
 */

/**
 * @typedef {object} ChangeEvent
 * @property {"goal"|"reorder"|"impact"|"none"} type
 * @property {string} text                 frase corta y legible.
 * @property {"up"|"down"|"neutral"} sign   signo del impacto (verde/rojo/gris).
 * @property {number} [delta]              variacion numerica cuando aplica.
 * @property {string} [group]              groupId afectado.
 * @property {string} [matchId]            partido afectado.
 * @property {string} [playerId]          jugador afectado (impact/none).
 * @property {object} [meta]              datos auxiliares para la UI (no obligatorios).
 */

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const signOf = (delta) => (delta > 0 ? "up" : delta < 0 ? "down" : "neutral");

const codeFor = (teamId, teamLabels) =>
  teamLabels?.[teamId] ?? (teamId == null ? "—" : String(teamId).toUpperCase());

const fmtSigned = (n) => (n > 0 ? `+${n}` : String(n));

// Marcador efectivo -> "h-a" estable para comparar y narrar.
const scoreKey = (eff) => (eff ? `${eff.homeScore}-${eff.awayScore}` : null);

// Etiqueta de partido "LOC-VIS" usando el fixture (orden home/away estable).
function matchLabel(matchId, matchById, teamLabels) {
  const match = matchById.get(matchId);
  if (!match) return matchId;
  const home = codeFor(match.homeTeam?.id, teamLabels);
  const away = codeFor(match.awayTeam?.id, teamLabels);
  return `${home}-${away}`;
}

// Orden de 1o/2o de un standings (solo para detectar reordenamiento por orden, no solo
// por first/second). Devuelve la lista de teamIds en el orden de la tabla.
const standingsOrder = (sit) =>
  Array.isArray(sit?.standings) ? sit.standings.map((row) => row.teamId) : [];

/**
 * Detecta eventos GOAL: un partido cuyo marcador efectivo cambio entre prev y curr.
 * Incluye el primer marcador (de "sin marcador" a "0-0" o cualquiera).
 * @returns {ChangeEvent[]}
 */
function detectGoals({ prev, curr, matchById, teamLabels }) {
  const events = [];
  const prevByMatch = prev?.effectiveByMatch ?? new Map();
  const currByMatch = curr?.effectiveByMatch ?? new Map();
  // Recorremos en el orden del fixture (estable) los partidos presentes en curr.
  const ids = Array.from(currByMatch.keys()).sort((a, b) => {
    const ma = matchById.get(a);
    const mb = matchById.get(b);
    const da = Date.parse(ma?.dateUtc ?? "") || 0;
    const db = Date.parse(mb?.dateUtc ?? "") || 0;
    return da - db || String(a).localeCompare(String(b));
  });
  for (const matchId of ids) {
    const before = prevByMatch.get(matchId) ?? null;
    const after = currByMatch.get(matchId) ?? null;
    const beforeKey = scoreKey(before);
    const afterKey = scoreKey(after);
    if (afterKey === null) continue;
    if (beforeKey === afterKey) continue; // sin cambio de marcador
    const label = matchLabel(matchId, matchById, teamLabels);
    const text =
      beforeKey === null
        ? `${label}: marcador ${afterKey}`
        : `${label}: ${beforeKey} -> ${afterKey}`;
    events.push({
      type: "goal",
      text,
      sign: "neutral",
      matchId,
      group: matchById.get(matchId)?.groupId ?? undefined,
      meta: { before: beforeKey, after: afterKey, official: !!after.official },
    });
  }
  return events;
}

// Un grupo cuenta como EN DEFINICION para narrar 1o/2o (defensa extra sobre el gate
// heredado: el recompute ya solo puebla situations de grupos en definicion).
const isNarratableGroup = (sit) =>
  !!sit && (sit.definitionStarted !== false || sit.state === "final");

/**
 * Detecta eventos REORDER: en un grupo EN DEFINICION cambio first/second o el orden de la
 * tabla. NUNCA emite para grupos bloqueados (no estan en `situations` y ademas se filtran).
 * @returns {ChangeEvent[]}
 */
function detectReorders({ prev, curr, teamLabels }) {
  const events = [];
  const prevSit = prev?.situations ?? {};
  const currSit = curr?.situations ?? {};
  for (const groupId of Object.keys(currSit)) {
    const after = currSit[groupId];
    if (!isNarratableGroup(after)) continue; // gate heredado: solo grupos en definicion
    const before = prevSit[groupId] ?? null;
    if (!before) continue; // primera aparicion del grupo: no es un "reordenamiento"
    const firstChanged = before.first !== after.first;
    const secondChanged = before.second !== after.second;
    const orderChanged =
      standingsOrder(before).join(">") !== standingsOrder(after).join(">");
    if (!firstChanged && !secondChanged && !orderChanged) continue;
    const first = codeFor(after.first, teamLabels);
    const second = codeFor(after.second, teamLabels);
    events.push({
      type: "reorder",
      text: `Se reordena el Grupo ${groupId}: 1o ${first}, 2o ${second}`,
      sign: "neutral",
      group: groupId,
      meta: {
        prevFirst: before.first ?? null,
        prevSecond: before.second ?? null,
        first: after.first ?? null,
        second: after.second ?? null,
        firstChanged,
        secondChanged,
      },
    });
  }
  return events;
}

// Suma de puntos por origen ('match' | 'group') de las lineas de un jugador. LEE el
// libro; no recalcula nada (cada linea ya trae `puntos` del ledger). Anulado aporta 0.
function pointsByOrigin(byPlayerEntry) {
  const acc = { match: 0, group: 0, total: 0 };
  for (const line of byPlayerEntry?.lines ?? []) {
    if (line?.estado === "anulado") continue;
    const pts = num(line.puntos);
    acc.total += pts;
    if (line.origen === "group") acc.group += pts;
    else acc.match += pts;
  }
  return acc;
}

const rankOf = (ranking, playerId) => {
  const idx = Array.isArray(ranking) ? ranking.indexOf(playerId) : -1;
  return idx >= 0 ? idx + 1 : null;
};

/**
 * Detecta eventos IMPACT por jugador: cambio en projected (descompuesto en partido vs
 * 1o/2o) y/o cambio de puesto en el ranking. Signo segun el neto. Determinista por
 * orden de `players`.
 * @returns {ChangeEvent[]}
 */
function detectImpacts({ prev, curr, players, playerLabels }) {
  const events = [];
  const prevBy = prev?.byPlayer ?? {};
  const currBy = curr?.byPlayer ?? {};
  for (const player of players) {
    const pid = player.id;
    const beforeEntry = prevBy[pid] ?? null;
    const afterEntry = currBy[pid] ?? null;
    if (!afterEntry) continue;
    const name = playerLabels?.[pid] ?? player.name ?? pid;

    const beforeProjected = num(beforeEntry?.projected);
    const afterProjected = num(afterEntry.projected);
    const deltaTotal = afterProjected - beforeProjected;

    const beforeSplit = pointsByOrigin(beforeEntry);
    const afterSplit = pointsByOrigin(afterEntry);
    const deltaMatch = afterSplit.match - beforeSplit.match;
    const deltaGroup = afterSplit.group - beforeSplit.group;

    const beforeRank = rankOf(prev?.ranking, pid);
    const afterRank = rankOf(curr?.ranking, pid);
    const rankMoved = beforeRank != null && afterRank != null && beforeRank !== afterRank;

    if (deltaTotal === 0 && !rankMoved) continue; // sin cambios: no emite IMPACT (ver detectNone)

    // Descomposicion legible (partido y/o clasificado), solo de lo que se movio.
    const parts = [];
    if (deltaMatch !== 0) parts.push(`${fmtSigned(deltaMatch)} por marcador`);
    if (deltaGroup !== 0) parts.push(`${fmtSigned(deltaGroup)} por 1o/2o`);
    let text;
    if (parts.length) {
      text = `${name}: ${parts.join(", ")} (proyectado ${fmtSigned(deltaTotal)})`;
    } else {
      text = `${name}: proyectado ${fmtSigned(deltaTotal)}`;
    }
    if (rankMoved) {
      const dir = afterRank < beforeRank ? "sube" : "baja";
      text += ` · ${dir} al ${afterRank}o puesto`;
    }

    events.push({
      type: "impact",
      text,
      sign: signOf(deltaTotal !== 0 ? deltaTotal : (beforeRank ?? 0) - (afterRank ?? 0)),
      delta: deltaTotal,
      playerId: pid,
      meta: {
        deltaMatch,
        deltaGroup,
        projected: afterProjected,
        official: num(afterEntry.official),
        beforeRank,
        afterRank,
      },
    });
  }
  return events;
}

/**
 * El "0" se explica: para un jugador estable tras un evento, emite un item informativo
 * "sin cambios" con el motivo. Solo se usa cuando se pide el detalle de UN jugador (filtro
 * "Mi jugador"), por eso es opt-in via `forPlayerId`.
 * @returns {ChangeEvent[]}
 */
function detectNone({ prev, curr, forPlayerId, playerLabels }) {
  if (!forPlayerId) return [];
  const beforeEntry = prev?.byPlayer?.[forPlayerId] ?? null;
  const afterEntry = curr?.byPlayer?.[forPlayerId] ?? null;
  if (!afterEntry) return [];
  const deltaTotal = num(afterEntry.projected) - num(beforeEntry?.projected);
  const beforeRank = rankOf(prev?.ranking, forPlayerId);
  const afterRank = rankOf(curr?.ranking, forPlayerId);
  const rankMoved = beforeRank != null && afterRank != null && beforeRank !== afterRank;
  if (deltaTotal !== 0 || rankMoved) return [];
  const name = playerLabels?.[forPlayerId] ?? forPlayerId;
  return [
    {
      type: "none",
      text: `${name}: sin cambios (tu pronostico no se vio afectado)`,
      sign: "neutral",
      delta: 0,
      playerId: forPlayerId,
      meta: { projected: num(afterEntry.projected) },
    },
  ];
}

/**
 * Construye la lista de eventos NUEVOS entre dos snapshots consecutivos. Funcion pura y
 * testeable con node. NO recalcula puntaje ni usa el `ts` del libro.
 *
 * @param {object} input
 * @param {ChangeSnapshot} input.prev   snapshot anterior (puede ser vacio en el primero).
 * @param {ChangeSnapshot} input.curr   snapshot actual.
 * @param {object[]} [input.players]    [{id,name}] orden estable para determinismo.
 * @param {any} [input.fixture]         fixture (para etiquetas de partido).
 * @param {Record<string,string>} [input.teamLabels]   teamId -> shortCode (display).
 * @param {Record<string,string>} [input.playerLabels] playerId -> name (display).
 * @param {string|null} [input.forPlayerId]  si se pasa, agrega el "sin cambios" (filtro Mi jugador).
 * @returns {ChangeEvent[]}  goles, luego reordenamientos, luego impactos (y none al final).
 */
export function buildChangeEvents({
  prev = null,
  curr = null,
  players = [],
  fixture = null,
  teamLabels = {},
  playerLabels = {},
  forPlayerId = null,
} = {}) {
  if (!curr) return [];
  const matchList = Array.isArray(fixture) ? fixture : fixture?.matches ?? [];
  const matchById = new Map(matchList.map((match) => [match.id, match]));

  // Orden deterministico dentro del snapshot: goles -> reordenamientos -> impactos -> none.
  const goals = detectGoals({ prev, curr, matchById, teamLabels });
  const reorders = detectReorders({ prev, curr, teamLabels });
  const impacts = detectImpacts({ prev, curr, players, playerLabels });
  const none = detectNone({ prev, curr, forPlayerId, playerLabels });

  return [...goals, ...reorders, ...impacts, ...none];
}

/**
 * Deriva el ranking (orden de jugadores por projected, mejor primero) desde byPlayer.
 * LECTURA: no recalcula puntaje, solo ordena cifras ya producidas por el ledger.
 * Desempate estable por el orden de `players` para que el puesto sea deterministico.
 * @param {Record<string,{projected:number}>} byPlayer
 * @param {object[]} players  [{id}] orden estable.
 * @returns {string[]} playerIds ordenados.
 */
export function deriveRanking(byPlayer, players = []) {
  const order = new Map(players.map((player, index) => [player.id, index]));
  return players
    .map((player) => player.id)
    .filter((id) => byPlayer?.[id])
    .sort((a, b) => {
      const pa = num(byPlayer[a]?.projected);
      const pb = num(byPlayer[b]?.projected);
      if (pb !== pa) return pb - pa;
      return (order.get(a) ?? 0) - (order.get(b) ?? 0);
    });
}
