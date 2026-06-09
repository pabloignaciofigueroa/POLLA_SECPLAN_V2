export interface CommunityPrediction {
  playerId: string;
  matchId: string;
  groupId: string;
  homeScore: number;
  awayScore: number;
  status: "complete";
}

export interface QualifiedPrediction {
  playerId: string;
  groupId: string;
  position: 1 | 2;
  teamId: string;
}

export interface CommunityPredictionDataset {
  schemaVersion: "2.0";
  source: string;
  snapshotAt: string | null;
  expectedPlayers: number;
  confirmedCards: number;
  pendingPlayerIds: string[];
  totals: {
    predictions: number;
    qualifiedPositions: number;
    validationErrors: number;
  };
  submissions: Array<{
    playerId: string;
    displayName: string;
    fileName: string;
    submittedAt: string;
    status: "confirmed";
    checksum: string;
    predictionCount: number;
    qualifiedCount: number;
    replacesChecksum?: string;
  }>;
  predictions: CommunityPrediction[];
  qualifiedPredictions: QualifiedPrediction[];
  previousPositions: Record<string, number>;
}

export interface PlayerPredictionProfile {
  playerId: string;
  name: string;
  avatar: string;
  averageGoals: number;
  totalGoals: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  uniqueExactScores: number;
  loneTendencies: number;
  badge: string;
  closestPlayerId: string | null;
  oppositePlayerId: string | null;
}

export interface MatchCommunityPulse {
  matchId: string;
  matchNumber: number;
  groupId: string;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  totalCards: number;
  outcomes: { home: number; draw: number; away: number };
  exactScores: Array<{ score: string; count: number }>;
  favoriteScore: string;
  topAgreement: number;
  consensusLevel: "unanimous" | "strong" | "open" | "divided";
  averageGoals: number;
}

export interface PlayerComparison {
  playerAId: string;
  playerBId: string;
  exactMatches: number;
  tendencyMatches: number;
  qualifiedSlots: number;
}

export interface QualifierConsensus {
  groupId: string;
  teams: Array<{
    teamId: string;
    firstPlace: number;
    secondPlace: number;
    qualified: number;
  }>;
}
