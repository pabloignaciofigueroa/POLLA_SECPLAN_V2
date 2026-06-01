import { calculatePlayerMovement } from "./calculatePlayerMovement";
import { formatRankingRows } from "./formatRankingRows";
import type { MatchResult, Player, Prediction, RankingRow, ScoringRules } from "./types";

function outcome(homeScore: number, awayScore: number): "home" | "away" | "draw" {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}

function predictionKey(prediction: Prediction): string {
  return `${prediction.matchId}:${prediction.homeScore}-${prediction.awayScore}`;
}

function hasCompletePrediction(prediction?: Prediction): prediction is Prediction {
  return Boolean(prediction && prediction.homeScore !== null && prediction.awayScore !== null);
}

export function calculatePlayerStandings(
  players: Player[],
  predictions: Prediction[],
  results: MatchResult[],
  scoringRules: ScoringRules,
  previousPositions: Record<string, number> = {}
): RankingRow[] {
  const finishedResults = results.filter(
    (result) => result.status === "finished" && typeof result.homeScore === "number" && typeof result.awayScore === "number"
  );

  if (finishedResults.length === 0) {
    return formatRankingRows(
      players.map((player, index) => ({
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        avatarThumb: player.avatarThumb,
        position: index + 1,
        previousPosition: index + 1,
        movement: "same",
        points: 0,
        played: 0,
        exactHits: 0,
        tendencyHits: 0,
        misses: 0,
        goalDifference: 0,
        performance: 0,
        streak: [],
      }))
    );
  }
  const predictionsByPlayerMatch = new Map(predictions.map((prediction) => [`${prediction.playerId}:${prediction.matchId}`, prediction]));
  const exactCounts = new Map<string, number>();

  finishedResults.forEach((result) => {
    predictions
      .filter(
        (prediction) =>
          prediction.matchId === result.matchId &&
          prediction.homeScore === result.homeScore &&
          prediction.awayScore === result.awayScore
      )
      .forEach((prediction) => {
        const key = predictionKey(prediction);
        exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
      });
  });

  const rows = players.map((player) => {
    let points = 0;
    let exactHits = 0;
    let tendencyHits = 0;
    let misses = 0;
    let goalDifference = 0;
    const streak: string[] = [];

    finishedResults.forEach((result) => {
      const prediction = predictionsByPlayerMatch.get(`${player.id}:${result.matchId}`);
      if (!hasCompletePrediction(prediction)) {
        misses += 1;
        streak.push("P");
        return;
      }

      const exact = prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore;
      const tendency =
        outcome(prediction.homeScore ?? 0, prediction.awayScore ?? 0) === outcome(result.homeScore ?? 0, result.awayScore ?? 0);
      const distance = Math.abs((prediction.homeScore ?? 0) - (result.homeScore ?? 0)) + Math.abs((prediction.awayScore ?? 0) - (result.awayScore ?? 0));
      goalDifference += Math.max(0, 4 - distance);

      if (exact) {
        exactHits += 1;
        points += scoringRules.exact;
        if ((exactCounts.get(predictionKey(prediction)) ?? 0) === 1) points += scoringRules.loneWolf;
        streak.push("G");
        return;
      }

      if (tendency) {
        tendencyHits += 1;
        points += scoringRules.tendency;
        streak.push("E");
        return;
      }

      misses += 1;
      streak.push("P");
    });

    const played = finishedResults.length;
    const maxPoints = played * scoringRules.exact;
    const performance = maxPoints > 0 ? (points / maxPoints) * 100 : 0;

    return {
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      avatarThumb: player.avatarThumb,
      position: 0,
      previousPosition: previousPositions[player.id],
      movement: "same",
      points,
      played,
      exactHits,
      tendencyHits,
      misses,
      goalDifference,
      performance,
      streak: streak.slice(-2),
    } satisfies RankingRow;
  });

  rows.sort((a, b) => b.points - a.points || b.performance - a.performance || b.goalDifference - a.goalDifference || a.name.localeCompare(b.name));

  return formatRankingRows(
    rows.map((row, index) => ({
      ...row,
      position: index + 1,
      movement: calculatePlayerMovement(index + 1, row.previousPosition),
    }))
  );
}
