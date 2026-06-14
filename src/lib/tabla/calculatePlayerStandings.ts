import { calculatePlayerMovement } from "./calculatePlayerMovement";
import { formatRankingRows } from "./formatRankingRows";
import type { MatchResult, Player, Prediction, RankingRow, ScoringRules } from "./types";
import { calculatePointsForPrediction, getGoalDistance } from "../liveMatch/liveScoring.js";

export function calculatePlayerStandings(
  players: Player[],
  predictions: Prediction[],
  results: MatchResult[],
  scoringRules: ScoringRules,
  previousPositions: Record<string, number> = {},
  matchOrder: Map<string, number> = new Map()
): RankingRow[] {
  // La racha debe leerse en el orden en que se vivieron los partidos (dia/hora),
  // no en el orden FIFA. Ordenamos cronologicamente via matchOrder (matchId -> N).
  const finishedResults = results
    .filter(
      (result) => result.status === "finished" && typeof result.homeScore === "number" && typeof result.awayScore === "number"
    )
    .sort(
      (a, b) =>
        (matchOrder.get(a.matchId) ?? Number.MAX_SAFE_INTEGER) -
        (matchOrder.get(b.matchId) ?? Number.MAX_SAFE_INTEGER)
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
  // Predicciones por partido, para el conteo Lone Wolf.
  const predictionsByMatch = new Map<string, Prediction[]>();
  predictions.forEach((prediction) => {
    const list = predictionsByMatch.get(prediction.matchId) ?? [];
    list.push(prediction);
    predictionsByMatch.set(prediction.matchId, list);
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
      const allForMatch = predictionsByMatch.get(result.matchId) ?? [];
      const { points: matchPoints, hitType } = calculatePointsForPrediction(prediction, result, allForMatch);

      points += matchPoints;

      if (hitType === "lone_wolf" || hitType === "exact") {
        exactHits += 1;
        goalDifference += 4; // exacto = distancia 0
        streak.push(hitType);
      } else if (hitType === "tendency") {
        tendencyHits += 1;
        goalDifference += Math.max(0, 4 - getGoalDistance(prediction, result));
        streak.push("tendency");
      } else {
        misses += 1;
        if (hitType === "none") goalDifference += Math.max(0, 4 - getGoalDistance(prediction, result));
        streak.push("miss");
      }
    });

    const played = finishedResults.length;
    const maxPoints = played * scoringRules.loneWolf;
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
      // Ultimos 5 partidos, mas NUEVO a la izquierda (reverse del orden cronologico).
      streak: streak.slice(-5).reverse(),
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
