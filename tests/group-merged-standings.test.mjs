import assert from "node:assert/strict";
import test from "node:test";

import { buildMergedGroupStandings } from "../src/lib/fixture/groupStandings.js";
import { computeGroupSituation } from "../src/lib/fixture/groupState.js";
import { resolveFirstSecond } from "../src/lib/fixture/groupTiebreakers.js";
import { getAutomaticQualified } from "../src/sections/04_predicciones/predicciones.standings.js";

const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP = { id: "A", teams: ["a", "b", "c", "d"].map(team) };
const MATCHES = [
  { id: "m1", groupId: "A", homeTeam: { id: "a" }, awayTeam: { id: "b" } },
  { id: "m2", groupId: "A", homeTeam: { id: "c" }, awayTeam: { id: "d" } },
  { id: "x9", groupId: "B", homeTeam: { id: "z1" }, awayTeam: { id: "z2" } }, // otro grupo
];

const rowFor = (standings, teamId) =>
  standings.standings.find((row) => row.teamId === teamId);

test("oficial pisa al live del mismo partido (no provisional)", () => {
  const standings = buildMergedGroupStandings({
    group: GROUP,
    matches: MATCHES,
    official: [{ matchId: "m1", homeTeamScore: 2, awayTeamScore: 0 }],
    live: [{ matchId: "m1", homeScore: 1, awayScore: 1 }], // debe ser ignorado
  });
  assert.equal(standings.finishedCount, 1);
  assert.equal(standings.liveCount, 0);
  assert.equal(standings.isProvisional, false);
  const a = rowFor(standings, "a");
  assert.equal(a.goalsFor, 2, "usa el 2-0 oficial, no el 1-1 live");
  assert.equal(a.points, 3);
});

test("live aporta un partido aun no oficial -> isProvisional true", () => {
  const standings = buildMergedGroupStandings({
    group: GROUP,
    matches: MATCHES,
    official: [{ matchId: "m1", homeTeamScore: 2, awayTeamScore: 0 }], // a gana
    live: [{ matchId: "m2", homeScore: 0, awayScore: 3 }], // d gana en vivo
  });
  assert.equal(standings.finishedCount, 1);
  assert.equal(standings.liveCount, 1);
  assert.equal(standings.isProvisional, true);
  assert.equal(rowFor(standings, "a").points, 3);
  assert.equal(rowFor(standings, "d").points, 3, "el live de m2 cuenta para d");
  assert.equal(rowFor(standings, "c").points, 0);
});

test("ignora resultados de partidos de otro grupo", () => {
  const standings = buildMergedGroupStandings({
    group: GROUP,
    matches: MATCHES,
    official: [{ matchId: "x9", homeTeamScore: 5, awayTeamScore: 0 }], // grupo B
    live: [],
  });
  assert.equal(standings.finishedCount, 0);
  assert.equal(standings.liveCount, 0);
  assert.equal(standings.isProvisional, false);
});

test("sin resultados: tabla en ceros, no provisional", () => {
  const standings = buildMergedGroupStandings({ group: GROUP, matches: MATCHES });
  assert.equal(standings.completedMatches, 0);
  assert.equal(standings.isProvisional, false);
  assert.equal(standings.standings.length, 4);
});

// CASO 7 (propagacion): el criterio 2026 (head-to-head primero) se propaga por la fuente
// unica a buildMergedGroupStandings -> computeGroupSituation -> resolveFirstSecond /
// getAutomaticQualified. Witness: a y b empatados a puntos, a con mejor DG global, pero B
// gano el head-to-head -> B queda 1o en TODA la cadena.
test("propagacion 2026: el ganador del head-to-head queda 1o en toda la cadena", () => {
  const RR = [
    { id: "r1", groupId: "A", homeTeam: { id: "a" }, awayTeam: { id: "b" } },
    { id: "r2", groupId: "A", homeTeam: { id: "a" }, awayTeam: { id: "c" } },
    { id: "r3", groupId: "A", homeTeam: { id: "a" }, awayTeam: { id: "d" } },
    { id: "r4", groupId: "A", homeTeam: { id: "b" }, awayTeam: { id: "c" } },
    { id: "r5", groupId: "A", homeTeam: { id: "b" }, awayTeam: { id: "d" } },
    { id: "r6", groupId: "A", homeTeam: { id: "c" }, awayTeam: { id: "d" } },
  ];
  const official = [
    { matchId: "r1", homeScore: 0, awayScore: 1 }, // b le gana a a (head-to-head a B)
    { matchId: "r2", homeScore: 3, awayScore: 0 }, // a golea (mejor DG global de a)
    { matchId: "r3", homeScore: 1, awayScore: 0 },
    { matchId: "r4", homeScore: 0, awayScore: 1 },
    { matchId: "r5", homeScore: 1, awayScore: 0 },
    { matchId: "r6", homeScore: 0, awayScore: 1 },
  ];
  const merged = buildMergedGroupStandings({ group: GROUP, matches: RR, official, live: [] });
  assert.ok(
    rowFor(merged, "a").goalDifference > rowFor(merged, "b").goalDifference,
    "a tiene mejor DG global (el criterio viejo lo pondria 1o)"
  );
  assert.equal(merged.standings[0].teamId, "b", "buildMergedGroupStandings: B 1o por head-to-head");
  assert.equal(resolveFirstSecond(merged).first, "b");
  assert.equal(getAutomaticQualified(merged).firstPlaceTeamId, "b");

  const sit = computeGroupSituation("A", { group: GROUP, fixture: RR, official, live: [], closure: null });
  assert.equal(sit.first, "b", "computeGroupSituation propaga el 1o correcto");
  assert.equal(sit.second, "a");
});
