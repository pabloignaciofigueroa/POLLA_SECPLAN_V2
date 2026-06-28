// V2 ELIMINATORIAS: el bump de version purga los drafts de la fase de grupos
// (predictions / qualifiedPredictions / activePredictionGroup) y estrena las llaves
// del knockout (knockoutPredictions / podiumPredictions).
export const POLLA_STORAGE_VERSION = "production-reset-2026-06-27-knockout-v2";

export const POLLA_IDENTITY_STORAGE_KEYS = [
  "polla:selectedPlayerId",
  "polla:playerConfirmed",
  "polla:selectedPlayerSnapshot",
];

export const POLLA_LOCAL_STORAGE_KEYS = [
  // Nuevas (eliminatorias)
  "polla:knockoutPredictions",
  "polla:podiumPredictions",
  // Comunes
  "polla:favoriteTeams",
  "polla:finalDownloaded",
  "polla:finalDownloadedAt",
  "polla:finalDownloadedFilename",
  "polla:finalSubmissionPayload",
  // Legado de grupos (se listan SOLO para limpiarlas en el bump de version)
  "polla:predictions",
  "polla:qualifiedPredictions",
  "polla:activePredictionGroup",
  "polla:predictionCorrectionDrafts",
];

export const POLLA_SESSION_STORAGE_KEYS = [
  // Legado de grupos (se limpian en el bump)
  "polla:activePredictionGroupIntent",
  "polla:predictionEditSession",
];

const VERSION_KEY = "polla:storageVersion";

const safeRemove = (storage, key) => {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage can be unavailable in private contexts; the UI still works.
  }
};

const safeSet = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage can be unavailable in private contexts; the UI still works.
  }
};

const safeGet = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export function resetPollaLocalState({ preserveIdentity = false } = {}) {
  if (typeof window === "undefined") return;

  if (!preserveIdentity) {
    POLLA_IDENTITY_STORAGE_KEYS.forEach((key) => safeRemove(window.localStorage, key));
  }
  POLLA_LOCAL_STORAGE_KEYS.forEach((key) => safeRemove(window.localStorage, key));
  POLLA_SESSION_STORAGE_KEYS.forEach((key) => safeRemove(window.sessionStorage, key));
  safeSet(window.localStorage, VERSION_KEY, POLLA_STORAGE_VERSION);
}

export function ensurePollaStorageVersion() {
  if (typeof window === "undefined") return;

  const currentVersion = safeGet(window.localStorage, VERSION_KEY);
  if (currentVersion !== POLLA_STORAGE_VERSION) {
    resetPollaLocalState({ preserveIdentity: true });
  }
}
