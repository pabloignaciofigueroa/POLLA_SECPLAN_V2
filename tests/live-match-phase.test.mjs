import assert from "node:assert/strict";
import test from "node:test";
import { resolveLiveMatchPhase } from "../src/lib/liveMatch/liveMatchPhase.js";

// Caso real de produccion: Mexico 2-0 Sudafrica oficializado y Corea-Chequia
// (match-002, kickoff 2026-06-12T02:00:00Z) preparado 0-0 por Admin.
const KICKOFF = "2026-06-12T02:00:00Z";
const BEFORE = Date.parse("2026-06-11T20:00:00Z");
const AT_KICKOFF = Date.parse(KICKOFF);
const AFTER = Date.parse("2026-06-12T02:30:00Z");

const fixtureMatch = { id: "match-002", dateUtc: KICKOFF };

const liveRow = (overrides = {}) => ({
  matchId: "match-002",
  matchNumber: 2,
  status: "live",
  homeTeamScore: 0,
  awayTeamScore: 0,
  ...overrides,
});

const officials = [{ matchId: "match-001", homeTeamScore: 2, awayTeamScore: 0 }];

test("sin marcador remoto o sin matchId resoluble devuelve null", () => {
  assert.equal(resolveLiveMatchPhase({ liveMatch: null, now: BEFORE }), null);
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: { homeTeamScore: 1, awayTeamScore: 0 },
      now: BEFORE,
    }),
    null
  );
});

test("resuelve matchId desde fixtureMatch cuando el payload legacy no lo trae", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: { matchNumber: 2, homeTeamScore: 1, awayTeamScore: 0 },
      fixtureMatch,
      now: AFTER,
    }),
    "live"
  );
});

test("un partido oficializado gana siempre, aunque el payload diga live con goles", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow({ matchId: "match-001", homeTeamScore: 2, awayTeamScore: 0 }),
      fixtureMatch: { id: "match-001", dateUtc: "2026-06-11T19:00:00Z" },
      officialResults: officials,
      now: AFTER,
    }),
    "official"
  );
});

test("caso real: 0-0 preparado con status live antes del kickoff queda pending", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow(),
      fixtureMatch,
      officialResults: officials,
      now: BEFORE,
    }),
    "pending"
  );
});

test("status pending explicito antes del kickoff queda pending", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow({ status: "pending" }),
      fixtureMatch,
      officialResults: officials,
      now: BEFORE,
    }),
    "pending"
  );
});

test("al llegar la hora real, el 0-0 pasa a live (tendencia empate puntuable)", () => {
  assert.equal(
    resolveLiveMatchPhase({ liveMatch: liveRow(), fixtureMatch, now: AT_KICKOFF }),
    "live"
  );
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow({ status: "pending" }),
      fixtureMatch,
      now: AFTER,
    }),
    "live"
  );
});

test("goles registrados por Admin son acto explicito: live aunque el reloj diga antes", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow({ homeTeamScore: 1 }),
      fixtureMatch,
      now: BEFORE,
    }),
    "live"
  );
});

test("scores invalidos nunca son puntuables: pending", () => {
  for (const scores of [
    { homeTeamScore: null, awayTeamScore: 0 },
    { homeTeamScore: "2", awayTeamScore: 0 },
    { homeTeamScore: undefined, awayTeamScore: undefined },
  ]) {
    assert.equal(
      resolveLiveMatchPhase({ liveMatch: liveRow(scores), fixtureMatch, now: AFTER }),
      "pending"
    );
  }
});

test("0-0 sin hora confiable es ambiguo: pending (fail-safe), con goles live", () => {
  assert.equal(
    resolveLiveMatchPhase({ liveMatch: liveRow(), fixtureMatch: null, now: AFTER }),
    "pending"
  );
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow(),
      fixtureMatch: { id: "match-002", dateUtc: "fecha-rota" },
      now: AFTER,
    }),
    "pending"
  );
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow({ awayTeamScore: 2 }),
      fixtureMatch: null,
      now: BEFORE,
    }),
    "live"
  );
});

test("acepta dateChile como hora de inicio cuando no hay dateUtc", () => {
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow(),
      fixtureMatch: { id: "match-002", dateChile: "2026-06-11T22:00:00-04:00" },
      now: BEFORE,
    }),
    "pending"
  );
  assert.equal(
    resolveLiveMatchPhase({
      liveMatch: liveRow(),
      fixtureMatch: { id: "match-002", dateChile: "2026-06-11T22:00:00-04:00" },
      now: AFTER,
    }),
    "live"
  );
});
