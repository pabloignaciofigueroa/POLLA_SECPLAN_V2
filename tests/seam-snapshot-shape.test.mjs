import assert from "node:assert/strict";
import test from "node:test";

import {
  pickNewestLiveMatch,
  dedupeClosuresByVersion,
  mapClosureRow,
  readLiveSnapshot,
  setLiveScore,
  clearLiveScore,
  MULTI_LIVE_WRITE_ENABLED,
} from "../src/lib/liveMatch/liveMatchState.js";

test("pickNewestLiveMatch devuelve el de mayor updatedAt", () => {
  const a = { matchId: "m1", updatedAt: "2026-06-22T10:00:00Z" };
  const b = { matchId: "m2", updatedAt: "2026-06-22T12:00:00Z" };
  assert.equal(pickNewestLiveMatch([a, b]).matchId, "m2");
  assert.equal(pickNewestLiveMatch([]), null);
  assert.equal(pickNewestLiveMatch(null), null);
});

test("dedupeClosuresByVersion conserva la version mayor por grupo", () => {
  const closures = [
    { groupId: "A", version: 1, state: "final" },
    { groupId: "A", version: 3, state: "reopened" },
    { groupId: "B", version: 2, state: "final" },
  ];
  const deduped = dedupeClosuresByVersion(closures);
  assert.equal(deduped.length, 2);
  const a = deduped.find((c) => c.groupId === "A");
  assert.equal(a.version, 3);
  assert.equal(a.state, "reopened");
});

test("mapClosureRow mapea snake_case -> camelCase", () => {
  const row = {
    group_id: "A",
    state: "final",
    official_first_team: "mexico",
    official_second_team: "canada",
    official_standings: [],
    version: 2,
    closed_at: "2026-06-22T12:00:00Z",
    reopen_reason: null,
    updated_at: "2026-06-22T12:00:00Z",
  };
  const mapped = mapClosureRow(row);
  assert.equal(mapped.groupId, "A");
  assert.equal(mapped.officialFirstTeam, "mexico");
  assert.equal(mapped.officialSecondTeam, "canada");
  assert.equal(mapped.version, 2);
});

test("readLiveSnapshot emite el shape aditivo { liveMatch, liveMatches, officialResults, groupClosures }", async () => {
  const snapshot = await readLiveSnapshot();
  assert.ok("liveMatch" in snapshot, "compat: liveMatch legado presente");
  assert.ok(Array.isArray(snapshot.liveMatches), "liveMatches[] nuevo");
  assert.ok(Array.isArray(snapshot.officialResults));
  assert.ok(Array.isArray(snapshot.groupClosures), "groupClosures[] nuevo");
});

test("GUARDRAIL A3: multi-write bloqueable por override explicito (flag global ya en true)", async () => {
  // El flag global esta en true (go-live 2026-06-24). El guardrail por-llamada sigue activo:
  // allowMultiWrite:false bloquea -> sirve de rollback de emergencia sin redeploy.
  await assert.rejects(
    () => setLiveScore({ matchId: "m1", homeTeamScore: 1, awayTeamScore: 0 }, { allowMultiWrite: false }),
    /deshabilitado|MULTI_LIVE_WRITE_ENABLED/
  );
  await assert.rejects(
    () => clearLiveScore("m1", { allowMultiWrite: false }),
    /deshabilitado|MULTI_LIVE_WRITE_ENABLED/
  );
});
