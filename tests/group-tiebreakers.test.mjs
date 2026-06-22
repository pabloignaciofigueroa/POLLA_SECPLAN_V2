import assert from "node:assert/strict";
import test from "node:test";

import { resolveFirstSecond, compareRows } from "../src/lib/fixture/groupTiebreakers.js";
import {
  calculateGroupStandings,
  getAutomaticQualified,
} from "../src/sections/04_predicciones/predicciones.standings.js";

// Desempate al criterio OFICIAL FIFA 2026: puntos -> head-to-head(pts,DG,GF) -> DG total
// -> GF total -> fair play (N/A) -> fallback (indice original estable).

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP = { id: "A", teams: ["a", "b", "c", "d"].map(team) };
const m = (id, home, away) => ({
  id,
  matchNumber: Number(id.replace("m", "")),
  groupId: "A",
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const GROUP_MATCHES = [
  m("m1", "a", "b"),
  m("m2", "a", "c"),
  m("m3", "a", "d"),
  m("m4", "b", "c"),
  m("m5", "b", "d"),
  m("m6", "c", "d"),
];
const order = (standingsResult) => standingsResult.standings.map((r) => r.teamId);
const rowFor = (standingsResult, teamId) => standingsResult.standings.find((r) => r.teamId === teamId);

// CASO 1 (testigo del cambio 2026): A y B empatados a puntos, A con MEJOR DG total, pero
// B le GANO el head-to-head -> 2026 pone a B primero (el viejo daba A por DG global).
test("caso 1: head-to-head manda sobre la DG total (B 1o aunque A tenga mejor DG)", () => {
  const predictions = {
    m1: { homeScore: 0, awayScore: 1 }, // a-b: B gana 1-0 (head-to-head a B)
    m2: { homeScore: 3, awayScore: 0 }, // a-c: A golea 3-0 (infla DG total de A)
    m3: { homeScore: 1, awayScore: 0 }, // a-d: A gana
    m4: { homeScore: 0, awayScore: 1 }, // b-c: C gana
    m5: { homeScore: 1, awayScore: 0 }, // b-d: B gana
    m6: { homeScore: 0, awayScore: 1 }, // c-d: D gana
  };
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, predictions);
  const a = rowFor(standings, "a");
  const b = rowFor(standings, "b");
  assert.equal(a.points, b.points, "A y B empatados a puntos");
  assert.ok(a.goalDifference > b.goalDifference, "A tiene MEJOR DG total (el viejo lo pondria 1o)");

  assert.deepEqual(order(standings).slice(0, 2), ["b", "a"], "2026: B antes que A por head-to-head");
  const { first, second } = resolveFirstSecond(standings);
  assert.equal(first, "b");
  assert.equal(second, "a");
  assert.equal(getAutomaticQualified(standings).firstPlaceTeamId, "b");
});

// CASO 2: head-to-head EMPATADO (partido directo empate) -> cae al PASO 2 (DG/GF total).
test("caso 2: head-to-head empatado cae a DG/GF total", () => {
  const predictions = {
    m1: { homeScore: 1, awayScore: 1 }, // a-b: empate -> head-to-head no decide
    m2: { homeScore: 3, awayScore: 0 }, // a-c: A golea
    m3: { homeScore: 3, awayScore: 0 }, // a-d: A golea
    m4: { homeScore: 1, awayScore: 0 }, // b-c: B gana ajustado
    m5: { homeScore: 1, awayScore: 0 }, // b-d: B gana ajustado
    m6: { homeScore: 1, awayScore: 0 }, // c-d: C gana
  };
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, predictions);
  const a = rowFor(standings, "a");
  const b = rowFor(standings, "b");
  assert.equal(a.points, b.points, "A y B empatados a puntos");
  assert.ok(a.goalDifference > b.goalDifference, "A mejor DG total");
  assert.deepEqual(order(standings).slice(0, 2), ["a", "b"], "h2h empatado -> manda la DG total (A 1o)");
  assert.equal(resolveFirstSecond(standings).first, "a");
});

// CASO 6 (fallback): empate perfecto irrompible con los datos -> fallback declarado
// (indice original estable), determinista, nunca azar.
test("caso 6: empate total irrompible -> fallback determinista (indice original)", () => {
  const allDraws = Object.fromEntries(GROUP_MATCHES.map((mt) => [mt.id, { homeScore: 0, awayScore: 0 }]));
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, allDraws);
  assert.deepEqual(order(standings), ["a", "b", "c", "d"], "fallback = orden por indice original");
  // determinismo del fallback: re-ejecutar da lo mismo.
  const again = calculateGroupStandings(GROUP, GROUP_MATCHES, allDraws);
  assert.deepEqual(order(again), order(standings));
});

