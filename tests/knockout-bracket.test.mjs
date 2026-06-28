import assert from "node:assert/strict";
import test from "node:test";

import { buildTeamsByCode } from "../src/lib/knockout/canPredict.js";
import {
  resolveBracket,
  resolveSlotCode,
  resultWinnerSide,
  deriveActualPodium,
  normalizeResults,
} from "../src/lib/knockout/bracket.js";

const TEAMS = [
  { shortCode: "RSA", name: "Sudáfrica", flag: "/f/rsa.svg" },
  { shortCode: "CAN", name: "Canadá", flag: "/f/can.svg" },
  { shortCode: "NED", name: "Países Bajos", flag: "/f/ned.svg" },
  { shortCode: "MAR", name: "Marruecos", flag: "/f/mar.svg" },
  { shortCode: "MEX", name: "México", flag: "/f/mex.svg" },
  { shortCode: "POR", name: "Portugal", flag: "/f/por.svg" },
];
const byCode = buildTeamsByCode(TEAMS);

const M = [
  { id: "P73", matchNumber: 73, bracketSlot: 1, round: "R32", slotA: { type: "team", code: "RSA" }, slotB: { type: "team", code: "CAN" }, winnerTo: "P90", status: "open", predictionEnabled: true },
  { id: "P75", matchNumber: 75, bracketSlot: 3, round: "R32", slotA: { type: "team", code: "NED" }, slotB: { type: "team", code: "MAR" }, winnerTo: "P90", status: "open", predictionEnabled: true },
  { id: "P79", matchNumber: 79, bracketSlot: 7, round: "R32", slotA: { type: "team", code: "MEX" }, slotB: { type: "third", code: "3CEFHI", label: "3º C/E/F/H/I" }, winnerTo: "P92", status: "open", predictionEnabled: false },
  { id: "P90", matchNumber: 90, bracketSlot: 2, round: "R16", slotA: { type: "winner", from: "P73", label: "Ganador P73" }, slotB: { type: "winner", from: "P75", label: "Ganador P75" }, winnerTo: "P97", status: "locked", predictionEnabled: false },
];
const get = (rows, id) => rows.find((r) => r.match.id === id);

test("resultWinnerSide: explicito o inferido del marcador", () => {
  assert.equal(resultWinnerSide({ homeScore: 2, awayScore: 1 }), "home");
  assert.equal(resultWinnerSide({ homeScore: 0, awayScore: 2 }), "away");
  assert.equal(resultWinnerSide({ homeScore: 1, awayScore: 1 }), null);
  assert.equal(resultWinnerSide({ homeScore: 1, awayScore: 1, winner: "away" }), "away");
});

test("normalizeResults: array -> map por matchId", () => {
  const map = normalizeResults([{ matchId: "P73", homeScore: 1, awayScore: 0 }]);
  assert.equal(map.P73.homeScore, 1);
});

test("sin resultados: R32 concreto predecible, placeholder y rondas futuras NO", () => {
  const rows = resolveBracket(M, { teamsByCode: byCode });
  assert.equal(get(rows, "P73").predictionEnabled, true);
  assert.equal(get(rows, "P73").slotA.concrete, true);
  assert.equal(get(rows, "P73").slotA.name, "Sudáfrica");

  assert.equal(get(rows, "P79").predictionEnabled, false, "placeholder 3CEFHI no se puede predecir");
  assert.equal(get(rows, "P79").slotB.concrete, false);

  assert.equal(get(rows, "P90").predictionEnabled, false, "ganadores aun sin resolver");
  assert.equal(get(rows, "P90").slotA.name, "Ganador P73");
});

test("asignacion de placeholder desbloquea el cruce", () => {
  const rows = resolveBracket(M, { teamsByCode: byCode, assignments: { "3CEFHI": "POR" } });
  const p79 = get(rows, "P79");
  assert.equal(p79.slotB.concrete, true);
  assert.equal(p79.slotB.code, "POR");
  assert.equal(p79.predictionEnabled, true);
});

test("resultados propagan ganadores y desbloquean la ronda siguiente", () => {
  const results = [
    { matchId: "P73", homeScore: 2, awayScore: 1, winner: "home" }, // RSA avanza
    { matchId: "P75", homeScore: 0, awayScore: 0, winner: "away" }, // MAR avanza (penales)
  ];
  const rows = resolveBracket(M, { teamsByCode: byCode, results });
  const p73 = get(rows, "P73");
  assert.equal(p73.played, true);
  assert.equal(p73.predictionEnabled, false, "un cruce jugado ya no se predice");
  assert.equal(p73.winnerCode, "RSA");

  const p90 = get(rows, "P90");
  assert.equal(p90.slotA.code, "RSA", "ganador de P73");
  assert.equal(p90.slotB.code, "MAR", "ganador de P75 (away)");
  assert.equal(p90.predictionEnabled, true, "ambos lados resueltos y sin jugar");
});

test("resolveSlotCode: winner/runner-up recursivo", () => {
  const ctx = {
    matchById: new Map(M.map((m) => [m.id, m])),
    assignments: {},
    results: normalizeResults([{ matchId: "P73", winner: "home" }]),
  };
  assert.equal(resolveSlotCode({ type: "winner", from: "P73" }, ctx), "RSA");
  assert.equal(resolveSlotCode({ type: "runner-up", from: "P73" }, ctx), "CAN");
});

test("deriveActualPodium desde Final (P104) y Tercer puesto (P103)", () => {
  const PM = [
    { id: "P101", round: "SF", slotA: { type: "team", code: "RSA" }, slotB: { type: "team", code: "CAN" } },
    { id: "P102", round: "SF", slotA: { type: "team", code: "NED" }, slotB: { type: "team", code: "MAR" } },
    { id: "P103", round: "3P", slotA: { type: "runner-up", from: "P101" }, slotB: { type: "runner-up", from: "P102" } },
    { id: "P104", round: "F", slotA: { type: "winner", from: "P101" }, slotB: { type: "winner", from: "P102" } },
  ];
  const results = [
    { matchId: "P101", homeScore: 1, awayScore: 0, winner: "home" }, // RSA finalista, CAN al 3er puesto
    { matchId: "P102", homeScore: 2, awayScore: 3, winner: "away" }, // MAR finalista, NED al 3er puesto
    { matchId: "P104", homeScore: 2, awayScore: 1, winner: "home" }, // campeon RSA, subcampeon MAR
    { matchId: "P103", homeScore: 0, awayScore: 1, winner: "away" }, // 3o NED, 4o CAN
  ];
  const podium = deriveActualPodium(PM, { teamsByCode: byCode, results });
  assert.deepEqual(podium, { champion: "RSA", runnerUp: "MAR", third: "NED", fourth: "CAN" });
});
