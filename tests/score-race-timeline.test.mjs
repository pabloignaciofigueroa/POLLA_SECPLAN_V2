import assert from "node:assert/strict";
import test from "node:test";
import { buildScoreRaceTimeline } from "../src/lib/statistics/buildScoreRaceTimeline.js";
import { buildScoreRaceNarrative } from "../src/lib/statistics/buildScoreRaceNarrative.js";

// Universo sintetico (4 jugadores; D copia a C para forzar un nodo agrupado).
const players = [
  { id: "a", name: "Ana", avatar: "/a.webp", avatarThumb: "/a-thumb.webp" },
  { id: "b", name: "Beto", avatar: "/b.webp" },
  { id: "c", name: "Caco", avatar: "/c.webp" },
  { id: "d", name: "Dino", avatar: "/d.webp" },
];

const team = (code) => ({ id: code.toLowerCase(), name: code, shortCode: code });
const fixture = {
  matches: [
    { id: "match-001", matchNumber: 1, groupId: "A", dateChile: "d1", homeTeam: team("X1"), awayTeam: team("Y1") },
    { id: "match-002", matchNumber: 2, groupId: "A", dateChile: "d2", homeTeam: team("X2"), awayTeam: team("Y2") },
    { id: "match-003", matchNumber: 3, groupId: "A", dateChile: "d3", homeTeam: team("X3"), awayTeam: team("Y3") },
    { id: "match-004", matchNumber: 4, groupId: "A", dateChile: "d4", homeTeam: team("X4"), awayTeam: team("Y4") },
  ],
};

const P = (playerId, matchId, homeScore, awayScore) => ({ playerId, matchId, homeScore, awayScore });
const predictions = [
  // match-001 (resultado 1-0): A exacto unico (lone wolf), B tendencia, C/D miss
  P("a", "match-001", 1, 0), P("b", "match-001", 2, 1), P("c", "match-001", 0, 1), P("d", "match-001", 0, 1),
  // match-002 (resultado 2-2): A tendencia (empate), B/C/D exacto compartido
  P("a", "match-002", 0, 0), P("b", "match-002", 2, 2), P("c", "match-002", 2, 2), P("d", "match-002", 2, 2),
  // match-003 (resultado 0-0): A tendencia, B exacto unico (lone wolf), C/D miss
  P("a", "match-003", 1, 1), P("b", "match-003", 0, 0), P("c", "match-003", 1, 0), P("d", "match-003", 1, 0),
  // match-004 (live 2-1): A exacto unico
  P("a", "match-004", 2, 1), P("b", "match-004", 1, 1), P("c", "match-004", 0, 2), P("d", "match-004", 0, 2),
];

const officialResults = [
  { matchId: "match-001", homeScore: 1, awayScore: 0 },
  { matchId: "match-002", homeScore: 2, awayScore: 2 },
  { matchId: "match-003", homeScore: 0, awayScore: 0 },
];

const byId = (timeline, id) => timeline.players.find((p) => p.playerId === id);

test("eje X = partidos oficiales en orden de matchNumber", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  assert.deepEqual(tl.matches.map((m) => m.matchNumber), [1, 2, 3]);
  assert.equal(tl.matches[0].label, "X1 1-0 Y1");
  assert.equal(tl.matches.every((m) => m.status === "official"), true);
});

test("puntaje respeta 5/3/1/0 (lone wolf, exacto compartido, tendencia, miss)", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  const a = byId(tl, "a");
  const b = byId(tl, "b");
  const c = byId(tl, "c");
  // m1: A exacto unico = 5 (lone_wolf), B tendencia = 1, C miss = 0
  assert.equal(a.totals[0].pointsEarned, 5);
  assert.equal(a.totals[0].hitType, "lone_wolf");
  assert.equal(b.totals[0].pointsEarned, 1);
  assert.equal(b.totals[0].hitType, "tendency");
  assert.equal(c.totals[0].pointsEarned, 0);
  assert.equal(c.totals[0].hitType, "none");
  // m2: B exacto compartido (3 jugadores) = 3
  assert.equal(b.totals[1].pointsEarned, 3);
  assert.equal(b.totals[1].hitType, "exact");
  // m3: B exacto unico = 5
  assert.equal(b.totals[2].pointsEarned, 5);
  assert.equal(b.totals[2].hitType, "lone_wolf");
});

