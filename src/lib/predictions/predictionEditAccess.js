import {
  getAdminSessionToken,
  hasValidAdminSession,
} from "../liveMatch/liveMatchState.js";
import {
  PREDICTION_CORRECTION_DRAFTS_KEY,
  PREDICTION_EDIT_SESSION_KEY,
  isEditSessionLocallyValid,
} from "./predictionAccess.js";
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "../supabase/supabaseClient.js";

const EDIT_SESSION_EVENT = "polla:prediction-edit-session-updated";

function requireSupabase() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase no esta configurado en este despliegue.");
  return client;
}

function normalizeError(error, fallback) {
  const message = String(error?.message ?? "");
  if (message.includes("invalid_or_expired_admin_session")) {
    return new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  if (message.includes("invalid_or_expired_edit_code")) {
    return new Error("El codigo es incorrecto, ya fue utilizado o expiro.");
  }
  if (message.includes("invalid_or_expired_edit_session")) {
    return new Error("La autorizacion de edicion expiro o fue revocada.");
  }
  return new Error(message || fallback);
}

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
  return isSupabaseConfigured();
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
  const client = requireSupabase();
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  const { data, error } = await client.rpc("polla_redeem_prediction_edit_code", {
    p_player_id: String(playerId ?? ""),
    p_code: normalizedCode,
  });

  if (error || !data?.token || !data?.expiresAt) {
    throw normalizeError(error, "No fue posible canjear el codigo.");
  }

  const session = {
    token: String(data.token),
    playerId: String(data.playerId ?? playerId),
    expiresAt: String(data.expiresAt),
  };
  savePredictionEditSession(session);
  return session;
}

export async function validatePredictionEditSession(playerId) {
  const session = getPredictionEditSession();
  if (!isEditSessionLocallyValid(session, playerId)) {
    clearPredictionEditSession();
    return false;
  }
  if (!isPredictionEditRemoteEnabled()) {
    clearPredictionEditSession();
    return false;
  }

  try {
    const client = requireSupabase();
    const { data, error } = await client.rpc(
      "polla_prediction_edit_session_is_valid",
      {
        p_player_id: playerId,
        p_token: session.token,
      }
    );
    if (error || data !== true) {
      clearPredictionEditSession();
      return false;
    }
    return true;
  } catch {
    clearPredictionEditSession();
    return false;
  }
}

export async function createPredictionEditCode(playerId) {
  if (!hasValidAdminSession()) {
    throw new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_create_prediction_edit_code", {
    p_token: getAdminSessionToken(),
    p_player_id: playerId,
  });
  if (error || !data?.code) {
    throw normalizeError(error, "No fue posible generar el codigo.");
  }
  return data;
}

export async function revokePredictionEditAccess(playerId) {
  if (!hasValidAdminSession()) {
    throw new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_revoke_prediction_edit_access", {
    p_token: getAdminSessionToken(),
    p_player_id: playerId,
  });
  if (error) throw normalizeError(error, "No fue posible revocar el acceso.");
  return data;
}

export async function listPredictionEditAccess() {
  if (!hasValidAdminSession()) return { codes: [], sessions: [] };
  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_list_prediction_edit_access", {
    p_token: getAdminSessionToken(),
  });
  if (error) throw normalizeError(error, "No fue posible leer las autorizaciones.");
  return {
    codes: Array.isArray(data?.codes) ? data.codes : [],
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
  };
}

export function subscribePredictionEditSession(callback) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => callback(event.detail ?? null);
  window.addEventListener(EDIT_SESSION_EVENT, listener);
  return () => window.removeEventListener(EDIT_SESSION_EVENT, listener);
}
