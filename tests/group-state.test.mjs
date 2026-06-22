import assert from "node:assert/strict";
import test from "node:test";

import {
  GROUP_STATE,
  deriveGroupState,
  computeGroupSituation,
  isClosureStale,
} from "../src/lib/fixture/groupState.js";

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP = { id: "A", teams: ["a", "b", "c", "d"].map(team) };
const m = (id, home, away) => ({ id, groupId: "A", homeTeam: { id: home }, awayTeam: { id: away } });
const MATCHES = [
  m("m1", "a", "b"),
  m("m2", "a", "c"),
  m("m3", "a", "d"),
  m("m4", "b", "c"),
  m("m5", "b", "d"),
  m("m6", "c", "d"),
];
const r = (matchId, h, a) => ({ matchId, homeScore: h, awayScore: a });

// a gana todo, b 2o, c 3o, d ultimo (a=9,b=6,c=3,d=0).
const OFFICIAL_AB = [r("m1", 1, 0), r("m2", 1, 0), r("m3", 1, 0), r("m4", 1, 0), r("m5", 1, 0), r("m6", 1, 0)];
// c gana lo suyo: c 1o, a 2o (c=9,a=6,b=3,d=0).
const OFFICIAL_CA = [r("m1", 1, 0), r("m2", 0, 1), r("m3", 1, 0), r("m4", 0, 1), r("m5", 1, 0), r("m6", 1, 0)];

// 1. deriveGroupState: tabla de transiciones ----------------------------------

test("deriveGroupState: tabla de estados", () => {
  assert.equal(deriveGroupState({ totalMatches: 6, finishedCount: 0, liveCount: 0 }), GROUP_STATE.PENDING);
  assert.equal(deriveGroupState({ totalMatches: 6, finishedCount: 0, liveCount: 2 }), GROUP_STATE.IN_DEFINITION);
  assert.equal(deriveGroupState({ totalMatches: 6, finishedCount: 1, liveCount: 1 }), GROUP_STATE.PENDING_CLOSE);
  assert.equal(deriveGroupState({ totalMatches: 6, finishedCount: 6, liveCount: 0 }), GROUP_STATE.PENDING_CLOSE);
  assert.equal(deriveGroupState({ totalMatches: 6, finishedCount: 4, liveCount: 0 }), GROUP_STATE.PENDING, "viejos finalizados sin live = pending, no pending_close");
  assert.equal(
    deriveGroupState({ totalMatches: 6, finishedCount: 6, liveCount: 0, closure: { state: "final" } }),
    GROUP_STATE.FINAL
  );
  assert.equal(
    deriveGroupState({ totalMatches: 6, finishedCount: 6, liveCount: 0, closure: { state: "reopened" } }),
    GROUP_STATE.REOPENED
  );
});

// 2. computeGroupSituation: provisional en vivo -------------------------------

test("computeGroupSituation: dos live -> in_definition, provisional, 1o desde el live", () => {
  const sit = computeGroupSituation("A", {
    group: GROUP,
    fixture: MATCHES,
    official: [],
    live: [r("m1", 1, 0), r("m2", 1, 0)], // a gana ambos en vivo
  });
  assert.equal(sit.state, GROUP_STATE.IN_DEFINITION);
  assert.equal(sit.isProvisional, true);
  assert.equal(sit.liveCount, 2);
  assert.equal(sit.first, "a");
  assert.equal(sit.closureStale, false);
});

// 3. final congelado: el plano oficial no se mueve por recompute --------------

test("final congelado: usa 1o/2o de la closure; no stale si coincide", () => {
  const closure = { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" };
  const sit = computeGroupSituation("A", { group: GROUP, fixture: MATCHES, official: OFFICIAL_AB, live: [], closure });
  assert.equal(sit.state, GROUP_STATE.FINAL);
  assert.equal(sit.isProvisional, false);
  assert.equal(sit.first, "a");
  assert.equal(sit.second, "b");
  assert.equal(sit.closureStale, false);
});

test("final congelado MIENTE tras correccion: closure a/b pero recompute da c 1o -> stale", () => {
  const closure = { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" };
  const sit = computeGroupSituation("A", { group: GROUP, fixture: MATCHES, official: OFFICIAL_CA, live: [], closure });
  assert.equal(sit.first, "a", "el plano oficial sigue congelado en a (eso es justo el peligro)");
  assert.equal(sit.liveFirst, "c", "el recompute en vivo ya da c");
  assert.equal(sit.closureStale, true, "debe marcar stale para forzar reapertura en F11");
});

// 4. isClosureStale directo ---------------------------------------------------

test("isClosureStale: coincide=false, difiere=true, desfinalizado=true", () => {
  const closureAB = { state: "final", officialFirstTeam: "a", officialSecondTeam: "b" };
  assert.equal(isClosureStale("A", { group: GROUP, fixture: MATCHES, official: OFFICIAL_AB, live: [], closure: closureAB }), false);
  assert.equal(isClosureStale("A", { group: GROUP, fixture: MATCHES, official: OFFICIAL_CA, live: [], closure: closureAB }), true);
  // Desfinalizar (quitar) un partido: el grupo final ya no tiene los 6 -> stale.
  const partial = OFFICIAL_AB.slice(0, 5);
  assert.equal(isClosureStale("A", { group: GROUP, fixture: MATCHES, official: partial, live: [], closure: closureAB }), true);
  // Sin closure final no aplica.
  assert.equal(isClosureStale("A", { group: GROUP, fixture: MATCHES, official: OFFICIAL_CA, live: [], closure: null }), false);
});
