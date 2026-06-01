export type StatsState = "locked" | "unlocked";

export interface PredictionRecord {
  playerId: string;
  matchId: string;
  groupId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: "empty" | "partial" | "complete";
}

export type PlayerPredictions = Record<string, PredictionRecord>;
export type PredictionsStore = Record<string, PlayerPredictions>;

export interface ProgressSnapshot {
  completed: number;
  total: number;
  percent: number;
  state: StatsState;
}

export const TOTAL_PREDICTIONS = 72;

export function calculateProgress(
  store: PredictionsStore | null,
  playerId: string | null,
  total: number = TOTAL_PREDICTIONS
): ProgressSnapshot {
  if (!store || !playerId || !store[playerId]) {
    return { completed: 0, total, percent: 0, state: "locked" };
  }
  const bucket = store[playerId];
  const completed = Object.values(bucket).filter(
    (record) => record && record.status === "complete"
  ).length;
  const safeCompleted = Math.min(completed, total);
  const percent = total > 0 ? Math.round((safeCompleted / total) * 100) : 0;
  return {
    completed: safeCompleted,
    total,
    percent,
    state: safeCompleted >= total ? "unlocked" : "locked",
  };
}
