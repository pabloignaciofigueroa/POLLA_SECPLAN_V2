export type Movement = "up" | "down" | "same" | "new";

export type AccuracyLevel = "excellent" | "close" | "regular" | "far" | "very_far";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  avatarThumb?: string;
  status: string;
}

export interface Team {
  id: string;
  name: string;
  shortCode: string;
}

export interface Match {
  id: string;
  matchNumber: number;
  groupId: string;
  groupLabel: string;
  dateChile: string;
  timeChile: string;
  location: string;
  homeTeam: Team;
  awayTeam: Team;
}

export interface MatchResult {
  matchId: string;
  status: "finished" | "in_progress" | "scheduled";
  homeScore?: number;
  awayScore?: number;
  minute?: string;
}

export interface Prediction {
  playerId: string;
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface ScoringRules {
  exact: number;
  tendency: number;
  loneWolf: number;
}

export interface RankingRow {
  playerId: string;
  name: string;
  avatar: string;
  avatarThumb?: string;
  position: number;
  previousPosition?: number;
  movement: Movement;
  points: number;
  played: number;
  exactHits: number;
  tendencyHits: number;
  misses: number;
  goalDifference: number;
  performance: number;
  streak: string[];
}

export interface MatchAccuracyRow {
  playerId: string;
  name: string;
  avatar: string;
  avatarThumb?: string;
  prediction: string;
  differenceLabel: string;
  accuracyPercent: number;
  level: AccuracyLevel;
}
