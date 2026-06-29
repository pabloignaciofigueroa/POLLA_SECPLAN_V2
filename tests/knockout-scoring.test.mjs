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
    { homeScore: 2, awayScore: 1, winner: "home" },
    [{ homeScore: 2, awayScore: 1 }],
  );
  assert.equal(r.points, 5);
  assert.equal(r.hitType, "lone_wolf");
});

test("scoreKnockoutMatch: exacto compartido = 3", () => {
  const all = [{ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 }];
  const r = scoreKnockoutMatch({ homeScore: 2, awayScore: 1, advances: "home" }, { homeScore: 2, awayScore: 1, winner: "home" }, all);
  assert.equal(r.points, 3);
  assert.equal(r.hitType, "exact");
});

test("scoreKnockoutMatch: tendencia correcta (marcador no exacto) = 1", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 0, advances: "home" },
    { homeScore: 3, awayScore: 0, winner: "home" },
    [{ homeScore: 1, awayScore: 0 }, { homeScore: 3, awayScore: 0 }],
  );
  assert.equal(r.points, 1);
  assert.equal(r.hitType, "tendency");
});

test("scoreKnockoutMatch: empate EN VIVO premia la tendencia de empate = 1", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "home" },
    { homeScore: 0, awayScore: 0, status: "live" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 0 }],
  );
  assert.equal(r.points, 1, "predijo empate y va 0:0 -> +1 por tendencia");
  assert.equal(r.hitType, "tendency");
});

test("scoreKnockoutMatch: predijo empate pero su avance va GANANDO en vivo = 1 (no pierde el punto)", () => {
  // Pancho: 1:1 con JPN (away) avanzando; va 0:1 (JPN ganando) -> +1 por acertar el avance.
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "away" },
    { homeScore: 0, awayScore: 1, status: "live" },
    [{ homeScore: 1, awayScore: 1 }, { homeScore: 0, awayScore: 1 }],
  );
  assert.equal(r.points, 1);
});

test("scoreKnockoutMatch: clasificado equivocado = 0", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 0, advances: "home" },
    { homeScore: 0, awayScore: 2, winner: "away" },
    [{ homeScore: 1, awayScore: 0 }],
  );
  assert.equal(r.points, 0);
});

test("scoreKnockoutMatch: empate exacto puntua por marcador aunque el avance difiera", () => {
  const r = scoreKnockoutMatch(
    { homeScore: 1, awayScore: 1, advances: "home" },
    { homeScore: 1, awayScore: 1, winner: "away" },
    [{ homeScore: 1, awayScore: 1 }],
  );
  assert.equal(r.points, 5, "marcador exacto manda sobre el avance");
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
