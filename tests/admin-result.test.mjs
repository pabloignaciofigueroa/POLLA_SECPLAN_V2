import assert from "node:assert/strict";
import test from "node:test";
import { resolveResult } from "../src/lib/knockout/adminResult.js";

// Test 1 — Empate sin ganador por penales: NO se puede finalizar.
test("admin: empate 1-1 sin ganador -> bloquea finalizar", () => {
  const r = resolveResult({ homeScore: 1, awayScore: 1, draftWinner: null });
  assert.equal(r.outcome, "draw");
  assert.equal(r.resolution, "penalties");
  assert.equal(r.requiresPenaltyWinner, true);
  assert.equal(r.canFinalize, false);
});

// Test 2 — Empate con ganador por penales: finaliza con resolution penalties.
test("admin: empate 1-1 avanza visita -> finaliza por penales", () => {
  const r = resolveResult({ homeScore: 1, awayScore: 1, draftWinner: "away" });
  assert.equal(r.resolution, "penalties");
  assert.equal(r.winner, "away");
  assert.equal(r.canFinalize, true);
});

// Test 3 — Gana local en cancha.
test("admin: 2-1 -> gana local, sin penales", () => {
  const r = resolveResult({ homeScore: 2, awayScore: 1 });
  assert.equal(r.winner, "home");
  assert.equal(r.resolution, "regular_time");
  assert.equal(r.requiresPenaltyWinner, false);
  assert.equal(r.canFinalize, true);
});

// Test 4 — Gana visita en cancha.
test("admin: 0-1 -> gana visita, sin penales", () => {
  const r = resolveResult({ homeScore: 0, awayScore: 1 });
  assert.equal(r.winner, "away");
  assert.equal(r.resolution, "regular_time");
});

// Test 5 — Cambiar empate->ganador: limpia el pick de penales, gana el del marcador.
test("admin: empate con pick previo cambia a 2-1 -> limpia penales, gana local", () => {
  // Aunque venga un draftWinner viejo ("away"), al haber ganador en cancha manda el marcador.
  const r = resolveResult({ homeScore: 2, awayScore: 1, draftWinner: "away" });
  assert.equal(r.winner, "home");
  assert.equal(r.resolution, "regular_time");
  assert.equal(r.requiresPenaltyWinner, false);
});

// Marcador incompleto: no se puede finalizar.
test("admin: marcador incompleto -> no finaliza", () => {
  const r = resolveResult({ homeScore: 1, awayScore: null });
  assert.equal(r.complete, false);
  assert.equal(r.canFinalize, false);
});
