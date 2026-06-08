import type { Match, MatchAccuracyRow, MatchResult, Player, Prediction } from "./types";
import {
  accuracyLevelFromPercent,
  calculateLiveAccuracy,
  calculatePointsForPrediction,
  hasCompletePrediction,
} from "../liveMatch/liveScoring.js";

export function calculateCurrentMatchAccuracy(
  currentMatch: Match,
  currentResult: MatchResult | undefined,
  predictions: Prediction[],
  players: Player[]
): MatchAccuracyRow[] {
  const predictionsForMatch = predictions.filter((prediction) => prediction.matchId === currentMatch.id);
  const predictionsByPlayer = new Map(predictionsForMatch.map((prediction) => [prediction.playerId, prediction]));
  const scoredResult =
    currentResult &&
    Number.isInteger(currentResult.homeScore) &&
    Number.isInteger(currentResult.awayScore)
      ? currentResult
      : undefined;

  const rows = players.map((player) => {
    const prediction = predictionsByPlayer.get(player.id);
    const hasPrediction = hasCompletePrediction(prediction);
    const predictionLabel = hasPrediction ? `${prediction!.homeScore} - ${prediction!.awayScore}` : "--";

    if (!scoredResult) {
      return {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        avatarThumb: player.avatarThumb,
        prediction: predictionLabel,
        differenceLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
        accuracyPercent: 0,
        level: "very_far" as const,
        points: 0,
        hitType: hasPrediction ? "pending" : "no_info",
        accuracyLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
      };
    }

    const accuracy = calculateLiveAccuracy(prediction, scoredResult);
    const score = calculatePointsForPrediction(prediction, scoredResult, predictionsForMatch);

    return {
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      avatarThumb: player.avatarThumb,
      prediction: predictionLabel,
      differenceLabel: score.label,
      accuracyPercent: accuracy.percentage,
      level: accuracyLevelFromPercent(accuracy.percentage),
      points: score.points,
      hitType: score.hitType,
      accuracyLabel: accuracy.label,
    };
  });

  return scoredResult
    ? rows.sort(
        (a, b) =>
          b.points - a.points || b.accuracyPercent - a.accuracyPercent || a.name.localeCompare(b.name)
      )
    : rows;
}
