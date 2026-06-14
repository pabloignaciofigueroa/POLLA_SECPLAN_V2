// Carrera de Puntaje — builder puro del timeline acumulado por jugador.
//
// Fuente unica de puntaje: lib/liveMatch/liveScoring.js (modelo 5/3/1/0). Aqui
// NO se reimplementa el calculo; solo se acumula partido a partido en el orden
// del fixture y se agrupan los nodos empatados.
//
// Entrada (todo ya normalizado; el mapeo homeTeamScore->homeScore se hace en el
// seam del cliente antes de llamar a este builder):
//   players          : [{ id, name, avatar, avatarThumb }]
//   predictions      : [{ playerId, matchId, homeScore, awayScore }]  (flat)
//   fixture          : { matches: [...] }  o  [...]
//   officialResults  : [{ matchId, homeScore, awayScore }]
//   liveMatchState   : { matchId, homeScore, awayScore } | null  (provisional)
//
// Salida: { matches, players, clusters, maxCumulative } (ver README del comanda).

import { calculatePointsForPrediction } from "../liveMatch/liveScoring.js";
import { buildMatchSequence, padLabel } from "../fixture/matchSequence.js";

// Paleta arcade estable (determinista por orden en players.json). No existe un
// token de color por jugador en el proyecto, asi que esta es la fuente unica.
// La linea usa este color de identidad; el NODO usa el color por hitType.
export const RACE_PALETTE = [
  "#126dff", // azul
  "#18ddf2", // cian
  "#7c35ff", // morado
  "#f5b417", // amarillo
  "#16a34a", // verde
  "#ff4d97", // rosa
  "#ff8a1e", // naranja
  "#0ea5e9", // celeste
  "#a855f7", // violeta
  "#22c55e", // verde lima
  "#ef4444", // rojo
  "#14b8a6", // teal
  "#eab308", // dorado
  "#6366f1", // indigo
];

// Prioridad para resolver el color del nodo agrupado (mayor acierto manda).
const HIT_PRIORITY = { lone_wolf: 4, exact: 3, tendency: 2, none: 1, no_info: 0 };

const toInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

