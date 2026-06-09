export type PredictionAccessStatus =
  | "pending"
  | "official-locked"
  | "official-editing";

export interface PredictionEditSession {
  token: string;
  playerId: string;
  expiresAt: string;
}

export interface PredictionAccessState {
  playerId: string | null;
  state: PredictionAccessStatus;
  submission: {
    playerId: string;
    checksum: string;
    submittedAt: string;
    status: "confirmed";
  } | null;
  isOfficial: boolean;
  canReadStatistics: boolean;
  canEdit: boolean;
  locallyComplete: boolean;
  editExpiresAt: string | null;
}

export interface PredictionCorrectionMetadata {
  replacesChecksum: string;
  correctionGeneratedAt: string;
  correctionPlayerId: string;
}
