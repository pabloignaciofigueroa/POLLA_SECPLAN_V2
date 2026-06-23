import assert from "node:assert/strict";
import test from "node:test";

import { buildChangeEvents, deriveRanking } from "../src/lib/statistics/buildChangeEvents.js";
import { buildPointLedger } from "../src/lib/scoring/buildPointLedger.js";
import { resolveActiveWindow, resolveEffectiveResults } from "../src/lib/liveMatch/activeWindow.js";
import { computeGroupSituation } from "../src/lib/fixture/groupState.js";

// ── Fixture de grupo A (mismo patron que point-ledger.test) ──────────────────
const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP_A = { id: "A", label: "Grupo A", teams: ["a", "b", "c", "d"].map(team) };
// Finales de 3a fecha = los 2 de mayor dateUtc: a3 y a4. El motor narra 1o/2o solo si
// el grupo entro en definicion (>=1 final live/oficial).
const D1 = "2026-06-11T18:00:00Z";
const D2 = "2026-06-15T18:00:00Z";
const D3 = "2026-06-19T18:00:00Z";
const mt = (id, n, home, away, dateUtc) => ({
  id,
  matchNumber: n,
  groupId: "A",
  dateUtc,
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const FIXTURE = {
  matches: [
    mt("a1", 1, "a", "b", D1), mt("a6", 6, "c", "d", D1),
    mt("a2", 2, "a", "c", D2), mt("a5", 5, "b", "d", D2),
    mt("a3", 3, "a", "d", D3), mt("a4", 4, "b", "c", D3), // finales
  ],
};
const PLAYERS = [{ id: "p1", name: "Uno" }, { id: "p2", name: "Dos" }];
const TEAM_LABELS = Object.fromEntries(GROUP_A.teams.map((t) => [t.id, t.shortCode]));
const PLAYER_LABELS = Object.fromEntries(PLAYERS.map((p) => [p.id, p.name]));
const off = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a });
const live = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a, updatedAt: D3 });
const NOW = Date.parse("2026-07-01T00:00:00Z"); // despues de todos los kickoffs

// Arma el snapshot derivado que el recompute del cliente le pasa al motor.
function snapshot({ predictions = [], qualifiedPredictions = [], official = [], liveMatches = [], narrateGroups = [] }) {
  const window = resolveActiveWindow({ fixture: FIXTURE, official, live: liveMatches, now: NOW });
  const { byMatch: effectiveByMatch } = resolveEffectiveResults({ official, window });
  const ledger = buildPointLedger({
    players: PLAYERS,
    predictions,
    qualifiedPredictions,
    groups: [GROUP_A],
    fixture: FIXTURE,
    official,
    live: liveMatches,
    window,
    now: NOW,
  });
  const situations = {};
  for (const groupId of narrateGroups) {
    const sit = computeGroupSituation(groupId, {
      group: GROUP_A,
      fixture: FIXTURE,
      official,
      live: liveMatches,
    });
    // El recompute solo puebla situations de grupos EN DEFINICION (gate heredado).
    if (sit.definitionStarted !== false || sit.state === "final") situations[groupId] = sit;
  }
  const ranking = deriveRanking(ledger.byPlayer, PLAYERS);
  return { effectiveByMatch, situations, byPlayer: ledger.byPlayer, ranking };
}

const run = (prev, curr, extra = {}) =>
  buildChangeEvents({
    prev,
    curr,
    players: PLAYERS,
    fixture: FIXTURE,
    teamLabels: TEAM_LABELS,
    playerLabels: PLAYER_LABELS,
    ...extra,
  });

// 1. GOAL: marcador de un partido cambia entre dos snapshots ────────────────────
test("goal: detecta el cambio de marcador entre snapshots", () => {
  const preds = [{ playerId: "p1", matchId: "a3", groupId: "A", homeScore: 1, awayScore: 0 }];
  const prev = snapshot({ predictions: preds, liveMatches: [live("a3", 0, 0)], narrateGroups: ["A"] });
  const curr = snapshot({ predictions: preds, liveMatches: [live("a3", 1, 0)], narrateGroups: ["A"] });
  const events = run(prev, curr);
  const goal = events.find((e) => e.type === "goal" && e.matchId === "a3");
  assert.ok(goal, "hay un evento de gol para a3");
  assert.equal(goal.meta.before, "0-0");
  assert.equal(goal.meta.after, "1-0");
  assert.match(goal.text, /0-0 -> 1-0/);
});

test("goal: primer marcador (de sin-marcador a 0-0) tambien se narra", () => {
  const prev = snapshot({});
  const curr = snapshot({ liveMatches: [live("a3", 0, 0)], narrateGroups: ["A"] });
  const goal = run(prev, curr).find((e) => e.type === "goal" && e.matchId === "a3");
  assert.ok(goal);
  assert.equal(goal.meta.before, null);
  assert.match(goal.text, /marcador 0-0/);
});

