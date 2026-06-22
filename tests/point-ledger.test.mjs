import assert from "node:assert/strict";
import test from "node:test";

import { buildPointLedger } from "../src/lib/scoring/buildPointLedger.js";

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP_A = { id: "A", label: "Grupo A", teams: ["a", "b", "c", "d"].map(team) };
const iso = (min) => new Date(Date.parse("2026-06-20T12:00:00Z") + min * 60000).toISOString();
const mt = (id, n, home, away) => ({
  id,
  matchNumber: n,
  groupId: "A",
  dateUtc: iso(n),
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const FIXTURE = {
  matches: [
    mt("a1", 1, "a", "b"),
    mt("a2", 2, "a", "c"),
    mt("a3", 3, "a", "d"),
    mt("a4", 4, "b", "c"),
    mt("a5", 5, "b", "d"),
    mt("a6", 6, "c", "d"),
  ],
};
const PLAYERS = [{ id: "p1" }, { id: "p2" }];
const off = (matchId, h, a) => ({ matchId, homeScore: h, awayScore: a });
const liveTeam = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a });
const NOW = Date.parse("2026-07-01T00:00:00Z"); // despues de todos los kickoffs

// 1. Totales reconstruidos: oficial = Σfinal, proyectado = Σ(final+prov) ---------

test("totales: oficial = suma de final; proyectado = final + provisional", () => {
  const ledger = buildPointLedger({
    players: PLAYERS,
    predictions: [
      { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 }, // exacto vs 2-1
      { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 0, awayScore: 0 }, // nada
    ],
    qualifiedPredictions: [],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [off("a1", 2, 1)], // a1 oficial 2-1
    live: [liveTeam("a2", 3, 0)], // a2 live 3-0 (a gana en vivo)
    now: NOW,
  });

  // p1: a1 exacto (solo el lo puso) -> lone_wolf 5, FINAL. proyectado incluye lo provisional.
  const p1 = ledger.byPlayer.p1;
  assert.equal(p1.official, 5, "a1 exacto unico = 5 oficial");
  assert.ok(p1.projected >= 5);
  // p2: a1 nada (0) final.
  assert.equal(ledger.byPlayer.p2.official, 0);

  // invariante global: official = Σ final ; projected = Σ (final+prov)
  let sumFinal = 0;
  let sumProjected = 0;
  for (const line of ledger.lines) {
    if (line.estado === "final") {
      sumFinal += line.puntos;
      sumProjected += line.puntos;
    } else if (line.estado === "provisional") {
      sumProjected += line.puntos;
    }
  }
  const totalOfficial = Object.values(ledger.byPlayer).reduce((s, p) => s + p.official, 0);
  const totalProjected = Object.values(ledger.byPlayer).reduce((s, p) => s + p.projected, 0);
  assert.equal(totalOfficial, sumFinal);
  assert.equal(totalProjected, sumProjected);
});

// 2. Lone wolf vs exacto compartido -------------------------------------------

