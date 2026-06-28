import { hasValidAdminSession } from "../liveMatch/liveMatchState.js";
import {
  PREDICTION_CORRECTION_DRAFTS_KEY,
  PREDICTION_EDIT_SESSION_KEY,
  isEditSessionLocallyValid,
} from "./predictionAccess.js";

// ── MODO SEGURIDAD TOTAL ──────────────────────────────────────────────────────
// Sin import ni llamadas a Supabase. La edicion de cartones por CODIGO era una
// funcion server-side (RPC): queda DESHABILITADA en modo local. Los borradores de
// correccion siguen siendo 100% locales (localStorage).

const EDIT_SESSION_EVENT = "polla:prediction-edit-session-updated";

function safeRead(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeWrite(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {}
}

function safeRemove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {}
}

function emitSessionChange(session) {
  try {
    window.dispatchEvent(new CustomEvent(EDIT_SESSION_EVENT, { detail: session }));
  } catch {}
}

export function isPredictionEditRemoteEnabled() {
  // MODO SEGURIDAD TOTAL: nunca hay backend remoto.
  return false;
}

export function getPredictionEditSession() {
  if (typeof window === "undefined") return null;
  const raw = safeRead(window.sessionStorage, PREDICTION_EDIT_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session?.playerId || !session?.token || !session?.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function savePredictionEditSession(session) {
  if (typeof window === "undefined" || !session) return;
  safeWrite(window.sessionStorage, PREDICTION_EDIT_SESSION_KEY, JSON.stringify(session));
  emitSessionChange(session);
}

export function clearPredictionEditSession({ playerId } = {}) {
  if (typeof window === "undefined") return;
  const current = getPredictionEditSession();
  if (playerId && current?.playerId && current.playerId !== playerId) return;
  safeRemove(window.sessionStorage, PREDICTION_EDIT_SESSION_KEY);
  emitSessionChange(null);
}

export function readPredictionCorrectionDrafts() {
  if (typeof window === "undefined") return {};
  const raw = safeRead(window.localStorage, PREDICTION_CORRECTION_DRAFTS_KEY);
  if (!raw) return {};
  try {
    const drafts = JSON.parse(raw);
    return drafts && typeof drafts === "object" ? drafts : {};
  } catch {
    return {};
  }
}

export function writePredictionCorrectionDraft(playerId, draft) {
  if (typeof window === "undefined" || !playerId || !draft) return;
  const drafts = readPredictionCorrectionDrafts();
  drafts[playerId] = draft;
  safeWrite(
    window.localStorage,
    PREDICTION_CORRECTION_DRAFTS_KEY,
    JSON.stringify(drafts)
  );
}

export function clearPredictionCorrectionDrafts(playerId) {
  if (typeof window === "undefined") return;
  if (!playerId) {
    safeRemove(window.localStorage, PREDICTION_CORRECTION_DRAFTS_KEY);
    return;
  }
  const drafts = readPredictionCorrectionDrafts();
  delete drafts[playerId];
  if (Object.keys(drafts).length === 0) {
    safeRemove(window.localStorage, PREDICTION_CORRECTION_DRAFTS_KEY);
  } else {
    safeWrite(
      window.localStorage,
      PREDICTION_CORRECTION_DRAFTS_KEY,
      JSON.stringify(drafts)
    );
  }
}

export async function redeemPredictionEditCode(playerId, code) {
  // MODO SEGURIDAD TOTAL: el canje de codigos era server-side (RPC). Deshabilitado en local.
  throw new Error(
    "Modo local: la edicion de cartones por codigo esta deshabilitada en esta copia."
  );
}

export async function validatePredictionEditSession(playerId) {
  const session = getPredictionEditSession();
  if (!isEditSessionLocallyValid(session, playerId)) {
    clearPredictionEditSession();
    return false;
  }
  // MODO SEGURIDAD TOTAL: sin validacion remota -> no se considera valida.
  clearPredictionEditSession();
  return false;
}

export async function createPredictionEditCode(playerId) {
  if (!hasValidAdminSession()) {
    throw new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  // MODO SEGURIDAD TOTAL: la generacion de codigos era server-side (RPC). Deshabilitada en local.
  throw new Error(
    "Modo local: la generacion de codigos de edicion esta deshabilitada en esta copia."
  );
}

export async function revokePredictionEditAccess(playerId) {
  if (!hasValidAdminSession()) {
    throw new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  // MODO SEGURIDAD TOTAL: la revocacion era server-side (RPC). Deshabilitada en local.
  throw new Error(
    "Modo local: la revocacion de acceso esta deshabilitada en esta copia."
  );
}

export async function listPredictionEditAccess() {
  // MODO SEGURIDAD TOTAL: sin backend -> no hay codigos ni sesiones remotas.
  return { codes: [], sessions: [] };
}

export function subscribePredictionEditSession(callback) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => callback(event.detail ?? null);
  window.addEventListener(EDIT_SESSION_EVENT, listener);
  return () => window.removeEventListener(EDIT_SESSION_EVENT, listener);
}