// Grupo incompleto: resolver provisional da top-2 con lo que hay.
test("grupo incompleto: resolveFirstSecond da top-2 provisional; oficial null", () => {
  const partial = { m1: { homeScore: 1, awayScore: 0 } }; // solo a-b: gana a
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, partial);
  assert.equal(standings.isComplete, false);
  assert.equal(getAutomaticQualified(standings).firstPlaceTeamId, null);
  assert.equal(resolveFirstSecond(standings).first, "a");
});

// compareRows par-a-par (2 equipos) decide por head-to-head de forma pura.
test("compareRows par-a-par: head-to-head decide (2 equipos)", () => {
  const predictions = {
    m1: { homeScore: 0, awayScore: 1 }, // b le gana a a
    m2: { homeScore: 3, awayScore: 0 },
    m3: { homeScore: 1, awayScore: 0 },
    m4: { homeScore: 0, awayScore: 1 },
    m5: { homeScore: 1, awayScore: 0 },
    m6: { homeScore: 0, awayScore: 1 },
  };
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, predictions);
  const a = rowFor(standings, "a");
  const b = rowFor(standings, "b");
  assert.ok(compareRows(a, b, GROUP_MATCHES, predictions) > 0, "a va despues de b (b gano el mano a mano)");
  assert.ok(compareRows(b, a, GROUP_MATCHES, predictions) < 0);
});

// CASO 3: TRES empatados a puntos; la mini-tabla los ordena b > c > a (transitivo),
// distinto del orden por DG global (que pondria a a 1o). Demuestra la mini-tabla.
const TIE3 = {
  m1: { homeScore: 0, awayScore: 2 }, // a-b: b 2-0
  m2: { homeScore: 1, awayScore: 0 }, // a-c: a 1-0
  m4: { homeScore: 0, awayScore: 1 }, // b-c: c 1-0
  m3: { homeScore: 5, awayScore: 0 }, // a-d: a 5-0 (infla DG global de a)
  m5: { homeScore: 1, awayScore: 0 }, // b-d: b 1-0
  m6: { homeScore: 1, awayScore: 0 }, // c-d: c 1-0
};

test("caso 3: tres empatados -> mini-tabla transitiva (b > c > a), no la DG global", () => {
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, TIE3);
  assert.equal(rowFor(standings, "a").points, 6);
  assert.equal(rowFor(standings, "b").points, 6);
  assert.equal(rowFor(standings, "c").points, 6);
  // a tiene la MEJOR DG global pero la mini-tabla lo manda al fondo del cluster.
  assert.ok(rowFor(standings, "a").goalDifference > rowFor(standings, "b").goalDifference);
  assert.deepEqual(order(standings), ["b", "c", "a", "d"]);
  assert.equal(getAutomaticQualified(standings).firstPlaceTeamId, "b");
  assert.equal(getAutomaticQualified(standings).secondPlaceTeamId, "c");
});

// CASO 4: TRES empatados; la mini-tabla SEPARA a uno (a, por GF en la mini) y deja DOS
// (b y c) iguales en la mini -> esos dos se resuelven por PASO 2 (DG total: c > b).
test("caso 4: mini separa a uno y deja dos -> los dos restantes por PASO 2 (DG total)", () => {
  const tie = {
    m1: { homeScore: 2, awayScore: 1 }, // a-b: a 2-1
    m2: { homeScore: 1, awayScore: 2 }, // a-c: c 2-1
    m4: { homeScore: 1, awayScore: 0 }, // b-c: b 1-0
    m3: { homeScore: 1, awayScore: 0 }, // a-d: a 1-0
    m5: { homeScore: 1, awayScore: 0 }, // b-d: b 1-0
    m6: { homeScore: 3, awayScore: 0 }, // c-d: c 3-0 (da a c mejor DG total)
  };
  const standings = calculateGroupStandings(GROUP, GROUP_MATCHES, tie);
  assert.equal(rowFor(standings, "a").points, 6);
  assert.equal(rowFor(standings, "b").points, 6);
  assert.equal(rowFor(standings, "c").points, 6);
  // c tiene mejor DG total que b -> PASO 2 lo pone por delante; a sale 1o por la mini (GF).
  assert.ok(rowFor(standings, "c").goalDifference > rowFor(standings, "b").goalDifference);
  assert.deepEqual(order(standings), ["a", "c", "b", "d"]);
});

// CASO 5: determinismo. El criterio NO depende del orden de entrada de equipos/partidos.
test("caso 5: determinismo (barajar entrada -> mismo orden final)", () => {
  const shuffledGroup = { id: "A", teams: ["c", "a", "d", "b"].map(team) };
  const shuffledMatches = [...GROUP_MATCHES].reverse();
  const standings = calculateGroupStandings(shuffledGroup, shuffledMatches, TIE3);
  assert.deepEqual(order(standings), ["b", "c", "a", "d"], "mismo orden que con la entrada original");
});