test("lone wolf 5 vs exacto compartido 3", () => {
  const lone = buildPointLedger({
    players: PLAYERS,
    predictions: [
      { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
      { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 0, awayScore: 0 },
    ],
    qualifiedPredictions: [],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [off("a1", 2, 1)],
    now: NOW,
  });
  const p1Lone = lone.lines.find((l) => l.playerId === "p1" && l.evento === "a1");
  assert.equal(p1Lone.regla, "lone_wolf");
  assert.equal(p1Lone.puntos, 5);

  const shared = buildPointLedger({
    players: PLAYERS,
    predictions: [
      { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
      { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
    ],
    qualifiedPredictions: [],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [off("a1", 2, 1)],
    now: NOW,
  });
  const p1Shared = shared.lines.find((l) => l.playerId === "p1" && l.evento === "a1");
  assert.equal(p1Shared.regla, "exact_shared");
  assert.equal(p1Shared.puntos, 3);
});

// 3. Caso contradictorio: gana en el partido, pierde el clasificado ------------
// Estado base: a1-a5 oficiales (a 1o claro), a6 (c-d) en vivo.
// p1 predijo a6 = 2-2 (empate, NO exacto) y 2o de grupo = c.
// X (a6 1-0): c va 2o -> p1 acierta 2o (+3); su a6 da 0 (empate vs home).
// Y (a6 1-1): d sube a 2o, c cae 3o -> p1 falla 2o (0); su a6 pasa a tendencia (+1).
// Neto proyectado de p1: +1 (partido) -3 (clasificado) = -2.

const CONTRA_BASE = {
  players: [{ id: "p1" }],
  predictions: [{ playerId: "p1", matchId: "a6", groupId: "A", homeScore: 2, awayScore: 2 }],
  qualifiedPredictions: [
    { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
    { playerId: "p1", groupId: "A", position: 2, teamId: "c" },
  ],
  groups: [GROUP_A],
  fixture: FIXTURE,
  official: [off("a1", 1, 0), off("a2", 1, 0), off("a3", 1, 0), off("a4", 1, 1), off("a5", 0, 1)],
  now: NOW,
};

test("contradiccion: gana el partido (+1) pero pierde el 2o clasificado (-3) -> neto -2", () => {
  const stateX = buildPointLedger({ ...CONTRA_BASE, live: [liveTeam("a6", 1, 0)] });
  const stateY = buildPointLedger({ ...CONTRA_BASE, live: [liveTeam("a6", 1, 1)] });

  const matchX = stateX.lines.find((l) => l.playerId === "p1" && l.evento === "a6");
  const matchY = stateY.lines.find((l) => l.playerId === "p1" && l.evento === "a6");
  assert.equal(matchX.puntos, 0, "X: 2-2 vs 1-0 no acierta tendencia");
  assert.equal(matchY.puntos, 1, "Y: 2-2 vs 1-1 acierta tendencia empate");
  assert.equal(matchY.regla, "tendency");

  const secondX = stateX.lines.find((l) => l.playerId === "p1" && l.evento === "second");
  const secondY = stateY.lines.find((l) => l.playerId === "p1" && l.evento === "second");
  assert.equal(secondX.puntos, 3, "X: c va 2o -> acierta");
  assert.equal(secondY.puntos, 0, "Y: c cae a 3o -> falla");

  // 1o es 'a' en ambos (constante), aisla el flip del 2o.
  const firstX = stateX.lines.find((l) => l.playerId === "p1" && l.evento === "first");
  assert.equal(firstX.puntos, 1);

  const net = stateY.byPlayer.p1.projected - stateX.byPlayer.p1.projected;
  assert.equal(net, -2, "neto proyectado: +1 partido, -3 clasificado");
  // y el oficial no se movio (todo lo de a6 es provisional / grupo en definicion)
  assert.equal(stateX.byPlayer.p1.official, stateY.byPlayer.p1.official);
});

// 4. Cierre idempotente: grupo final, re-run identico --------------------------

test("cierre idempotente: mismas entradas -> libro identico", () => {
  const args = {
    players: PLAYERS,
    predictions: [{ playerId: "p1", matchId: "a1", groupId: "A", homeScore: 1, awayScore: 0 }],
    qualifiedPredictions: [{ playerId: "p1", groupId: "A", position: 1, teamId: "a" }],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [off("a1", 1, 0), off("a2", 1, 0), off("a3", 1, 0), off("a4", 1, 0), off("a5", 1, 0), off("a6", 1, 0)],
    closuresByGroup: { A: { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" } },
    now: NOW,
  };
  const first = buildPointLedger(args);
  const second = buildPointLedger(args);

  // grupo cerrado -> lineas de grupo en 'final'
  const groupFirst = first.lines.find((l) => l.origen === "group" && l.evento === "first" && l.playerId === "p1");
  assert.equal(groupFirst.estado, "final");
  assert.equal(groupFirst.puntos, 1);

  assert.deepEqual(
    first.lines.map((l) => [l.key, l.puntos, l.estado]),
    second.lines.map((l) => [l.key, l.puntos, l.estado])
  );
});

// 5. Reapertura: invalida sin duplicar ----------------------------------------

test("reapertura: una key invalidada -> 1 anulado(0) + 1 fresca; proyectado solo la fresca", () => {
  const ledger = buildPointLedger({
    players: [{ id: "p1" }],
    predictions: [],
    qualifiedPredictions: [
      { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
      { playerId: "p1", groupId: "A", position: 2, teamId: "b" },
    ],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [off("a1", 1, 0), off("a2", 1, 0), off("a3", 1, 0), off("a4", 1, 0), off("a5", 1, 0), off("a6", 1, 0)],
    closuresByGroup: { A: { state: "reopened", officialFirstTeam: "a", officialSecondTeam: "b" } },
    invalidatedKeys: new Set(["group:A:p1:second"]),
    now: NOW,
  });

  const anulado = ledger.lines.filter((l) => l.estado === "anulado");
  assert.equal(anulado.length, 1, "una sola linea anulada");
  assert.equal(anulado[0].puntos, 0);
  assert.equal(anulado[0].key, "group:A:p1:second:anulado");

  const frescas = ledger.lines.filter((l) => l.key === "group:A:p1:second");
  assert.equal(frescas.length, 1, "una sola linea fresca con la key original (sin duplicar)");

  // proyectado solo cuenta la fresca (anulado aporta 0). a es 1o, b 2o -> first +1, second +3.
  assert.equal(ledger.byPlayer.p1.group.projected, 4);
});
