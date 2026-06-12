import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCommunityAnalysis,
  mergeLocalPlayer,
} from "../src/lib/statistics/communityStatistics.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const readJson = async (relativePath) =>
  JSON.parse(await fs.readFile(path.join(siteRoot, relativePath), "utf8"));

const [dataset, fixture, groups, teams, players] = await Promise.all([
  readJson("src/data/predictions.json"),
  readJson("src/data/fixture.json"),
  readJson("src/data/groups.json"),
  readJson("src/data/teams.json"),
  readJson("src/data/players.json"),
]);

test("mantiene las metricas de aceptacion del snapshot", () => {
  const analysis = buildCommunityAnalysis({
    dataset,
    matches: fixture.matches,
    groups,
    teams,
    players,
  });
  const pancho = analysis.profiles.find((profile) => profile.playerId === "pancho");
  const narigon = analysis.profiles.find((profile) => profile.playerId === "narigon");
  const divided = analysis.matchPulses.find((pulse) => pulse.matchId === "match-004");

  assert.equal(pancho.averageGoals, 2.39);
  assert.equal(narigon.averageGoals, 3.22);
  assert.equal(
    divided.outcomes.home + divided.outcomes.draw + divided.outcomes.away,
    dataset.confirmedCards
  );
  assert.ok(
    ["unanimous", "strong", "open", "divided"].includes(divided.consensusLevel)
  );
  assert.match(analysis.favoriteScores[0].score, /^\d+-\d+$/);
  assert.ok(analysis.favoriteScores[0].count > 0);
});

test("ignora un carton local incompleto", () => {
  const merged = mergeLocalPlayer(
    dataset,
    "jugador-prueba-local",
    {
      "match-001": {
        playerId: "jugador-prueba-local",
        matchId: "match-001",
        groupId: "A",
        homeScore: 1,
        awayScore: 0,
        status: "complete",
      },
    },
    {}
  );
  assert.equal(merged, dataset);
});

test("incorpora temporalmente un carton local completo", () => {
  const localPredictions = Object.fromEntries(
    fixture.matches.map((match) => [
      match.id,
      {
        playerId: "jugador-prueba-local",
        matchId: match.id,
        groupId: match.groupId,
        homeScore: 1,
        awayScore: 0,
        status: "complete",
      },
    ])
  );
  const localQualified = Object.fromEntries(
    groups.map((group) => [
      group.id,
      {
        playerId: "jugador-prueba-local",
        groupId: group.id,
        firstPlaceTeamId: group.teams[0].id,
        secondPlaceTeamId: group.teams[1].id,
      },
    ])
  );
  const merged = mergeLocalPlayer(
    dataset,
    "jugador-prueba-local",
    localPredictions,
    localQualified
  );
  assert.equal(merged.confirmedCards, dataset.confirmedCards + 1);
  assert.equal(
    merged.predictions.filter((prediction) => prediction.playerId === "jugador-prueba-local").length,
    72
  );
  assert.equal(
    merged.qualifiedPredictions.filter((entry) => entry.playerId === "jugador-prueba-local").length,
    24
  );
});
