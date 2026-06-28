import assert from "node:assert/strict";
import test from "node:test";

import {
  toScore,
  scoreStatus,
  isTie,
  inferAdvance,
  predictionStatus,
  matchIsComplete,
  predictableMatches,
  validateKnockout,
} from "../src/lib/knockout/validation.js";
import {
  isConcreteSlot,
  canPredictMatch,
  buildTeamsByCode,
  resolveSlot,
} from "../src/lib/knockout/canPredict.js";
import { validatePodium, normalizePodium, PODIUM_SLOTS } from "../src/lib/knockout/podium.js";

// --- helpers de datos sinteticos ---
const TEAMS = [
  { shortCode: "GER", name: "Alemania", flag: "/assets/flags/germany.svg" },
  { shortCode: "PAR", name: "Paraguay", flag: "/assets/flags/paraguay.svg" },
];
const teamMatch = (id, enabled, codeA = "GER", codeB = "PAR") => ({
  id,
  matchNumber: Number(id.replace("P", "")),
  round: enabled ? "R32" : "R16",
  status: enabled ? "open" : "locked",
  bracketSlot: 1,
  slotA: enabled ? { type: "team", code: codeA } : { type: "winner", from: "P73", label: "Ganador P73" },
  slotB: enabled ? { type: "team", code: codeB } : { type: "winner", from: "P74", label: "Ganador P74" },
  predictionEnabled: enabled,
});

test("toScore / scoreStatus / isTie / inferAdvance", () => {
  assert.equal(toScore("2"), 2);
  assert.equal(toScore("-1"), null);
  assert.equal(toScore(""), null);
  assert.equal(scoreStatus(1, null), "partial");
  assert.equal(scoreStatus(1, 0), "complete");
  assert.equal(isTie(1, 1), true);
  assert.equal(isTie(2, 1), false);
  assert.equal(inferAdvance(3, 1), "home");
  assert.equal(inferAdvance(0, 2), "away");
  assert.equal(inferAdvance(1, 1), null, "empate no infiere ganador");
});

test("predictionStatus: empate exige avance para estar completo", () => {
  assert.equal(predictionStatus({ homeScore: 1, awayScore: 1, advances: null }), "partial");
  assert.equal(matchIsComplete({ homeScore: 1, awayScore: 1, advances: "home" }), true);
  assert.equal(matchIsComplete({ homeScore: 2, awayScore: 0, advances: "home" }), true);
  assert.equal(matchIsComplete({ homeScore: 2, awayScore: 0, advances: null }), false);
});

test("validateKnockout cuenta SOLO los cruces predecibles", () => {
  const matches = [teamMatch("P73", true), teamMatch("P79", false), teamMatch("P74", true)];
  assert.equal(predictableMatches(matches).length, 2);

  const predictions = {
    P73: { homeScore: 2, awayScore: 0, advances: "home" }, // completo
    P79: { homeScore: 1, awayScore: 1, advances: "home" }, // NO predecible -> ignorado
  };
  const result = validateKnockout(predictions, matches);
  assert.equal(result.totalMatches, 2);
  assert.equal(result.completedMatches, 1);
  assert.equal(result.isComplete, false);

  predictions.P74 = { homeScore: 0, awayScore: 0, advances: "away" };
  const done = validateKnockout(predictions, matches);
  assert.equal(done.completedMatches, 2);
  assert.equal(done.isComplete, true);
});

test("canPredictMatch: R32 abierto con ambos lados concretos", () => {
  assert.equal(isConcreteSlot({ type: "team", code: "GER" }), true);
  assert.equal(isConcreteSlot({ type: "third", code: "3CEFHI" }), false);
  assert.equal(canPredictMatch(teamMatch("P73", true)), true);
  assert.equal(canPredictMatch(teamMatch("P89", false)), false);
  // R32 abierto pero con un placeholder => no predecible
  const mixed = { round: "R32", status: "open", slotA: { type: "team", code: "MEX" }, slotB: { type: "third", code: "3CEFHI" } };
  assert.equal(canPredictMatch(mixed), false);
});

test("resolveSlot: equipo concreto vs placeholder", () => {
  const byCode = buildTeamsByCode(TEAMS);
  const team = resolveSlot({ type: "team", code: "GER" }, byCode);
  assert.equal(team.concrete, true);
  assert.equal(team.name, "Alemania");
  assert.equal(team.flag, "/assets/flags/germany.svg");

  const ph = resolveSlot({ type: "third", code: "3CEFHI", label: "3º C/E/F/H/I" }, byCode);
  assert.equal(ph.concrete, false);
  assert.equal(ph.name, "3º C/E/F/H/I");
  assert.equal(ph.flag, null);

  const winner = resolveSlot({ type: "winner", from: "P74", label: "Ganador P74" }, byCode);
  assert.equal(winner.concrete, false);
  assert.equal(winner.name, "Ganador P74");
});

test("validatePodium: completo, duplicado, invalido", () => {
  const valid = new Set(["GER", "BRA", "ARG", "FRA", "ESP"]);
  assert.deepEqual(Object.keys(normalizePodium({})), PODIUM_SLOTS);

  const complete = validatePodium({ champion: "GER", runnerUp: "BRA", third: "ARG", fourth: "FRA" }, valid);
  assert.equal(complete.isComplete, true);

  const dup = validatePodium({ champion: "GER", runnerUp: "GER", third: "ARG", fourth: "FRA" }, valid);
  assert.equal(dup.isComplete, false);
  assert.ok(dup.duplicates.includes("GER"));

  const invalid = validatePodium({ champion: "XXX", runnerUp: "BRA", third: "ARG", fourth: "FRA" }, valid);
  assert.equal(invalid.isComplete, false);
  assert.ok(invalid.invalid.includes("XXX"));

  const partial = validatePodium({ champion: "GER", runnerUp: "BRA" }, valid);
  assert.equal(partial.filled, 2);
  assert.equal(partial.isComplete, false);
});
