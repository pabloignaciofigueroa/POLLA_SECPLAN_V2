export function getOutcome(homeScore, awayScore) {
  const home = Number(homeScore);
  const away = Number(awayScore);
  if (home === away) return "draw";
  return home > away ? "home" : "away";
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function countBy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function sortedCounts(counts) {
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

export function getConsensusLevel(outcomes, totalCards) {
  const values = [outcomes.home, outcomes.draw, outcomes.away];
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  if (top === totalCards) return "unanimous";
  if (values.every((value) => value > 0) && top - bottom <= 1) return "divided";
  if (totalCards > 0 && top / totalCards >= 0.71) return "strong";
  return "open";
}

export function buildMatchPulses(dataset, matches) {
  const predictionsByMatch = new Map();
  for (const prediction of dataset.predictions ?? []) {
    const bucket = predictionsByMatch.get(prediction.matchId) ?? [];
    bucket.push(prediction);
    predictionsByMatch.set(prediction.matchId, bucket);
  }

  return matches.map((match) => {
    const rows = predictionsByMatch.get(match.id) ?? [];
    const outcomes = { home: 0, draw: 0, away: 0 };
    const scoreCounts = new Map();
    let totalGoals = 0;

    rows.forEach((prediction) => {
      outcomes[getOutcome(prediction.homeScore, prediction.awayScore)] += 1;
      const score = `${prediction.homeScore}-${prediction.awayScore}`;
      scoreCounts.set(score, (scoreCounts.get(score) ?? 0) + 1);
      totalGoals += prediction.homeScore + prediction.awayScore;
    });

    const exactScores = sortedCounts(scoreCounts).map(({ value, count }) => ({
      score: value,
      count,
    }));
    const topAgreement = Math.max(outcomes.home, outcomes.draw, outcomes.away);

    return {
      matchId: match.id,
      matchNumber: match.matchNumber,
      groupId: match.groupId,
      dateChile: match.dateChile,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      totalCards: rows.length,
      outcomes,
      exactScores,
      favoriteScore: exactScores[0]?.score ?? "--",
      topAgreement,
      consensusLevel: getConsensusLevel(outcomes, rows.length),
      averageGoals: rows.length ? round(totalGoals / rows.length) : 0,
    };
  });
}

export function buildQualifierConsensus(dataset, groups) {
  const rows = dataset.qualifiedPredictions ?? [];
  return groups.map((group) => {
    const teamCounts = new Map(
      group.teams.map((team) => [
        team.id,
        { teamId: team.id, firstPlace: 0, secondPlace: 0, qualified: 0 },
      ])
    );
    rows
      .filter((row) => row.groupId === group.id)
      .forEach((row) => {
        const target = teamCounts.get(row.teamId);
        if (!target) return;
        if (Number(row.position) === 1) target.firstPlace += 1;
        if (Number(row.position) === 2) target.secondPlace += 1;
        target.qualified += 1;
      });
    return {
      groupId: group.id,
      teams: [...teamCounts.values()].sort(
        (a, b) =>
          b.qualified - a.qualified ||
          b.firstPlace - a.firstPlace ||
          a.teamId.localeCompare(b.teamId)
      ),
    };
  });
}

export function buildPlayerComparisons(dataset) {
  const ids = (dataset.submissions ?? []).map((submission) => submission.playerId);
  const predictionsByPlayer = new Map(ids.map((id) => [id, new Map()]));
  const qualifiedByPlayer = new Map(ids.map((id) => [id, new Map()]));

  for (const prediction of dataset.predictions ?? []) {
    predictionsByPlayer.get(prediction.playerId)?.set(prediction.matchId, prediction);
  }
  for (const qualified of dataset.qualifiedPredictions ?? []) {
    qualifiedByPlayer
      .get(qualified.playerId)
      ?.set(`${qualified.groupId}:${qualified.position}`, qualified.teamId);
  }

  const comparisons = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const playerAId = ids[i];
      const playerBId = ids[j];
      let exactMatches = 0;
      let tendencyMatches = 0;
      let qualifiedSlots = 0;

      for (const [matchId, predictionA] of predictionsByPlayer.get(playerAId) ?? []) {
        const predictionB = predictionsByPlayer.get(playerBId)?.get(matchId);
        if (!predictionB) continue;
        if (
          predictionA.homeScore === predictionB.homeScore &&
          predictionA.awayScore === predictionB.awayScore
        ) {
          exactMatches += 1;
        }
        if (
          getOutcome(predictionA.homeScore, predictionA.awayScore) ===
          getOutcome(predictionB.homeScore, predictionB.awayScore)
        ) {
          tendencyMatches += 1;
        }
      }
      for (const [slot, teamId] of qualifiedByPlayer.get(playerAId) ?? []) {
        if (qualifiedByPlayer.get(playerBId)?.get(slot) === teamId) qualifiedSlots += 1;
      }
      comparisons.push({
        playerAId,
        playerBId,
        exactMatches,
        tendencyMatches,
        qualifiedSlots,
      });
    }
  }
  return comparisons;
}

