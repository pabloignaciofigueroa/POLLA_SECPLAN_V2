import assert from "node:assert/strict";
import test from "node:test";

import { buildGroupBonuses, GROUP_BONUS } from "../src/lib/scoring/groupBonuses.js";

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP_A = { id: "A", label: "Grupo A", teams: ["a", "b", "c", "d"].map(team) };
const GROUP_B = { id: "B", label: "Grupo B", teams: ["e", "f", "g", "h"].map(team) };

// Fechas reales para que los DOS finales de 3a fecha sean inequivocos (mayor dateUtc).
// Finales del grupo A = a3 (a vs d) + a4 (b vs c); del grupo B = b3 + b4.
const D1 = "2026-06-11T18:00:00Z";
const D2 = "2026-06-15T18:00:00Z";
const D3 = "2026-06-19T18:00:00Z"; // 3a fecha (finales)
const mt = (id, groupId, home, away, dateUtc) => ({
  id,
  groupId,
  dateUtc,
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const FIXTURE = {
  matches: [
    mt("a1", "A", "a", "b", D1), mt("a6", "A", "c", "d", D1), // fecha 1
    mt("a2", "A", "a", "c", D2), mt("a5", "A", "b", "d", D2), // fecha 2
    mt("a3", "A", "a", "d", D3), mt("a4", "A", "b", "c", D3), // fecha 3 (finales)
    mt("b1", "B", "e", "f", D1), mt("b6", "B", "g", "h", D1),
    mt("b2", "B", "e", "g", D2), mt("b5", "B", "f", "h", D2),
    mt("b3", "B", "e", "h", D3), mt("b4", "B", "f", "g", D3),
  ],
};
const r = (matchId, h, a) => ({ matchId, homeScore: h, awayScore: a });
// Grupo A oficial completo: a 1o, b 2o.
const OFFICIAL_A = [r("a1", 1, 0), r("a2", 1, 0), r("a3", 1, 0), r("a4", 1, 0), r("a5", 1, 0), r("a6", 1, 0)];
// Solo fechas 1 y 2 oficiales (ningun final iniciado): el grupo sigue BLOQUEADO.
const OFFICIAL_A_PHASES_1_2 = [r("a1", 1, 0), r("a6", 1, 0), r("a2", 1, 0), r("a5", 1, 0)];

const PLAYERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
const QUALIFIED = [
  { playerId: "p1", groupId: "A", position: 1, teamId: "a" }, // acierta 1o
  { playerId: "p1", groupId: "A", position: 2, teamId: "b" }, // acierta 2o
  { playerId: "p2", groupId: "A", position: 1, teamId: "c" }, // falla 1o
  { playerId: "p2", groupId: "A", position: 2, teamId: "d" }, // falla 2o
  // p3 NO tiene prediccion de clasificado en A (test no-crash)
];

const lineFor = (lines, playerId, evento) =>
  lines.find((l) => l.playerId === playerId && l.evento === evento && l.group === "A");

test("final: 1o correcto +1, 2o correcto +3, fallos 0; estado final", () => {
  const { lines } = buildGroupBonuses({
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: OFFICIAL_A,
    closuresByGroup: { A: { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" } },
  });

  const p1First = lineFor(lines, "p1", "first");
  const p1Second = lineFor(lines, "p1", "second");
  assert.equal(p1First.puntos, GROUP_BONUS.first);
  assert.equal(p1First.regla, "group_first");
  assert.equal(p1First.estado, "final");
  assert.equal(p1First.groupState, "final");
  assert.equal(p1Second.puntos, GROUP_BONUS.second);
  assert.equal(p1Second.regla, "group_second");

  const p2First = lineFor(lines, "p2", "first");
  const p2Second = lineFor(lines, "p2", "second");
  assert.equal(p2First.puntos, 0);
  assert.equal(p2First.regla, "group_miss");
  assert.equal(p2Second.puntos, 0);

  // suma p1 = +4
  const p1Total = lines.filter((l) => l.playerId === "p1").reduce((s, l) => s + l.puntos, 0);
  assert.equal(p1Total, 4);
});

test("jugador sin prediccion de clasificado -> group_miss, sin crash", () => {
  const { lines, byGroup } = buildGroupBonuses({
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: OFFICIAL_A,
    closuresByGroup: { A: { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" } },
  });
  const p3First = lineFor(lines, "p3", "first");
  const p3Second = lineFor(lines, "p3", "second");
  assert.equal(p3First.regla, "group_miss");
  assert.equal(p3First.puntos, 0);
  assert.equal(p3Second.regla, "group_miss");
  // predictedTeamId vive en la linea rica (byGroup), no en la linea del ledger.
  const p3FirstRich = byGroup.A.find((l) => l.playerId === "p3" && l.evento === "first");
  assert.equal(p3FirstRich.predictedTeamId, null);
})

test("projected: 1 FINAL en vivo -> estado provisional, groupState in_definition", () => {
  const { lines } = buildGroupBonuses({
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [],
    // a3 (a vs d) y a4 (b vs c) son los FINALES; con a 1o y b 2o provisional.
    live: [r("a3", 1, 0), r("a4", 1, 0)],
  });
  const p1First = lineFor(lines, "p1", "first");
  assert.equal(p1First.estado, "provisional");
  assert.equal(p1First.groupState, "in_definition");
  assert.equal(p1First.regla, "group_first"); // a va 1o provisional y p1 predijo a
});

test("BLOQUEADO: fechas 1-2 jugadas pero ningun final -> sin lineas", () => {
  const { byGroup, lines } = buildGroupBonuses({
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: OFFICIAL_A_PHASES_1_2, // a1,a6,a2,a5 oficiales; a3/a4 (finales) pendientes
  });
  assert.equal(byGroup.A, undefined, "grupo con solo fechas 1-2 -> BLOQUEADO, sin bonos");
  assert.equal(lines.length, 0);
});

test("grupo no empezado no genera lineas", () => {
  const { byGroup, lines } = buildGroupBonuses({
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A, GROUP_B],
    fixture: FIXTURE,
    official: OFFICIAL_A,
    closuresByGroup: { A: { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" } },
  });
  assert.ok(byGroup.A, "A cerrado -> tiene lineas");
  assert.equal(byGroup.B, undefined, "B no empezado -> sin lineas");
  assert.equal(lines.some((l) => l.group === "B"), false);
});

test("idempotente: mismas entradas -> mismas claves y puntos", () => {
  const args = {
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: OFFICIAL_A,
    closuresByGroup: { A: { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" } },
  };
  const a = buildGroupBonuses(args);
  const b = buildGroupBonuses(args);
  assert.deepEqual(
    a.lines.map((l) => [l.key, l.puntos, l.estado]),
    b.lines.map((l) => [l.key, l.puntos, l.estado])
  );
  // claves unicas
  const keys = a.lines.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length);
});
