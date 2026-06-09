import { createHash } from "node:crypto";
import { calculateGroupStandings, getAutomaticQualified } from "../src/sections/04_predicciones/predicciones.standings.js";

const EXPECTED_SCHEMA_VERSION = "1.0";
const EXPECTED_MATCHES = 72;
const EXPECTED_GROUPS = 12;
const EXPECTED_QUALIFIED = 24;

function fail(fileName, message) {
  throw new Error(`${fileName}: ${message}`);
}

function isScore(value) {
  return Number.isInteger(value) && value >= 0;
}

function stableChecksum(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export function validateSubmission({
  document,
  raw,
  fileName,
  players,
  matches,
  groups,
  teams,
}) {
  if (!document || typeof document !== "object") fail(fileName, "JSON vacio o invalido.");
  if (document.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    fail(fileName, `schemaVersion debe ser ${EXPECTED_SCHEMA_VERSION}.`);
  }

  const playerId = document.player?.id;
  const knownPlayer = players.find((player) => player.id === playerId);
  if (!knownPlayer) fail(fileName, `jugador desconocido "${playerId ?? ""}".`);

  if (document.replacesChecksum !== undefined) {
    if (!/^[a-f0-9]{64}$/i.test(String(document.replacesChecksum))) {
      fail(fileName, "replacesChecksum debe ser un checksum SHA-256 valido.");
    }
    if (document.correctionPlayerId !== playerId) {
      fail(fileName, "correctionPlayerId debe coincidir con el jugador del carton.");
    }
    if (!Number.isFinite(Date.parse(document.correctionGeneratedAt ?? ""))) {
      fail(fileName, "correctionGeneratedAt debe ser una fecha valida.");
    }
  }

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const teamIds = new Set(teams.map((team) => team.id));
  const groupPredictions = Array.isArray(document.groupPredictions)
    ? document.groupPredictions
    : [];

  if (groupPredictions.length !== EXPECTED_GROUPS) {
    fail(fileName, `debe contener ${EXPECTED_GROUPS} grupos; contiene ${groupPredictions.length}.`);
  }

  const seenGroups = new Set();
  const seenMatches = new Set();
  const predictions = [];
  const qualifiedPredictions = [];

  for (const groupEntry of groupPredictions) {
    const group = groupById.get(groupEntry.groupId);
    if (!group) fail(fileName, `grupo desconocido "${groupEntry.groupId}".`);
    if (seenGroups.has(group.id)) fail(fileName, `grupo duplicado "${group.id}".`);
    seenGroups.add(group.id);

    const groupMatches = Array.isArray(groupEntry.matches) ? groupEntry.matches : [];
    if (groupMatches.length !== group.matchIds.length) {
      fail(fileName, `Grupo ${group.id} debe contener ${group.matchIds.length} partidos.`);
    }

    const predictionsByMatch = {};
    for (const prediction of groupMatches) {
      const fixtureMatch = matchById.get(prediction.matchId);
      if (!fixtureMatch) fail(fileName, `partido desconocido "${prediction.matchId}".`);
      if (fixtureMatch.groupId !== group.id) {
        fail(fileName, `${prediction.matchId} no pertenece al Grupo ${group.id}.`);
      }
      if (seenMatches.has(prediction.matchId)) {
        fail(fileName, `partido duplicado "${prediction.matchId}".`);
      }
      if (!isScore(prediction.homeScore) || !isScore(prediction.awayScore)) {
        fail(fileName, `${prediction.matchId} tiene un marcador invalido.`);
      }

      seenMatches.add(prediction.matchId);
      const normalized = {
        playerId,
        matchId: prediction.matchId,
        groupId: group.id,
        homeScore: prediction.homeScore,
        awayScore: prediction.awayScore,
        status: "complete",
      };
      predictions.push(normalized);
      predictionsByMatch[prediction.matchId] = normalized;
    }

    const firstPlaceTeamId = groupEntry.firstPlace;
    const secondPlaceTeamId = groupEntry.secondPlace;
    if (!teamIds.has(firstPlaceTeamId) || !teamIds.has(secondPlaceTeamId)) {
      fail(fileName, `Grupo ${group.id} contiene un clasificado desconocido.`);
    }
    if (firstPlaceTeamId === secondPlaceTeamId) {
      fail(fileName, `Grupo ${group.id} repite el mismo clasificado.`);
    }
    const groupTeamIds = new Set(group.teams.map((team) => team.id));
    if (!groupTeamIds.has(firstPlaceTeamId) || !groupTeamIds.has(secondPlaceTeamId)) {
      fail(fileName, `Grupo ${group.id} contiene clasificados de otro grupo.`);
    }

    const standings = calculateGroupStandings(
      group,
      matches.filter((match) => match.groupId === group.id),
      predictionsByMatch
    );
    const automatic = getAutomaticQualified(standings);
    if (
      automatic.firstPlaceTeamId !== firstPlaceTeamId ||
      automatic.secondPlaceTeamId !== secondPlaceTeamId
    ) {
      fail(
        fileName,
        `Grupo ${group.id} declara ${firstPlaceTeamId}/${secondPlaceTeamId}, ` +
          `pero los marcadores producen ${automatic.firstPlaceTeamId}/${automatic.secondPlaceTeamId}.`
      );
    }

    qualifiedPredictions.push(
      {
        playerId,
        groupId: group.id,
        position: 1,
        teamId: firstPlaceTeamId,
      },
      {
        playerId,
        groupId: group.id,
        position: 2,
        teamId: secondPlaceTeamId,
      }
    );
  }

  if (seenMatches.size !== EXPECTED_MATCHES) {
    fail(fileName, `debe contener ${EXPECTED_MATCHES} partidos unicos; contiene ${seenMatches.size}.`);
  }
  if (qualifiedPredictions.length !== EXPECTED_QUALIFIED) {
    fail(fileName, `debe contener ${EXPECTED_QUALIFIED} posiciones clasificatorias.`);
  }
  if (
    document.summary?.completedMatches !== EXPECTED_MATCHES ||
    document.summary?.completedGroups !== EXPECTED_GROUPS ||
    document.summary?.completedQualifiedSlots !== EXPECTED_QUALIFIED
  ) {
    fail(fileName, "el resumen no declara un carton completamente confirmado.");
  }

  return {
    submission: {
      playerId,
      displayName: knownPlayer.name,
      fileName,
      submittedAt: document.submittedAt,
      status: "confirmed",
      checksum: stableChecksum(raw),
      predictionCount: predictions.length,
      qualifiedCount: qualifiedPredictions.length,
      ...(document.replacesChecksum
        ? { replacesChecksum: document.replacesChecksum }
        : {}),
    },
    predictions,
    qualifiedPredictions,
  };
}

export function buildDataset({
  entries,
  players,
  matches,
  groups,
  teams,
  sourcePattern = "predicciones_*.json",
}) {
  const seenPlayers = new Set();
  const submissions = [];
  const predictions = [];
  const qualifiedPredictions = [];

  for (const entry of entries) {
    const validated = validateSubmission({
      ...entry,
      players,
      matches,
      groups,
      teams,
    });
    if (seenPlayers.has(validated.submission.playerId)) {
      fail(entry.fileName, `jugador duplicado "${validated.submission.playerId}".`);
    }
    seenPlayers.add(validated.submission.playerId);
    submissions.push(validated.submission);
    predictions.push(...validated.predictions);
    qualifiedPredictions.push(...validated.qualifiedPredictions);
  }

  submissions.sort((a, b) => a.playerId.localeCompare(b.playerId));
  predictions.sort(
    (a, b) => a.playerId.localeCompare(b.playerId) || a.matchId.localeCompare(b.matchId)
  );
  qualifiedPredictions.sort(
    (a, b) =>
      a.playerId.localeCompare(b.playerId) ||
      a.groupId.localeCompare(b.groupId) ||
      a.position - b.position
  );

  const snapshotAt = submissions
    .map((submission) => submission.submittedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const confirmedIds = new Set(submissions.map((submission) => submission.playerId));

  return {
    schemaVersion: "2.0",
    source: "official-player-exports",
    sourcePattern,
    snapshotAt,
    expectedPlayers: players.length,
    confirmedCards: submissions.length,
    pendingPlayerIds: players
      .filter((player) => !confirmedIds.has(player.id))
      .map((player) => player.id),
    totals: {
      predictions: predictions.length,
      qualifiedPositions: qualifiedPredictions.length,
      validationErrors: 0,
    },
    submissions,
    predictions,
    qualifiedPredictions,
    previousPositions: {},
  };
}
