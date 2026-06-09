export const PREDICTION_ACCESS_STATES = Object.freeze({
  pending: "pending",
  officialLocked: "official-locked",
  officialEditing: "official-editing",
});

export const PREDICTION_EDIT_SESSION_KEY = "polla:predictionEditSession";
export const PREDICTION_CORRECTION_DRAFTS_KEY = "polla:predictionCorrectionDrafts";

function asSubmissionList(source) {
  if (Array.isArray(source)) return source;
  return Array.isArray(source?.submissions) ? source.submissions : [];
}

export function getOfficialSubmission(source, playerId) {
  if (!playerId) return null;
  return asSubmissionList(source).find((submission) => submission?.playerId === playerId) ?? null;
}

export function countCompletePredictions(predictions) {
  if (!predictions || typeof predictions !== "object") return 0;
  return Object.values(predictions).filter(
    (prediction) =>
      prediction?.status === "complete" &&
      Number.isInteger(prediction?.homeScore) &&
      prediction.homeScore >= 0 &&
      Number.isInteger(prediction?.awayScore) &&
      prediction.awayScore >= 0
  ).length;
}

export function isLocallyComplete(predictions, totalMatches = 72) {
  return countCompletePredictions(predictions) >= totalMatches;
}

export function isEditSessionLocallyValid(session, playerId, now = Date.now()) {
  if (!session || session.playerId !== playerId || !session.token) return false;
  const expiresAt = Date.parse(session.expiresAt ?? "");
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function resolvePredictionAccess({
  playerId,
  submissions = [],
  localPredictions = null,
  editSession = null,
  totalMatches = 72,
  now = Date.now(),
} = {}) {
  const submission = getOfficialSubmission(submissions, playerId);
  const locallyComplete = isLocallyComplete(localPredictions, totalMatches);
  const editAllowed = Boolean(
    submission && isEditSessionLocallyValid(editSession, playerId, now)
  );

  if (!submission) {
    return {
      playerId: playerId ?? null,
      state: PREDICTION_ACCESS_STATES.pending,
      submission: null,
      isOfficial: false,
      canReadStatistics: locallyComplete,
      canEdit: true,
      locallyComplete,
      editExpiresAt: null,
    };
  }

  return {
    playerId,
    state: editAllowed
      ? PREDICTION_ACCESS_STATES.officialEditing
      : PREDICTION_ACCESS_STATES.officialLocked,
    submission,
    isOfficial: true,
    canReadStatistics: true,
    canEdit: editAllowed,
    locallyComplete,
    editExpiresAt: editAllowed ? editSession.expiresAt : null,
  };
}

export function buildOfficialPlayerBuckets(dataset, playerId) {
  const submission = getOfficialSubmission(dataset, playerId);
  if (!submission) return null;

  const predictions = {};
  for (const row of dataset?.predictions ?? []) {
    if (row?.playerId !== playerId) continue;
    predictions[row.matchId] = {
      playerId,
      matchId: row.matchId,
      groupId: row.groupId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      status: "complete",
    };
  }

  const qualified = {};
  for (const row of dataset?.qualifiedPredictions ?? []) {
    if (row?.playerId !== playerId) continue;
    qualified[row.groupId] ||= {
      playerId,
      groupId: row.groupId,
      firstPlaceTeamId: null,
      secondPlaceTeamId: null,
    };
    if (row.position === 1) qualified[row.groupId].firstPlaceTeamId = row.teamId;
    if (row.position === 2) qualified[row.groupId].secondPlaceTeamId = row.teamId;
  }

  return { submission, predictions, qualified };
}

export function isStatisticsUnlocked({
  playerId,
  confirmedPlayerIds = [],
  localPredictions = null,
  totalMatches = 72,
} = {}) {
  return Boolean(
    playerId &&
      (confirmedPlayerIds.includes(playerId) ||
        isLocallyComplete(localPredictions, totalMatches))
  );
}

export function isStatisticsUnlockedFromStorage({
  confirmedPlayerIds = [],
  totalMatches = 72,
  localStorage,
  sessionStorage,
} = {}) {
  try {
    const playerId =
      localStorage?.getItem("polla:selectedPlayerId") ||
      sessionStorage?.getItem("polla:selectedPlayerId");
    const store = JSON.parse(localStorage?.getItem("polla:predictions") || "{}");
    return isStatisticsUnlocked({
      playerId,
      confirmedPlayerIds,
      localPredictions: store?.[playerId] ?? null,
      totalMatches,
    });
  } catch {
    return false;
  }
}
