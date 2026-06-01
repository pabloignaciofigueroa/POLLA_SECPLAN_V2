import type { Match, MatchAccuracyRow, MatchResult, Player, Prediction, AccuracyLevel } from "./types";

function scoreDistance(prediction: Prediction, result: MatchResult): number {
  return Math.abs((prediction.homeScore ?? 0) - (result.homeScore ?? 0)) + Math.abs((prediction.awayScore ?? 0) - (result.awayScore ?? 0));
}

function levelFromDistance(distance: number): AccuracyLevel {
  if (distance === 0) return "excellent";
  if (distance === 1) return "close";
  if (distance === 2) return "regular";
  if (distance <= 4) return "far";
  return "very_far";
}

function percentFromLevel(level: AccuracyLevel): number {
  const values: Record<AccuracyLevel, number> = {
    excellent: 100,
    close: 75,
    regular: 55,
    far: 30,
    very_far: 5,
  };
  return values[level];
}

function labelFromDistance(distance: number): string {
  if (distance === 0) return "EXACTO";
  if (distance === 1) return "-1 GOL";
  if (distance === 2) return "-2 GOLES";
  if (distance <= 4) return "LEJOS";
  return "MUY LEJOS";
}

export function calculateCurrentMatchAccuracy(
  currentMatch: Match,
  currentResult: MatchResult | undefined,
  predictions: Prediction[],
  players: Player[]
): MatchAccuracyRow[] {
  const predictionsByPlayer = new Map(
    predictions.filter((prediction) => prediction.matchId === currentMatch.id).map((prediction) => [prediction.playerId, prediction])
  );
  const scoredResult =
    currentResult &&
    Number.isInteger(currentResult.homeScore) &&
    Number.isInteger(currentResult.awayScore)
      ? currentResult
      : undefined;

  const rows = players.map((player) => {
    const prediction = predictionsByPlayer.get(player.id);
    const hasPrediction = Number.isInteger(prediction?.homeScore) && Number.isInteger(prediction?.awayScore);

    if (!scoredResult) {
      return {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        avatarThumb: player.avatarThumb,
        prediction: hasPrediction ? `${prediction.homeScore} - ${prediction.awayScore}` : "--",
        differenceLabel: hasPrediction ? "EN ESPERA" : "SIN INFO",
        accuracyPercent: 0,
        level: "very_far" as const,
      };
    }

    const distance = prediction && hasPrediction ? scoreDistance(prediction, scoredResult) : 99;
    const level = levelFromDistance(distance);

    return {
      playerId: player.id,
      name: player.name,
      avatar: player.avatar,
      avatarThumb: player.avatarThumb,
      prediction: prediction && hasPrediction ? `${prediction.homeScore} - ${prediction.awayScore}` : "--",
      differenceLabel: prediction && hasPrediction ? labelFromDistance(distance) : "SIN INFO",
      accuracyPercent: prediction && hasPrediction ? percentFromLevel(level) : 0,
      level,
    };
  });

  return scoredResult
    ? rows.sort((a, b) => b.accuracyPercent - a.accuracyPercent || a.name.localeCompare(b.name))
    : rows;
}
