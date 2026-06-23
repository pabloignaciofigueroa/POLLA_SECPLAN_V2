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

// ── F12: determinismo del historico (Paso A) ────────────────────────────────
// Universo con dateUtc EXPLICITO. Dos finales simultaneos (match-072 y match-071
// comparten dateUtc) para probar el desempate estable matchNumber -> matchId, y un
// par mismo dateUtc + mismo matchNumber para forzar el ultimo recurso (matchId).
const det = {
  // dateUtc fuera de orden a proposito; matchNumber tambien desordenado.
  fixture: {
    matches: [
      { id: "match-070", matchNumber: 70, groupId: "K", dateUtc: "2026-06-26T18:00:00Z", dateChile: "z1", homeTeam: team("K1"), awayTeam: team("K2") },
      // Simultaneos (mismo dateUtc): match-072 tiene matchNumber MAYOR que match-071.
      { id: "match-072", matchNumber: 72, groupId: "K", dateUtc: "2026-06-27T18:00:00Z", dateChile: "z2", homeTeam: team("K3"), awayTeam: team("K4") },
      { id: "match-071", matchNumber: 71, groupId: "K", dateUtc: "2026-06-27T18:00:00Z", dateChile: "z3", homeTeam: team("K5"), awayTeam: team("K6") },
      // Empate total dateUtc + matchNumber con match-073 vs match-073b: desempata matchId.
      { id: "match-073b", matchNumber: 73, groupId: "L", dateUtc: "2026-06-28T18:00:00Z", dateChile: "z4", homeTeam: team("L3"), awayTeam: team("L4") },
      { id: "match-073", matchNumber: 73, groupId: "L", dateUtc: "2026-06-28T18:00:00Z", dateChile: "z5", homeTeam: team("L1"), awayTeam: team("L2") },
    ],
  },
  predictions: [
    P("a", "match-070", 1, 0), P("b", "match-070", 0, 0), P("c", "match-070", 2, 1), P("d", "match-070", 0, 1),
    P("a", "match-071", 1, 0), P("b", "match-071", 1, 0), P("c", "match-071", 0, 0), P("d", "match-071", 2, 2),
    P("a", "match-072", 0, 2), P("b", "match-072", 1, 1), P("c", "match-072", 0, 2), P("d", "match-072", 0, 2),
    P("a", "match-073", 3, 1), P("b", "match-073", 0, 0), P("c", "match-073", 1, 1), P("d", "match-073", 2, 0),
    P("a", "match-073b", 0, 0), P("b", "match-073b", 1, 1), P("c", "match-073b", 0, 0), P("d", "match-073b", 2, 2),
  ],
};
const detOfficial = [
  { matchId: "match-070", homeScore: 1, awayScore: 0 },
  { matchId: "match-071", homeScore: 1, awayScore: 0 },
  { matchId: "match-072", homeScore: 0, awayScore: 2 },
  { matchId: "match-073", homeScore: 1, awayScore: 1 },
  { matchId: "match-073b", homeScore: 0, awayScore: 0 },
];

// Firma estable de la salida del builder (orden de matches + clusters + totales).
const signatureOf = (tl) =>
  JSON.stringify({
    matches: tl.matches.map((m) => `${m.matchId}:${m.status}:${m.homeScore}-${m.awayScore}`),
    clusters: tl.clusters.map((c) => `${c.matchId}|${c.cumulativePoints}|${[...c.playerIds].join(",")}|${c.maxHitTypeInCluster}`),
    totals: tl.players.map((p) => `${p.playerId}:${p.totals.map((t) => t.cumulativePoints).join("-")}`),
    max: tl.maxCumulative,
  });

const shuffle = (arr, seed) => {
  // Barajado determinista (LCG) para reproducir el test, pero distinto orden de entrada.
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

test("F12 determinismo: eje X estable por dateUtc -> matchNumber -> matchId", () => {
  const tl = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: detOfficial });
  // Orden esperado: 070 (mas temprano), luego los simultaneos 071<072 por matchNumber,
  // luego el empate total 073<073b por matchId.
  assert.deepEqual(
    tl.matches.map((m) => m.matchId),
    ["match-070", "match-071", "match-072", "match-073", "match-073b"]
  );
});

test("F12 determinismo: simultaneas en distinto orden de entrada -> salida identica", () => {
  const orderA = [detOfficial[1], detOfficial[2]]; // [071, 072]
  const orderB = [detOfficial[2], detOfficial[1]]; // [072, 071]
  const tlA = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: orderA });
  const tlB = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: orderB });
  assert.deepEqual(tlA.matches.map((m) => m.matchId), ["match-071", "match-072"]);
  assert.equal(signatureOf(tlA), signatureOf(tlB));
});

test("F12 determinismo: barajar officialResults muchas veces -> salida identica", () => {
  const base = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: detOfficial });
  const baseSig = signatureOf(base);
  for (let seed = 1; seed <= 25; seed += 1) {
    const shuffled = shuffle(detOfficial, seed);
    const tl = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: shuffled });
    assert.equal(signatureOf(tl), baseSig, `barajado seed=${seed} debe dar salida identica`);
  }
});

