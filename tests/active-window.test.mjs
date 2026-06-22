import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveActiveWindow,
  resolveEffectiveResults,
} from "../src/lib/liveMatch/activeWindow.js";

const NOW = Date.parse("2026-06-22T20:00:00Z");
const PAST = (min) => new Date(Date.parse("2026-06-22T19:00:00Z") + min * 60000).toISOString();
const FUTURE = "2026-06-22T22:00:00Z";

const fxMatch = (id, groupId, dateUtc, matchNumber, home, away) => ({
  id,
  groupId,
  dateUtc,
  matchNumber,
  homeTeam: { id: home },
  awayTeam: { id: away },
});

const FIXTURE = {
  matches: [
    fxMatch("m1", "A", PAST(0), 10, "a", "b"),
    fxMatch("m2", "A", PAST(5), 11, "c", "d"),
    fxMatch("m4", "C", PAST(10), 13, "g", "h"),
    fxMatch("m3", "B", FUTURE, 12, "e", "f"),
  ],
};

test("un solo live -> isSimultaneous false", () => {
  const w = resolveActiveWindow({
    fixture: FIXTURE,
    live: [{ matchId: "m1", homeTeamScore: 1, awayTeamScore: 0 }],
    now: NOW,
  });
  assert.equal(w.isSimultaneous, false);
  assert.equal(w.byGroup.A.length, 1);
  assert.equal(w.matches.length, 1);
});

test("dos live del mismo grupo -> isSimultaneous true y byGroup[A].length===2", () => {
  const w = resolveActiveWindow({
    fixture: FIXTURE,
    live: [
      { matchId: "m1", homeTeamScore: 1, awayTeamScore: 0 },
      { matchId: "m2", homeTeamScore: 0, awayTeamScore: 2 },
    ],
    now: NOW,
  });
  assert.equal(w.isSimultaneous, true);
  assert.equal(w.byGroup.A.length, 2);
});

test("ningun *TeamScore se filtra a la salida; hay *Score", () => {
  const w = resolveActiveWindow({
    fixture: FIXTURE,
    live: [{ matchId: "m1", homeTeamScore: 3, awayTeamScore: 1 }],
    now: NOW,
  });
  const m = w.matches[0];
  assert.ok(!("homeTeamScore" in m) && !("awayTeamScore" in m), "no debe filtrar *TeamScore");
  assert.ok("homeScore" in m && "awayScore" in m);
  assert.equal(m.homeScore, 3);
  assert.equal(m.awayScore, 1);
  assert.equal(m.phase, "live");
});

test("0-0 preparado: pre-kickoff excluido, post-kickoff incluido", () => {
  const w = resolveActiveWindow({
    fixture: FIXTURE,
    live: [
      { matchId: "m3", homeTeamScore: 0, awayTeamScore: 0 }, // futuro -> pending
      { matchId: "m4", homeTeamScore: 0, awayTeamScore: 0 }, // pasado -> live
    ],
    now: NOW,
  });
  assert.equal(w.matches.length, 1);
  assert.equal(w.matches[0].matchId, "m4");
  assert.deepEqual(Object.keys(w.byGroup), ["C"]);
});

test("hermano oficial de un live se incluye en la ventana del grupo", () => {
  const w = resolveActiveWindow({
    fixture: FIXTURE,
    official: [{ matchId: "m2", homeScore: 1, awayScore: 1, status: "finished" }],
    live: [{ matchId: "m1", homeTeamScore: 2, awayTeamScore: 1 }],
    now: NOW,
  });
  assert.equal(w.isSimultaneous, false); // solo 1 live
  assert.equal(w.byGroup.A.length, 2);
  const m2 = w.matches.find((m) => m.matchId === "m2");
  assert.equal(m2.phase, "official");
  assert.equal(m2.homeScore, 1);
  assert.equal(m2.awayScore, 1);
});

test("resolveEffectiveResults: oficial pisa live; live de ventana se agrega", () => {
  const window = resolveActiveWindow({
    fixture: FIXTURE,
    official: [{ matchId: "m2", homeScore: 1, awayScore: 1 }],
    live: [{ matchId: "m1", homeTeamScore: 2, awayTeamScore: 1 }],
    now: NOW,
  });
  const { byMatch } = resolveEffectiveResults({
    official: [{ matchId: "m2", homeScore: 1, awayScore: 1 }],
    window,
  });
  assert.equal(byMatch.get("m2").official, true);
  assert.equal(byMatch.get("m1").official, false);
  assert.deepEqual(
    [byMatch.get("m1").homeScore, byMatch.get("m1").awayScore],
    [2, 1]
  );
});

test("un partido oficial nunca se cuenta como live (ni en ventana ni en efectivos)", () => {
  const window = resolveActiveWindow({
    fixture: FIXTURE,
    official: [{ matchId: "m1", homeScore: 3, awayScore: 0 }],
    live: [{ matchId: "m1", homeTeamScore: 1, awayTeamScore: 1 }], // payload viejo
    now: NOW,
  });
  assert.equal(window.matches.length, 0, "m1 es oficial -> no entra como live");
  const { byMatch } = resolveEffectiveResults({
    official: [{ matchId: "m1", homeScore: 3, awayScore: 0 }],
    window,
  });
  assert.equal(byMatch.get("m1").official, true);
  assert.equal(byMatch.get("m1").homeScore, 3);
});