test("el acumulado nunca baja", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  for (const p of tl.players) {
    for (let i = 1; i < p.totals.length; i += 1) {
      assert.ok(p.totals[i].cumulativePoints >= p.totals[i - 1].cumulativePoints);
    }
  }
  // Totales finales: A=5+1+1=7, B=1+3+5=9, C=D=0+3+0=3
  assert.equal(byId(tl, "a").totals[2].cumulativePoints, 7);
  assert.equal(byId(tl, "b").totals[2].cumulativePoints, 9);
  assert.equal(byId(tl, "c").totals[2].cumulativePoints, 3);
  assert.equal(byId(tl, "d").totals[2].cumulativePoints, 3);
  assert.equal(tl.maxCumulative, 9);
});

test("rankAfterMatch correcto en el ultimo partido (B lider, C antes que D por nombre)", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  const last = (id) => byId(tl, id).totals[2].rankAfterMatch;
  assert.equal(last("b"), 1);
  assert.equal(last("a"), 2);
  assert.equal(last("c"), 3);
  assert.equal(last("d"), 4);
});

test("clusters agrupan por matchId + cumulativePoints", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  const m3 = "match-003";
  const tied = tl.clusters.find((cl) => cl.matchId === m3 && cl.cumulativePoints === 3);
  assert.ok(tied, "debe existir un nodo agrupado en match-003 con 3 puntos");
  assert.equal(tied.count, 2);
  assert.deepEqual([...tied.playerIds].sort(), ["c", "d"]);
  // Ningun cluster mezcla puntajes distintos.
  for (const cl of tl.clusters) {
    for (const pid of cl.playerIds) {
      const t = byId(tl, pid).totals.find((x) => x.matchId === cl.matchId);
      assert.equal(t.cumulativePoints, cl.cumulativePoints);
    }
  }
});

test("sin resultados oficiales => timeline vacio", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults: [] });
  assert.equal(tl.matches.length, 0);
  assert.equal(tl.clusters.length, 0);
  assert.equal(tl.maxCumulative, 0);
  assert.equal(tl.players.every((p) => p.totals.length === 0), true);
});

test("live provisional se agrega como ultimo punto con status 'live'", () => {
  const tl = buildScoreRaceTimeline({
    players,
    predictions,
    fixture,
    officialResults,
    liveMatchState: { matchId: "match-004", homeScore: 2, awayScore: 1 },
  });
  assert.equal(tl.matches.length, 4);
  assert.equal(tl.matches[3].matchNumber, 4);
  assert.equal(tl.matches[3].status, "live");
  // A acerto exacto unico el live => +5 provisional
  assert.equal(byId(tl, "a").totals[3].pointsEarned, 5);
});

test("un live ya oficializado no se duplica", () => {
  const tl = buildScoreRaceTimeline({
    players,
    predictions,
    fixture,
    officialResults,
    liveMatchState: { matchId: "match-003", homeScore: 0, awayScore: 0 },
  });
  assert.equal(tl.matches.length, 3); // no agrega un 4to punto
});

test("narrativa: una entrada por partido + relato por jugador, sin inventar en vacio", () => {
  const tl = buildScoreRaceTimeline({ players, predictions, fixture, officialResults });
  const nar = buildScoreRaceNarrative(tl);
  assert.equal(nar.matchNarratives.length, 3);
  assert.equal(typeof nar.playerNarratives.a.body, "string");
  // m1 tiene un Lone Wolf (Ana): debe mencionarlo.
  assert.match(nar.matchNarratives[0].body, /Lone Wolf/i);

  const empty = buildScoreRaceNarrative(buildScoreRaceTimeline({ players, predictions, fixture, officialResults: [] }));
  assert.deepEqual(empty.matchNarratives, []);
  assert.deepEqual(empty.playerNarratives, {});
});