function comparisonFor(comparisons, playerId) {
  return comparisons
    .filter(
      (comparison) =>
        comparison.playerAId === playerId || comparison.playerBId === playerId
    )
    .map((comparison) => ({
      ...comparison,
      otherId:
        comparison.playerAId === playerId
          ? comparison.playerBId
          : comparison.playerAId,
    }));
}

export function buildPlayerProfiles(dataset, players) {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const predictionsByPlayer = new Map();
  for (const prediction of dataset.predictions ?? []) {
    const bucket = predictionsByPlayer.get(prediction.playerId) ?? [];
    bucket.push(prediction);
    predictionsByPlayer.set(prediction.playerId, bucket);
  }
  const exactFrequency = countBy(
    (dataset.predictions ?? []).map(
      (prediction) =>
        `${prediction.matchId}:${prediction.homeScore}-${prediction.awayScore}`
    )
  );
  const tendencyFrequency = countBy(
    (dataset.predictions ?? []).map(
      (prediction) =>
        `${prediction.matchId}:${getOutcome(prediction.homeScore, prediction.awayScore)}`
    )
  );
  const comparisons = buildPlayerComparisons(dataset);

  const profiles = (dataset.submissions ?? []).map((submission) => {
    const rows = predictionsByPlayer.get(submission.playerId) ?? [];
    const outcomes = { home: 0, draw: 0, away: 0 };
    let totalGoals = 0;
    let uniqueExactScores = 0;
    let loneTendencies = 0;
    rows.forEach((prediction) => {
      const outcome = getOutcome(prediction.homeScore, prediction.awayScore);
      outcomes[outcome] += 1;
      totalGoals += prediction.homeScore + prediction.awayScore;
      if (
        exactFrequency.get(
          `${prediction.matchId}:${prediction.homeScore}-${prediction.awayScore}`
        ) === 1
      ) {
        uniqueExactScores += 1;
      }
      if (tendencyFrequency.get(`${prediction.matchId}:${outcome}`) === 1) {
        loneTendencies += 1;
      }
    });

    const playerComparisons = comparisonFor(comparisons, submission.playerId);
    const closest = [...playerComparisons].sort(
      (a, b) =>
        b.tendencyMatches - a.tendencyMatches ||
        b.exactMatches - a.exactMatches ||
        a.otherId.localeCompare(b.otherId)
    )[0];
    const opposite = [...playerComparisons].sort(
      (a, b) =>
        a.tendencyMatches - b.tendencyMatches ||
        a.exactMatches - b.exactMatches ||
        a.otherId.localeCompare(b.otherId)
    )[0];
    const player = playerById.get(submission.playerId) ?? {};

    return {
      playerId: submission.playerId,
      name: player.name ?? submission.displayName,
      avatar: player.avatarThumb ?? player.avatar ?? "",
      totalGoals,
      averageGoals: rows.length ? round(totalGoals / rows.length) : 0,
      homeWins: outcomes.home,
      draws: outcomes.draw,
      awayWins: outcomes.away,
      uniqueExactScores,
      loneTendencies,
      badge: "Estratega Coral",
      closestPlayerId: closest?.otherId ?? null,
      oppositePlayerId: opposite?.otherId ?? null,
    };
  });

  const maxGoals = Math.max(...profiles.map((profile) => profile.averageGoals));
  const minGoals = Math.min(...profiles.map((profile) => profile.averageGoals));
  const maxDraws = Math.max(...profiles.map((profile) => profile.draws));
  const maxLone = Math.max(...profiles.map((profile) => profile.loneTendencies));
  profiles.forEach((profile) => {
    if (profile.averageGoals === maxGoals) profile.badge = "El Goleador";
    else if (profile.averageGoals === minGoals) profile.badge = "El Cerrajero";
    else if (profile.draws === maxDraws) profile.badge = "El Empatero";
    else if (profile.loneTendencies === maxLone) profile.badge = "El Rebelde";
  });
  return profiles;
}