test("F12 determinismo: mismo dateUtc, distinto matchNumber -> menor matchNumber primero", () => {
  const only = [detOfficial[2], detOfficial[1]]; // [072, 071] (072 tiene matchNumber mayor)
  const tl = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: only });
  assert.deepEqual(tl.matches.map((m) => m.matchNumber), [71, 72]);
});

test("F12 determinismo: mismo dateUtc Y mismo matchNumber -> desempata por matchId", () => {
  const only = [detOfficial[4], detOfficial[3]]; // [073b, 073] (mismo matchNumber 73)
  const tl = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: only });
  // "match-073" < "match-073b" por localeCompare.
  assert.deepEqual(tl.matches.map((m) => m.matchId), ["match-073", "match-073b"]);
});

// ── F12: overlay multi-final en vivo (Paso B) ───────────────────────────────
test("F12 vivo multiple: dos liveMatches -> ambos como nodos status:'live', orden determinista", () => {
  // match-070 oficial; match-071 y match-072 (simultaneos) en vivo a la vez.
  const officials = [{ matchId: "match-070", homeScore: 1, awayScore: 0 }];
  const lives = [
    { matchId: "match-072", homeScore: 0, awayScore: 2 },
    { matchId: "match-071", homeScore: 1, awayScore: 0 },
  ];
  const tl = buildScoreRaceTimeline({ players, predictions: det.predictions, fixture: det.fixture, officialResults: officials, liveMatches: lives });
  assert.deepEqual(tl.matches.map((m) => m.matchId), ["match-070", "match-071", "match-072"]);
  assert.equal(tl.matches[0].status, "official");
  assert.equal(tl.matches[1].status, "live");
  assert.equal(tl.matches[2].status, "live");
  // Orden entre los vivos NO depende del orden de entrada (071 antes que 072).
  const reversed = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: officials,
    liveMatches: [lives[1], lives[0]],
  });
  assert.equal(signatureOf(tl), signatureOf(reversed));
});

test("F12 vivo->oficial: un final que pasa de live a oficial queda en su posicion estable", () => {
  // Con match-071 en vivo: queda al final (despues del oficial match-070).
  const officialsBefore = [{ matchId: "match-070", homeScore: 1, awayScore: 0 }];
  const tlLive = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: officialsBefore,
    liveMatches: [{ matchId: "match-071", homeScore: 1, awayScore: 0 }],
  });
  assert.equal(tlLive.matches.find((m) => m.matchId === "match-071").status, "live");

  // Al oficializar match-071 (mismo marcador), su posicion estable es por dateUtc:
  // 070 < 071. Aqui ambos son del mismo dia distinto, asi que 071 va segundo.
  const tlOfficial = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: [...officialsBefore, { matchId: "match-071", homeScore: 1, awayScore: 0 }],
  });
  assert.deepEqual(tlOfficial.matches.map((m) => m.matchId), ["match-070", "match-071"]);
  assert.equal(tlOfficial.matches.find((m) => m.matchId === "match-071").status, "official");
  // El acumulado del jugador no cambia por haber pasado de live a oficial (mismo marcador).
  const livePts = byId(tlLive, "a").totals.find((t) => t.matchId === "match-071").cumulativePoints;
  const offPts = byId(tlOfficial, "a").totals.find((t) => t.matchId === "match-071").cumulativePoints;
  assert.equal(livePts, offPts);
});

test("F12 compat N=1: liveMatchState singular da la misma salida que liveMatches de uno", () => {
  const officials = [{ matchId: "match-070", homeScore: 1, awayScore: 0 }];
  const singular = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: officials,
    liveMatchState: { matchId: "match-071", homeScore: 1, awayScore: 0 },
  });
  const arrayOfOne = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: officials,
    liveMatches: [{ matchId: "match-071", homeScore: 1, awayScore: 0 }],
  });
  assert.equal(signatureOf(singular), signatureOf(arrayOfOne));
  // El vivo sigue siendo el ultimo nodo (cero regresion vs comportamiento previo).
  assert.equal(singular.matches[singular.matches.length - 1].matchId, "match-071");
  assert.equal(singular.matches[singular.matches.length - 1].status, "live");
});

test("F12 vivo no pisa al oficial del mismo match (oficial gana)", () => {
  const officials = [{ matchId: "match-070", homeScore: 1, awayScore: 0 }];
  const tl = buildScoreRaceTimeline({
    players,
    predictions: det.predictions,
    fixture: det.fixture,
    officialResults: officials,
    liveMatches: [{ matchId: "match-070", homeScore: 5, awayScore: 5 }],
  });
  assert.equal(tl.matches.length, 1);
  assert.equal(tl.matches[0].status, "official");
  assert.equal(tl.matches[0].homeScore, 1);
  assert.equal(tl.matches[0].awayScore, 0);
});