export function buildScoreRaceTimeline({
  players = [],
  predictions = [],
  fixture = [],
  officialResults = [],
  liveMatchState = null,
} = {}) {
  const fixtureMatches = Array.isArray(fixture) ? fixture : (fixture?.matches ?? []);
  const matchesById = new Map(fixtureMatches.map((m) => [m.id, m]));
  // Numero correlativo cronologico (1..N) sobre los 72 partidos. El eje X usa
  // este orden/etiqueta, NO el matchNumber FIFA (que mezcla grupos por horario).
  const sequenceById = buildMatchSequence(fixtureMatches);

  // Resultados oficiales normalizados por partido.
  const resultByMatch = new Map();
  for (const result of officialResults) {
    if (!result || !result.matchId) continue;
    const homeScore = toInt(result.homeScore);
    const awayScore = toInt(result.awayScore);
    if (homeScore === null || awayScore === null) continue;
    resultByMatch.set(result.matchId, { homeScore, awayScore, status: "official" });
  }

  // Partido en vivo (provisional) solo si todavia no es oficial.
  let liveResult = null;
  if (liveMatchState && liveMatchState.matchId && !resultByMatch.has(liveMatchState.matchId)) {
    const homeScore = toInt(liveMatchState.homeScore);
    const awayScore = toInt(liveMatchState.awayScore);
    if (homeScore !== null && awayScore !== null) {
      liveResult = { matchId: liveMatchState.matchId, homeScore, awayScore, status: "live" };
    }
  }

  // Eje X: partidos oficiales en orden CRONOLOGICO real (dia/hora), + el live al
  // final. Asi el progreso de puntos sube en el orden en que se vivieron, no en el
  // orden FIFA (que pondria Haiti-Escocia antes que Qatar/Brasil, etc.).
  const orderedMatches = [...resultByMatch.keys()]
    .map((id) => matchesById.get(id))
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime() ||
        a.matchNumber - b.matchNumber
    );
  if (liveResult) {
    const liveMatch = matchesById.get(liveResult.matchId);
    if (liveMatch) orderedMatches.push(liveMatch);
  }

  const matches = orderedMatches.map((m) => {
    const res = liveResult && liveResult.matchId === m.id ? liveResult : resultByMatch.get(m.id);
    const displayNumber = sequenceById.get(m.id) ?? m.matchNumber;
    return {
      matchId: m.id,
      matchNumber: m.matchNumber,
      matchNumberLabel: String(m.matchNumber).padStart(2, "0"),
      // Numero correlativo cronologico para mostrar (P1, P2, ...).
      displayNumber,
      displayNumberLabel: padLabel(displayNumber),
      label: `${m.homeTeam.shortCode} ${res.homeScore}-${res.awayScore} ${m.awayTeam.shortCode}`,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: res.homeScore,
      awayScore: res.awayScore,
      status: res.status, // "official" | "live"
      group: m.groupId,
      dateChile: m.dateChile,
    };
  });

  // Indices de predicciones.
  const predsByMatch = new Map();
  for (const p of predictions) {
    if (!p || !p.matchId) continue;
    const list = predsByMatch.get(p.matchId) ?? [];
    list.push(p);
    predsByMatch.set(p.matchId, list);
  }
  const predByPlayerMatch = new Map(predictions.map((p) => [`${p.playerId}:${p.matchId}`, p]));

  // Solo jugadores con carton (al menos una prediccion). Regla 10.8.
  const playersWithCarton = players.filter((pl) =>
    predictions.some((p) => p.playerId === pl.id)
  );

  const colorFor = (playerId) => {
    const idx = players.findIndex((p) => p.id === playerId);
    return RACE_PALETTE[(idx >= 0 ? idx : 0) % RACE_PALETTE.length];
  };

  // Totales acumulados por jugador, en el orden de `matches`.
  const playerRows = playersWithCarton.map((pl) => {
    let cumulative = 0;
    const totals = matches.map((mt) => {
      const prediction = predByPlayerMatch.get(`${pl.id}:${mt.matchId}`);
      const all = predsByMatch.get(mt.matchId) ?? [];
      const scored = calculatePointsForPrediction(
        prediction,
        { homeScore: mt.homeScore, awayScore: mt.awayScore },
        all
      );
      cumulative += scored.points;
      const predictionLabel =
        prediction && prediction.homeScore != null && prediction.awayScore != null
          ? `${prediction.homeScore}-${prediction.awayScore}`
          : "--";
      return {
        matchId: mt.matchId,
        matchNumber: mt.matchNumber,
        pointsEarned: scored.points,
        cumulativePoints: cumulative,
        hitType: scored.hitType,
        predictionLabel,
        rankAfterMatch: 0,
        movement: "same",
      };
    });
    return {
      playerId: pl.id,
      displayName: pl.name,
      avatar: pl.avatarThumb ?? pl.avatar,
      color: colorFor(pl.id),
      totals,
    };
  });

  // Ranking despues de cada partido + movimiento vs partido anterior.
  for (let i = 0; i < matches.length; i += 1) {
    const ranking = playerRows
      .map((r) => ({ playerId: r.playerId, name: r.displayName, cum: r.totals[i].cumulativePoints }))
      .sort((a, b) => b.cum - a.cum || a.name.localeCompare(b.name));
    const posById = new Map(ranking.map((r, idx) => [r.playerId, idx + 1]));
    for (const r of playerRows) {
      const pos = posById.get(r.playerId);
      r.totals[i].rankAfterMatch = pos;
      const prevPos = i > 0 ? r.totals[i - 1].rankAfterMatch : null;
      r.totals[i].movement =
        prevPos == null ? "new" : pos < prevPos ? "up" : pos > prevPos ? "down" : "same";
    }
  }

  // Nodos agrupados: por (matchId + cumulativePoints). Nunca mezclar puntajes.
  const clusters = [];
  for (let i = 0; i < matches.length; i += 1) {
    const byCumulative = new Map();
    for (const r of playerRows) {
      const t = r.totals[i];
      const entry = byCumulative.get(t.cumulativePoints) ?? { playerIds: [], hit: "no_info" };
      entry.playerIds.push(r.playerId);
      if ((HIT_PRIORITY[t.hitType] ?? 0) > (HIT_PRIORITY[entry.hit] ?? 0)) entry.hit = t.hitType;
      byCumulative.set(t.cumulativePoints, entry);
    }
    for (const [cumulativePoints, entry] of byCumulative) {
      clusters.push({
        matchId: matches[i].matchId,
        matchNumber: matches[i].matchNumber,
        cumulativePoints,
        playerIds: entry.playerIds,
        count: entry.playerIds.length,
        maxHitTypeInCluster: entry.hit,
      });
    }
  }

  const maxCumulative = playerRows.reduce(
    (mx, r) => Math.max(mx, r.totals.length ? r.totals[r.totals.length - 1].cumulativePoints : 0),
    0
  );

  return { matches, players: playerRows, clusters, maxCumulative };
}
