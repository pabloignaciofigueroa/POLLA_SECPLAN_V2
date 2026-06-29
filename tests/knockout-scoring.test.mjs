import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreKnockoutMatch,
  scorePodium,
  buildKnockoutLeaderboard,
  PODIUM_POINTS,
} from "../src/lib/knockout/scoring.js";

test("scoreKnockoutMatch: exacto unico = 5", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 2, awayScore: 1, advances: "home" },
    { homeScore: 2, awayScore: 1, winner: "home", status: "final" },
    [{ homeScore: 2, awayScore: 1 }],
  );
  assert.equal(r.points, 5);
  assert.equal(r.hitType, "lone_wolf");
});

test("scoreKnockoutMatch: exacto compartido = 3", () => {
  const all = [{ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 }];
  const r = scoreKnockoutMatch({ homeScore: 2, awayScore: 1, advances: "home" }, { homeScore: 2, awayScore: 1, winner: "home", status: "final" }, all);
  assert.equal(r.points, 3);
  assert.equal(r.hitType, "exact");
});

// ===== Casos obligatorios del spec "bonus penales" =====

// Caso 1 / bug FRANCISCO: predijo empate + avanza Japón; EN VIVO Japón gana 0-1 -> 0, bonus pendiente.
test("spec1: empate+avanza JPN, en vivo 0-1 -> 0 (advances NO da tendencia, bonus pendiente)", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 0, awayScore: 1, status: "live" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 1 }],
  );
  assert.equal(r.points, 0);
  assert.equal(r.bonus, 0);
});

// Empate EN VIVO (0-0): predijo empate -> +1 por tendencia, bonus pendiente (no en vivo).
test("empate 0-0 en vivo: predijo empate -> base 1, bonus 0", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 0, awayScore: 0, status: "live" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 0 }],
  );
  assert.equal(r.base, 1);
  assert.equal(r.bonus, 0);
  assert.equal(r.points, 1);
});

// Caso 2: final 1-1, Japón gana penales; predijo 1-1 + avanza JPN -> exacto + bonus.
test("spec2: final 1-1 penales JPN, predijo 1-1+JPN -> exacto+bonus", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 1, awayScore: 1, winner: "away", status: "final" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 0 }],
  );
  assert.equal(r.base, 5); // exacto único aquí
  assert.equal(r.bonus, 1);
  assert.equal(r.points, 6);
});

// Caso 3: final 3-3 penales JPN; predijo 1-1 + avanza JPN -> +1 tendencia +1 bonus = 2.
test("spec3: final 3-3 penales JPN, predijo 1-1+JPN -> tendencia+bonus = 2", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 3, awayScore: 3, winner: "away", status: "final" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 0 }],
  );
  assert.equal(r.base, 1);
  assert.equal(r.bonus, 1);
  assert.equal(r.points, 2);
});

// Caso 4: predijo empate, gana un equipo en cancha (2-1) -> 0 (no hubo penales).
test("spec4: empate+avanza JPN, final 2-1 (gana en cancha) -> 0", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 2, awayScore: 1, winner: "home", status: "final" },
    [{ homeScore: 1, awayScore: 1 }],
  );
  assert.equal(r.points, 0);
});

// Caso 5: predijo ganador y ese equipo gana en cancha -> tendencia, sin bonus clasificado.
test("spec5: predijo 2-1, final 1-0 (gana en cancha) -> tendencia 1, bonus 0", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 2, awayScore: 1, advances: "home" },
    { homeScore: 1, awayScore: 0, winner: "home", status: "final" },
    [{ homeScore: 2, awayScore: 1 }, { homeScore: 1, awayScore: 0 }],
  );
  assert.equal(r.base, 1);
  assert.equal(r.bonus, 0);
});

// Caso 6: predijo ganador (no empate) pero el partido va a penales -> 0 bonus (y 0 base).
test("spec6: predijo 2-1+Brasil, final 1-1 penales Brasil -> 0 (no predijo empate)", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 2, awayScore: 1, advances: "home" },
    { homeScore: 1, awayScore: 1, winner: "home", status: "final" },
    [{ homeScore: 2, awayScore: 1 }],
  );
  assert.equal(r.points, 0);
});

// Caso 7: empate exacto pero falla el clasificado de penales -> base sí, bonus 0.
test("spec7: predijo 1-1+Brasil, final 1-1 penales JPN -> exacto sin bonus", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "home" },
    { homeScore: 1, awayScore: 1, winner: "away", status: "final" },
    [{ homeScore: 1, awayScore: 1 }],
  );
  assert.equal(r.base, 5);
  assert.equal(r.bonus, 0);
  assert.equal(r.points, 5);
});

test("scorePodium: acierto exacto por puesto", () => {
  const actual = { champion: "RSA", runnerUp: "MAR", third: "NED", fourth: "CAN" };
  const full = scorePodium(actual, actual);
  assert.equal(full.points, PODIUM_POINTS.champion + PODIUM_POINTS.runnerUp + PODIUM_POINTS.third + PODIUM_POINTS.fourth);
  assert.equal(full.points, 10);

  const partial = scorePodium({ champion: "RSA", runnerUp: "BRA", third: "X", fourth: "Y" }, actual);
  assert.equal(partial.points, 5);

  const none = scorePodium({}, actual);
  assert.equal(none.points, 0);
});

test("buildKnockoutLeaderboard: ordena por total y deriva posicion", () => {
  const players = [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }];
  const predictionsByPlayer = {
    ana: { P73: { homeScore: 2, awayScore: 1, advances: "home" } }, // exacto compartido -> 3
    ben: { P73: { homeScore: 2, awayScore: 1, advances: "home" } }, // exacto compartido -> 3
  };
  const results = [{ matchId: "P73", homeScore: 2, awayScore: 1, winner: "home" }];
  const actualPodium = { champion: "RSA", runnerUp: "MAR", third: "NED", fourth: "CAN" };
  const podiumByPlayer = {
    ana: { champion: "RSA", runnerUp: "MAR", third: "NED", fourth: "CAN" }, // +10
    ben: {},
  };

  const rows = buildKnockoutLeaderboard({ players, predictionsByPlayer, podiumByPlayer, results, actualPodium });
  assert.equal(rows[0].playerId, "ana");
  assert.equal(rows[0].position, 1);
  assert.equal(rows[0].total, 3 + 10);
  assert.equal(rows[0].matchPoints, 3);
  assert.equal(rows[0].podiumPoints, 10);
  assert.equal(rows[1].playerId, "ben");
  assert.equal(rows[1].total, 3);
});

test("buildKnockoutLeaderboard: sin actualPodium no suma podio", () => {
  const players = [{ id: "ana", name: "Ana" }];
  const rows = buildKnockoutLeaderboard({
    players,
    predictionsByPlayer: { ana: {} },
    results: [],
    actualPodium: null,
  });
  assert.equal(rows[0].total, 0);
});
