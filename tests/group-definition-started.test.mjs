import assert from "node:assert/strict";
import test from "node:test";

import {
  getGroupFinalMatches,
  isGroupDefinitionStarted,
} from "../src/lib/fixture/groupState.js";

// Finales del grupo A = los 2 partidos de mayor dateUtc (3a fecha): a3 + a4.
const D1 = "2026-06-11T18:00:00Z";
const D2 = "2026-06-15T18:00:00Z";
const D3 = "2026-06-19T18:00:00Z";
const KICKOFF_3A = Date.parse(D3);
const mt = (id, groupId, home, away, dateUtc) => ({
  id,
  groupId,
  dateUtc,
  homeTeam: { id: home },
  awayTeam: { id: away },
});
const GROUP_A = { id: "A", teams: ["a", "b", "c", "d"].map((id) => ({ id })) };
const FIXTURE = {
  matches: [
    mt("a1", "A", "a", "b", D1), mt("a6", "A", "c", "d", D1),
    mt("a2", "A", "a", "c", D2), mt("a5", "A", "b", "d", D2),
    mt("a3", "A", "a", "d", D3), mt("a4", "A", "b", "c", D3), // finales
  ],
};
const ctx = (extra) => ({ group: GROUP_A, fixture: FIXTURE, ...extra });
const before = KICKOFF_3A - 60_000; // antes de la hora del partido final

test("getGroupFinalMatches: los 2 partidos de mayor dateUtc", () => {
  const finals = getGroupFinalMatches("A", { group: GROUP_A, fixture: FIXTURE });
  assert.equal(finals.length, 2);
  assert.deepEqual(finals.map((m) => m.id).sort(), ["a3", "a4"]);
});

test("ningun final iniciado -> false (BLOQUEADO)", () => {
  assert.equal(isGroupDefinitionStarted("A", ctx({ official: [], live: [], now: before })), false);
});

test("solo fechas 1-2 (live u oficial) -> false (BLOQUEADO)", () => {
  // a1 = fecha 1 con goles; a2 = fecha 2 oficial. Ningun FINAL.
  assert.equal(
    isGroupDefinitionStarted("A", ctx({
      official: [{ matchId: "a2", homeScore: 1, awayScore: 0 }],
      live: [{ matchId: "a1", homeTeamScore: 2, awayTeamScore: 1 }],
      now: before,
    })),
    false
  );
});

test("1 final EN VIVO (forma *TeamScore del seam) -> true", () => {
  assert.equal(
    isGroupDefinitionStarted("A", ctx({
      live: [{ matchId: "a3", homeTeamScore: 1, awayTeamScore: 0, updatedAt: D3 }],
      now: before,
    })),
    true
  );
});

test("1 final EN VIVO (forma *Score gateada por el ledger) -> true (fix de forma)", () => {
  // buildPointLedger entrega gatedLive como { matchId, homeScore, awayScore }.
  assert.equal(
    isGroupDefinitionStarted("A", ctx({
      live: [{ matchId: "a4", homeScore: 0, awayScore: 2 }],
      now: before,
    })),
    true
  );
});

test("1 final OFICIAL -> true", () => {
  assert.equal(
    isGroupDefinitionStarted("A", ctx({
      official: [{ matchId: "a3", homeTeamScore: 1, awayTeamScore: 1 }],
      now: before,
    })),
    true
  );
});

test("final preparado 0-0 antes de la hora -> false; despues de la hora -> true", () => {
  const prepared = [{ matchId: "a3", homeTeamScore: 0, awayTeamScore: 0 }];
  assert.equal(isGroupDefinitionStarted("A", ctx({ live: prepared, now: before })), false);
  assert.equal(isGroupDefinitionStarted("A", ctx({ live: prepared, now: KICKOFF_3A + 1 })), true);
});