export function buildCommunityAnalysis({ dataset, matches, groups, teams, players }) {
  const matchPulses = buildMatchPulses(dataset, matches);
  const qualifierConsensus = buildQualifierConsensus(dataset, groups);
  const profiles = buildPlayerProfiles(dataset, players);
  const comparisons = buildPlayerComparisons(dataset);
  const scoreCounts = countBy(
    (dataset.predictions ?? []).map(
      (prediction) => `${prediction.homeScore}-${prediction.awayScore}`
    )
  );
  const favoriteScores = sortedCounts(scoreCounts).map(({ value, count }) => ({
    score: value,
    count,
  }));
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const teamSupport = new Map(
    teams.map((team) => [
      team.id,
      { teamId: team.id, name: team.name, firstPlace: 0, qualified: 0 },
    ])
  );
  (dataset.qualifiedPredictions ?? []).forEach((qualified) => {
    const row = teamSupport.get(qualified.teamId);
    if (!row) return;
    row.qualified += 1;
    if (Number(qualified.position) === 1) row.firstPlace += 1;
  });

  return {
    confirmedCards: dataset.confirmedCards ?? 0,
    expectedPlayers: dataset.expectedPlayers ?? players.length,
    snapshotAt: dataset.snapshotAt ?? null,
    profiles,
    comparisons,
    matchPulses,
    qualifierConsensus,
    favoriteScores,
    teamSupport: [...teamSupport.values()]
      .filter((row) => row.qualified > 0)
      .sort(
        (a, b) =>
          b.qualified - a.qualified ||
          b.firstPlace - a.firstPlace ||
          a.name.localeCompare(b.name)
      ),
    teamById: Object.fromEntries(
      [...teamById].map(([id, team]) => [
        id,
        {
          id,
          name: team.name,
          shortCode: team.shortCode,
          group: team.group,
          flag: team.flag,
        },
      ])
    ),
  };
}

export function mergeLocalPlayer(dataset, playerId, predictions, qualified) {
  if (!playerId || !predictions || typeof predictions !== "object") return dataset;
  const complete = Object.values(predictions).filter(
    (prediction) =>
      prediction &&
      Number.isInteger(Number(prediction.homeScore)) &&
      Number.isInteger(Number(prediction.awayScore))
  );
  if (complete.length !== 72) return dataset;

  const withoutPlayer = {
    ...dataset,
    submissions: (dataset.submissions ?? []).filter(
      (submission) => submission.playerId !== playerId
    ),
    predictions: (dataset.predictions ?? []).filter(
      (prediction) => prediction.playerId !== playerId
    ),
    qualifiedPredictions: (dataset.qualifiedPredictions ?? []).filter(
      (entry) => entry.playerId !== playerId
    ),
  };
  withoutPlayer.submissions.push({
    playerId,
    displayName: playerId,
    status: "local",
    predictionCount: 72,
    qualifiedCount: 24,
  });
  Object.values(predictions).forEach((prediction) => {
    withoutPlayer.predictions.push({
      playerId,
      matchId: prediction.matchId,
      groupId: prediction.groupId,
      homeScore: Number(prediction.homeScore),
      awayScore: Number(prediction.awayScore),
      status: "complete",
    });
  });
  Object.values(qualified ?? {}).forEach((entry) => {
    if (!entry?.groupId) return;
    if (entry.firstPlaceTeamId) {
      withoutPlayer.qualifiedPredictions.push({
        playerId,
        groupId: entry.groupId,
        position: 1,
        teamId: entry.firstPlaceTeamId,
      });
    }
    if (entry.secondPlaceTeamId) {
      withoutPlayer.qualifiedPredictions.push({
        playerId,
        groupId: entry.groupId,
        position: 2,
        teamId: entry.secondPlaceTeamId,
      });
    }
  });
  withoutPlayer.confirmedCards = withoutPlayer.submissions.length;
  return withoutPlayer;
}
