import assert from "node:assert/strict";
import test from "node:test";
import { mergeResults } from "../src/lib/knockout/liveResults.js";

test("mergeResults: el override (local) pisa al base (seed) por defecto", () => {
  const base = [{ matchId: "P74", homeScore: 1, awayScore: 0, status: "final" }];
  const override = [{ matchId: "P74", homeScore: 2, awayScore: 2, status: "final" }];
  const m = mergeResults(base, override);
  assert.equal(m.P74.homeScore, 2);
  assert.equal(m.P74.awayScore, 2);
});

test("mergeResults: un FINAL del seed NO es pisado por un LIVE local viejo", () => {
  const seed = [{ matchId: "P73", homeScore: 0, awayScore: 1, winner: "away", status: "final" }];
  const localViejo = [{ matchId: "P73", homeScore: 5, awayScore: 5, status: "live" }];
  const m = mergeResults(seed, localViejo);
  assert.equal(m.P73.status, "final");
  assert.equal(m.P73.homeScore, 0);
  assert.equal(m.P73.awayScore, 1);
});

test("mergeResults: una corrección final->final SÍ pisa al seed", () => {
  const seed = [{ matchId: "P73", homeScore: 0, awayScore: 1, status: "final" }];
  const correccion = [{ matchId: "P73", homeScore: 2, awayScore: 1, status: "final" }];
  const m = mergeResults(seed, correccion);
  assert.equal(m.P73.homeScore, 2);
  assert.equal(m.P73.awayScore, 1);
});

test("mergeResults: sin base (admin editando local) el live aplica normal", () => {
  const local = [{ matchId: "P80", homeScore: 1, awayScore: 1, status: "live" }];
  const m = mergeResults(null, local);
  assert.equal(m.P80.status, "live");
  assert.equal(m.P80.homeScore, 1);
});

test("mergeResults: live local sobre matches que NO están en el seed aplica (scoring en vivo intacto)", () => {
  const seed = [{ matchId: "P73", homeScore: 0, awayScore: 1, status: "final" }];
  const local = [{ matchId: "P74", homeScore: 0, awayScore: 2, status: "live" }];
  const m = mergeResults(seed, local);
  assert.equal(m.P73.status, "final");
  assert.equal(m.P74.status, "live");
  assert.equal(m.P74.awayScore, 2);
});
