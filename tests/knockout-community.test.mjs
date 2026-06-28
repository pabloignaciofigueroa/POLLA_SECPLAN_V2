import assert from "node:assert/strict";
import test from "node:test";

import { buildMatchConsensus, countCartones, buildPlayerProfile } from "../src/lib/knockout/community.js";
import { findNextMatch, recentResults, scheduleKey } from "../src/lib/knockout/schedule.js";

test("buildMatchConsensus: avances, lean, % y top marcadores", () => {
  const preds = {
    ana: { P73: { homeScore: 2, awayScore: 1, advances: "home" } },
    ben: { P73: { homeScore: 1, awayScore: 0, advances: "home" } },
    cam: { P73: { homeScore: 0, awayScore: 2, advances: "away" } },
    dan: { P73: { homeScore: 2, awayScore: 1, advances: "home" } },
  };
  const c = buildMatchConsensus(preds);
  assert.equal(c.P73.total, 4);
  assert.equal(c.P73.advHome, 3);
  assert.equal(c.P73.advAway, 1);
  assert.equal(c.P73.lean, "home");
  assert.equal(c.P73.consensusPct, 75);
  assert.equal(c.P73.topScores[0].score, "2-1");
  assert.equal(c.P73.topScores[0].count, 2);
});

test("buildMatchConsensus: filtro por matchIds + split", () => {
  const preds = {
    ana: { P73: { advances: "home" }, P74: { advances: "home" } },
    ben: { P73: { advances: "away" } },
  };
  const c = buildMatchConsensus(preds, ["P73"]);
  assert.ok(c.P73);
  assert.equal(c.P74, undefined, "P74 excluido por el filtro");
  assert.equal(c.P73.lean, "split");
  assert.equal(c.P73.consensusPct, 50);
});

test("countCartones y buildPlayerProfile", () => {
  assert.equal(countCartones({ ana: { P73: {} }, ben: {}, cam: { P74: {} } }), 2);
  const prof = buildPlayerProfile(
    { P73: { homeScore: 2, awayScore: 1, advances: "home" }, P74: { homeScore: 1, awayScore: null, advances: null } },
    { champion: "RSA", runnerUp: "MAR" },
  );
  assert.equal(prof.predicted, 1);
  assert.equal(prof.podiumFilled, 2);
});

const item = (id, dateCL, timeCL, codeA, codeB, played) => ({ match: { id, dateCL, timeCL }, codeA, codeB, played });

test("findNextMatch: primer concreto sin jugar, en orden cronologico", () => {
  const items = [
    item("P75", "2026-06-29", "21:00", "NED", "MAR", false),
    item("P73", "2026-06-28", "15:00", "RSA", "CAN", true), // jugado
    item("P74", "2026-06-29", "16:30", "GER", "PAR", false),
    item("P79", "2026-06-30", "21:00", "MEX", null, false), // placeholder sin resolver
  ];
  const next = findNextMatch(items);
  assert.equal(next.match.id, "P74", "el mas temprano sin jugar y concreto");
});

test("findNextMatch: respeta nowKey", () => {
  const items = [
    item("P74", "2026-06-29", "16:30", "GER", "PAR", false),
    item("P75", "2026-06-29", "21:00", "NED", "MAR", false),
  ];
  const next = findNextMatch(items, { nowKey: "2026-06-29T18:00" });
  assert.equal(next.match.id, "P75", "el primero a partir de ahora");
});

test("recentResults: jugados del mas nuevo al mas viejo", () => {
  const items = [
    item("P73", "2026-06-28", "15:00", "RSA", "CAN", true),
    item("P76", "2026-06-29", "13:00", "BRA", "JPN", true),
    item("P74", "2026-06-29", "16:30", "GER", "PAR", false),
  ];
  const recent = recentResults(items);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].match.id, "P76", "mas nuevo primero");
  assert.equal(recent[1].match.id, "P73");
});

test("scheduleKey ordena por fecha+hora", () => {
  assert.ok(scheduleKey(item("a", "2026-06-28", "15:00")) < scheduleKey(item("b", "2026-06-29", "13:00")));
});