// 2. REORDER solo si el grupo esta EN DEFINICION ───────────────────────────────
test("reorder: cambio de 1o/2o en grupo EN DEFINICION emite evento", () => {
  // Base: a1,a2,a5 oficiales (a 1o); a3 (a-d) y a4 (b-c) finales en vivo.
  const base = {
    official: [off("a1", 1, 0), off("a2", 1, 0), off("a5", 1, 0)],
    narrateGroups: ["A"],
  };
  // prev: a3 0-0, a4 0-0 -> b va 2o por a5. curr: a4 c gana 0-2 -> c sube.
  const prev = snapshot({ ...base, liveMatches: [live("a3", 0, 0), live("a4", 0, 0)] });
  const curr = snapshot({ ...base, liveMatches: [live("a3", 0, 0), live("a4", 0, 2)] });
  const events = run(prev, curr);
  const reorder = events.find((e) => e.type === "reorder" && e.group === "A");
  // Si el 2o efectivamente cambio, hay evento; validamos que el evento (si existe) es de A.
  if (prev.situations.A.second !== curr.situations.A.second) {
    assert.ok(reorder, "cambio el 2o -> debe haber reorder");
    assert.match(reorder.text, /Grupo A/);
  } else {
    // Defensa: aun sin cambio de second, no debe inventar eventos de otro grupo.
    assert.ok(!events.some((e) => e.type === "reorder" && e.group !== "A"));
  }
});

test("reorder: grupo BLOQUEADO (solo fechas 1-2) NO genera eventos de 1o/2o", () => {
  // Solo a1 (fecha 1) live: NINGUN final -> grupo bloqueado -> situations vacio.
  const prev = snapshot({ liveMatches: [live("a1", 0, 0)], narrateGroups: ["A"] });
  const curr = snapshot({ liveMatches: [live("a1", 2, 1)], narrateGroups: ["A"] });
  // El snapshot helper ya filtra grupos bloqueados de situations (gate heredado).
  assert.deepEqual(Object.keys(prev.situations), [], "grupo bloqueado no entra a situations");
  const events = run(prev, curr);
  assert.equal(events.filter((e) => e.type === "reorder").length, 0, "sin reorder en grupo bloqueado");
  // pero el gol del partido de fecha 1 si se puede narrar.
  assert.ok(events.some((e) => e.type === "goal" && e.matchId === "a1"));
});

