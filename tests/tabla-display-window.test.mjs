import assert from "node:assert/strict";
import test from "node:test";

import { resolveDisplayWindow, windowImpactForPlayer } from "../src/lib/tabla/resolveDisplayWindow.js";

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.slice(0, 3).toUpperCase() });
const T = "2026-06-24T19:00:00Z"; // ventana simultanea
const T2 = "2026-06-27T19:00:00Z"; // otra hora
const m = (id, groupId, n, h, a, dateUtc, loc = "Stadium") => ({
  id, groupId, matchNumber: n, dateUtc, location: loc, homeTeam: team(h), awayTeam: team(a),
});
// Grupo B: dos finales a la misma hora (T). Grupo C: un partido suelto a otra hora (T2).
const FIXTURE = {
  matches: [
    m("b1", "B", 51, "sui", "can", T),
    m("b2", "B", 52, "bih", "qat", T),
    m("c1", "C", 60, "bra", "mar", T2),
  ],
};
const pending = (matchId) => ({ matchId, homeTeamScore: 0, awayTeamScore: 0, status: "pending" });
const liveGoals = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a, status: "live" });
const off = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a });
const BEFORE = Date.parse("2026-06-24T18:00:00Z"); // 1h antes del kickoff
const AFTER = Date.parse("2026-06-24T19:30:00Z"); // partido en curso

test("sin anchor -> no simultaneo (modo normal)", () => {
  assert.equal(resolveDisplayWindow({ fixture: FIXTURE }).isSimultaneous, false);
});

test("anchor en un partido SIN pareja a la misma hora -> no simultaneo (N<=1)", () => {
  const w = resolveDisplayWindow({ fixture: FIXTURE, anchorMatchId: "c1", now: BEFORE });
  assert.equal(w.isSimultaneous, false);
  assert.equal(w.matches.length, 0);
});

test("dos PREPARADOS del mismo grupo (antes del pitazo) -> simultaneo, ambos pending", () => {
  const w = resolveDisplayWindow({
    fixture: FIXTURE,
    live: [pending("b1"), pending("b2")],
    anchorMatchId: "b1",
    now: BEFORE,
  });
  assert.equal(w.isSimultaneous, true);
  assert.equal(w.matches.length, 2);
  assert.deepEqual(w.matches.map((x) => x.matchId), ["b1", "b2"], "orden determinista por matchNumber");
  assert.ok(w.matches.every((x) => x.phase === "pending"));
  assert.equal(w.matches[0].homeScore, null, "pending -> sin marcador (guion)");
  assert.deepEqual(w.groupIds, ["B"]);
});

test("uno EN VIVO (goles) + uno preparado -> live + pending", () => {
  const w = resolveDisplayWindow({
    fixture: FIXTURE,
    live: [liveGoals("b1", 1, 0), pending("b2")],
    anchorMatchId: "b1",
    now: BEFORE,
  });
  const byId = new Map(w.matches.map((x) => [x.matchId, x]));
  assert.equal(byId.get("b1").phase, "live");
  assert.equal(byId.get("b1").homeScore, 1);
  assert.equal(byId.get("b2").phase, "pending");
});

test("uno OFICIAL + uno en vivo -> ambos visibles (official + live)", () => {
  const w = resolveDisplayWindow({
    fixture: FIXTURE,
    official: [off("b1", 2, 1)],
    live: [liveGoals("b2", 1, 0)],
    anchorMatchId: "b2",
    now: AFTER,
  });
  assert.equal(w.isSimultaneous, true, "finalizar uno NO oculta la ventana");
  const byId = new Map(w.matches.map((x) => [x.matchId, x]));
  assert.equal(byId.get("b1").phase, "official");
  assert.equal(byId.get("b1").homeScore, 2);
  assert.equal(byId.get("b2").phase, "live");
});

test("0-0 preparado: pending antes del kickoff, live despues", () => {
  const ctx = { fixture: FIXTURE, live: [pending("b1"), pending("b2")], anchorMatchId: "b1" };
  assert.equal(
    resolveDisplayWindow({ ...ctx, now: BEFORE }).matches.find((x) => x.matchId === "b1").phase,
    "pending"
  );
  assert.equal(
    resolveDisplayWindow({ ...ctx, now: AFTER }).matches.find((x) => x.matchId === "b1").phase,
    "live",
    "tras el kickoff un 0-0 cuenta como live"
  );
});

test("windowImpactForPlayer: solo PROVISIONAL del par + grupo ancla; headline = A+B+CLAS", () => {
  const lines = [
    { origen: "match", evento: "b1", estado: "final", puntos: 5 }, // b1 ya oficial -> banqueado, NO vivo
    { origen: "match", evento: "b2", estado: "provisional", puntos: 5 }, // b2 en vivo
    { origen: "group", group: "B", estado: "provisional", puntos: 3 }, // bono provisional del grupo ancla
    { origen: "group", group: "C", estado: "provisional", puntos: 1 }, // OTRO grupo -> NO cuenta
    { origen: "group", group: "B", estado: "final", puntos: 1 }, // banqueado -> NO cuenta
  ];
  const w = windowImpactForPlayer(lines, { matchAId: "b1", matchBId: "b2", groupId: "B" });
  assert.equal(w.a, 0, "b1 ya oficial -> 0 impacto vivo (esta banqueado en el ranking)");
  assert.equal(w.b, 5);
  assert.equal(w.clas, 3, "solo el bono provisional del grupo ancla (no C, no el final)");
  assert.equal(w.total, 8, "headline = A+B+CLAS, cuadra con el desglose");
  assert.equal(w.total, w.a + w.b + w.clas);
});

test("windowImpactForPlayer: sin lineas / sin partidos -> 0 en todo", () => {
  assert.deepEqual(windowImpactForPlayer([], {}), { a: 0, b: 0, clas: 0, total: 0 });
});

test("D: cuatro partidos en DOS grupos a la misma hora -> byGroup con 2 grupos, 4 partidos", () => {
  const FX = {
    matches: [
      m("b1", "B", 51, "sui", "can", T), m("b2", "B", 52, "bih", "qat", T),
      m("d1", "D", 53, "xx", "yy", T), m("d2", "D", 54, "zz", "ww", T),
    ],
  };
  const w = resolveDisplayWindow({
    fixture: FX,
    live: [liveGoals("b1", 1, 0), liveGoals("d1", 2, 2)],
    anchorMatchId: "b1",
    now: AFTER,
  });
  assert.equal(w.isSimultaneous, true);
  assert.equal(w.matches.length, 4, "no se descarta ningun partido vivo");
  assert.deepEqual(w.groupIds.slice().sort(), ["B", "D"]);
  assert.equal(w.byGroup.B.length, 2);
  assert.equal(w.byGroup.D.length, 2);
});