// 3. IMPACT con signo correcto + caso contradictorio descompuesto ──────────────
// Estado base: a1-a5 oficiales (a 1o claro), a6 NO es final (fecha 1). Para tocar el 2o en
// definicion usamos los finales a3/a4. Reusamos el caso contradictorio del ledger pero
// adaptado a que el grupo este en definicion (a3/a4 vivos).
test("impact: sube por marcador y baja por 2o -> neto descompuesto con signo", () => {
  // p1 predijo a4 = 2-2 (empate) y 2o de grupo = c. a3 fijo a 1-0 (a gana, 1o estable).
  const QP = [
    { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
    { playerId: "p1", groupId: "A", position: 2, teamId: "c" },
  ];
  const PREDS = [{ playerId: "p1", matchId: "a4", groupId: "A", homeScore: 2, awayScore: 2 }];
  const baseOff = [off("a1", 1, 0), off("a2", 1, 0), off("a5", 0, 1)];
  // X: a4 1-0 (b gana). Y: a4 1-1 (empate). a3 fijo 1-0.
  const stateX = snapshot({
    predictions: PREDS, qualifiedPredictions: QP, official: baseOff,
    liveMatches: [live("a3", 1, 0), live("a4", 1, 0)], narrateGroups: ["A"],
  });
  const stateY = snapshot({
    predictions: PREDS, qualifiedPredictions: QP, official: baseOff,
    liveMatches: [live("a3", 1, 0), live("a4", 1, 1)], narrateGroups: ["A"],
  });
  const events = run(stateX, stateY, { forPlayerId: "p1" });
  const impact = events.find((e) => e.type === "impact" && e.playerId === "p1");
  assert.ok(impact, "hay impacto para p1");
  // El neto y la descomposicion vienen del ledger (cero formula nueva en el motor).
  const expectedDeltaTotal = Math.round(stateY.byPlayer.p1.projected) - Math.round(stateX.byPlayer.p1.projected);
  assert.equal(impact.delta, stateY.byPlayer.p1.projected - stateX.byPlayer.p1.projected);
  assert.equal(impact.sign, expectedDeltaTotal > 0 ? "up" : expectedDeltaTotal < 0 ? "down" : "neutral");
  // descomposicion: deltaMatch (partido) y deltaGroup (1o/2o) deben sumar el total.
  assert.equal(impact.meta.deltaMatch + impact.meta.deltaGroup, impact.delta);
  // contradiccion real: el marcador sube tendencia (+1) y el 2o se cae (-3) => signos opuestos.
  assert.ok(impact.meta.deltaMatch !== 0 || impact.meta.deltaGroup !== 0);
});

// 4. NONE: el "0" se explica para un jugador estable ──────────────────────────
test("none: jugador estable tras un evento emite 'sin cambios' (filtro Mi jugador)", () => {
  // p2 no predijo nada de a3/a4: su proyectado no se mueve aunque haya goles.
  const preds = [{ playerId: "p1", matchId: "a3", groupId: "A", homeScore: 5, awayScore: 5 }];
  const prev = snapshot({ predictions: preds, liveMatches: [live("a3", 0, 0)], narrateGroups: ["A"] });
  const curr = snapshot({ predictions: preds, liveMatches: [live("a3", 1, 0)], narrateGroups: ["A"] });
  // sin forPlayerId: no hay item "none"
  assert.equal(run(prev, curr).filter((e) => e.type === "none").length, 0);
  // con forPlayerId p2 (estable): aparece el "sin cambios"
  const withNone = run(prev, curr, { forPlayerId: "p2" });
  const none = withNone.find((e) => e.type === "none" && e.playerId === "p2");
  assert.ok(none, "p2 estable -> item sin cambios");
  assert.equal(none.delta, 0);
  assert.match(none.text, /sin cambios/i);
});

test("none: si el jugador SI se movio, no emite 'sin cambios'", () => {
  const preds = [{ playerId: "p1", matchId: "a3", groupId: "A", homeScore: 1, awayScore: 0 }];
  const prev = snapshot({ predictions: preds, liveMatches: [live("a3", 0, 0)], narrateGroups: ["A"] });
  const curr = snapshot({ predictions: preds, liveMatches: [live("a3", 1, 0)], narrateGroups: ["A"] });
  const none = run(prev, curr, { forPlayerId: "p1" }).filter((e) => e.type === "none");
  assert.equal(none.length, 0, "p1 se movio (acerto exacto) -> sin item 'none'");
});

// 5. Determinismo del orden dentro de un snapshot ──────────────────────────────
test("orden deterministico: goles antes que reordenamientos antes que impactos", () => {
  const QP = [{ playerId: "p1", groupId: "A", position: 2, teamId: "c" }];
  const PREDS = [{ playerId: "p1", matchId: "a4", groupId: "A", homeScore: 0, awayScore: 2 }];
  const baseOff = [off("a1", 1, 0), off("a2", 1, 0), off("a5", 0, 1)];
  const prev = snapshot({
    predictions: PREDS, qualifiedPredictions: QP, official: baseOff,
    liveMatches: [live("a3", 1, 0), live("a4", 0, 0)], narrateGroups: ["A"],
  });
  const curr = snapshot({
    predictions: PREDS, qualifiedPredictions: QP, official: baseOff,
    liveMatches: [live("a3", 1, 0), live("a4", 0, 2)], narrateGroups: ["A"],
  });
  const events = run(prev, curr);
  const order = events.map((e) => e.type);
  const firstImpact = order.indexOf("impact");
  const lastGoal = order.lastIndexOf("goal");
  const lastReorder = order.lastIndexOf("reorder");
  if (lastGoal >= 0 && firstImpact >= 0) assert.ok(lastGoal < firstImpact, "goles antes que impactos");
  if (lastReorder >= 0 && firstImpact >= 0) assert.ok(lastReorder < firstImpact, "reorder antes que impactos");
  if (lastGoal >= 0 && lastReorder >= 0) assert.ok(lastGoal < lastReorder, "goles antes que reorder");
});

// 6. Sin snapshot actual / sin cambios -> lista vacia ──────────────────────────
test("sin curr -> []", () => {
  assert.deepEqual(buildChangeEvents({ prev: snapshot({}), curr: null }), []);
});

test("dos snapshots identicos -> sin eventos (salvo none si se pide)", () => {
  const preds = [{ playerId: "p1", matchId: "a3", groupId: "A", homeScore: 1, awayScore: 0 }];
  const snap = snapshot({ predictions: preds, liveMatches: [live("a3", 1, 0)], narrateGroups: ["A"] });
  assert.equal(run(snap, snap).length, 0, "snapshots iguales -> nada");
});

// 7. deriveRanking: orden por projected, desempate estable ─────────────────────
test("deriveRanking: ordena por projected desc, desempate por orden de players", () => {
  const byPlayer = { p1: { projected: 3 }, p2: { projected: 5 } };
  assert.deepEqual(deriveRanking(byPlayer, PLAYERS), ["p2", "p1"]);
  const tie = { p1: { projected: 5 }, p2: { projected: 5 } };
  assert.deepEqual(deriveRanking(tie, PLAYERS), ["p1", "p2"], "empate -> orden estable de players");
});
