import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "../supabase/supabaseClient.js";

export const LIVE_MATCH_STATE_KEY = "polla:liveMatchState";
export const LIVE_SCORE_EVENT = "polla:live-score-updated";
export const OFFICIAL_RESULTS_KEY = "polla:officialResults";
export const OFFICIAL_RESULTS_EVENT = "polla:official-results-updated";

export const ADMIN_SESSION_TOKEN_KEY = "polla:adminSessionToken";
export const ADMIN_SESSION_EXPIRES_KEY = "polla:adminSessionExpiresAt";

const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
const LIVE_TABLE = "polla_live_match";
const RESULTS_TABLE = "polla_official_results";

function localStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function sessionStorageGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

function sessionStorageRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readCachedLiveMatch() {
  const parsed = parseJson(localStorageGet(LIVE_MATCH_STATE_KEY), null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function readCachedOfficialResults() {
  const parsed = parseJson(localStorageGet(OFFICIAL_RESULTS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function cacheLiveMatch(state) {
  if (!state) return;
  localStorageSet(LIVE_MATCH_STATE_KEY, JSON.stringify(state));
}

function cacheOfficialResults(results) {
  localStorageSet(OFFICIAL_RESULTS_KEY, JSON.stringify(results));
}

function dispatch(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {}
}

function getAdminToken() {
  const token = sessionStorageGet(ADMIN_SESSION_TOKEN_KEY);
  if (!token || !hasValidAdminSession()) {
    clearAdminSession();
    throw new Error("La sesion de administrador expiro. Ingresa nuevamente.");
  }
  return token;
}

export function getAdminSessionToken() {
  return hasValidAdminSession()
    ? sessionStorageGet(ADMIN_SESSION_TOKEN_KEY)
    : null;
}

function requireSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase no esta configurado en este despliegue.");
  }
  return client;
}

function normalizeRemoteError(error, fallback) {
  const message = String(error?.message ?? "");
  if (
    message.includes("invalid_or_expired_admin_session") ||
    message.includes("invalid_admin_password")
  ) {
    clearAdminSession();
  }
  return new Error(message || fallback);
}

export function isRemoteLiveDataEnabled() {
  return isSupabaseConfigured();
}

export function clearAdminSession() {
  sessionStorageRemove(ADMIN_SESSION_TOKEN_KEY);
  sessionStorageRemove(ADMIN_SESSION_EXPIRES_KEY);
}

export function hasValidAdminSession() {
  const token = sessionStorageGet(ADMIN_SESSION_TOKEN_KEY);
  const expiresAt = Date.parse(sessionStorageGet(ADMIN_SESSION_EXPIRES_KEY) ?? "");
  if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearAdminSession();
    return false;
  }
  return true;
}

export async function loginAdmin(password) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_admin_login", {
    p_password: String(password ?? ""),
  });

  if (error || !data?.token || !data?.expiresAt) {
    throw normalizeRemoteError(error, "No fue posible validar la clave de administrador.");
  }

  sessionStorageSet(ADMIN_SESSION_TOKEN_KEY, String(data.token));
  sessionStorageSet(ADMIN_SESSION_EXPIRES_KEY, String(data.expiresAt));
  return data;
}

export async function validateAdminSession() {
  if (!hasValidAdminSession()) return false;

  const client = requireSupabase();
  const token = sessionStorageGet(ADMIN_SESSION_TOKEN_KEY);
  const { data, error } = await client.rpc("polla_admin_session_is_valid", {
    p_token: token,
  });

  if (error || data !== true) {
    clearAdminSession();
    return false;
  }
  return true;
}

async function fetchRemoteLiveMatch() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(LIVE_TABLE)
    .select("payload")
    .eq("id", "current")
    .maybeSingle();

  if (error) throw normalizeRemoteError(error, "No fue posible leer el marcador remoto.");
  return data?.payload ?? null;
}

async function fetchRemoteOfficialResults() {
  const client = requireSupabase();
  const { data, error } = await client
    .from(RESULTS_TABLE)
    .select("payload, match_number")
    .order("match_number", { ascending: true });

  if (error) throw normalizeRemoteError(error, "No fue posible leer los resultados remotos.");
  return (data ?? []).map((row) => row.payload).filter(Boolean);
}

export async function readLiveMatchState() {
  if (!isRemoteLiveDataEnabled()) return readCachedLiveMatch();

  try {
    const state = await fetchRemoteLiveMatch();
    if (state) cacheLiveMatch(state);
    return state ?? readCachedLiveMatch();
  } catch {
    return readCachedLiveMatch();
  }
}

export async function saveLiveMatchState(state) {
  if (!isRemoteLiveDataEnabled()) {
    cacheLiveMatch(state);
    dispatch(LIVE_SCORE_EVENT, state);
    return state;
  }

  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_save_live_match", {
    p_token: getAdminToken(),
    p_payload: state,
  });

  if (error) throw normalizeRemoteError(error, "No fue posible guardar el marcador.");
  const saved = data ?? state;
  cacheLiveMatch(saved);
  dispatch(LIVE_SCORE_EVENT, saved);
  return saved;
}

export async function readOfficialResults() {
  if (!isRemoteLiveDataEnabled()) return readCachedOfficialResults();

  try {
    const results = await fetchRemoteOfficialResults();
    cacheOfficialResults(results);
    return results;
  } catch {
    return readCachedOfficialResults();
  }
}

export async function saveOfficialResult(result) {
  if (!isRemoteLiveDataEnabled()) {
    const list = readCachedOfficialResults().filter(
      (item) => item && item.matchId !== result.matchId
    );
    list.push(result);
    cacheOfficialResults(list);
    dispatch(OFFICIAL_RESULTS_EVENT, list);
    return list;
  }

  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_save_official_result", {
    p_token: getAdminToken(),
    p_payload: result,
  });

  if (error) throw normalizeRemoteError(error, "No fue posible oficializar el resultado.");
  const list = (await readOfficialResults()).filter(
    (item) => item && item.matchId !== result.matchId
  );
  list.push(data ?? result);
  list.sort((a, b) => Number(a.matchNumber) - Number(b.matchNumber));
  cacheOfficialResults(list);
  dispatch(OFFICIAL_RESULTS_EVENT, list);
  return list;
}

export async function finalizeOfficialResult(result, nextLiveMatch) {
  if (!isRemoteLiveDataEnabled()) {
    await saveOfficialResult(result);
    await saveLiveMatchState(nextLiveMatch);
    return { result, liveMatch: nextLiveMatch };
  }

  const client = requireSupabase();
  const { data, error } = await client.rpc("polla_finalize_match", {
    p_token: getAdminToken(),
    p_result: result,
    p_next_live: nextLiveMatch,
  });

  if (error) throw normalizeRemoteError(error, "No fue posible finalizar el partido.");

  const savedResult = data?.result ?? result;
  const savedLiveMatch = data?.liveMatch ?? nextLiveMatch;
  const results = readCachedOfficialResults().filter(
    (item) => item && item.matchId !== savedResult.matchId
  );
  results.push(savedResult);
  results.sort((a, b) => Number(a.matchNumber) - Number(b.matchNumber));
  cacheOfficialResults(results);
  cacheLiveMatch(savedLiveMatch);
  dispatch(OFFICIAL_RESULTS_EVENT, results);
  dispatch(LIVE_SCORE_EVENT, savedLiveMatch);
  return { result: savedResult, liveMatch: savedLiveMatch };
}

export async function readLiveSnapshot() {
  const [liveMatch, officialResults] = await Promise.all([
    readLiveMatchState(),
    readOfficialResults(),
  ]);
  return { liveMatch, officialResults };
}

export function subscribeLiveData(callback) {
  if (typeof window === "undefined") return () => {};

  let disposed = false;
  let pending = false;

  const emit = async () => {
    if (disposed || pending) return;
    pending = true;
    try {
      const snapshot = await readLiveSnapshot();
      if (!disposed) callback(snapshot);
    } finally {
      pending = false;
    }
  };

  const onSameTab = () => emit();
  const onStorage = (event) => {
    if (
      event.key === null ||
      event.key === LIVE_MATCH_STATE_KEY ||
      event.key === OFFICIAL_RESULTS_KEY
    ) {
      emit();
    }
  };

  window.addEventListener(LIVE_SCORE_EVENT, onSameTab);
  window.addEventListener(OFFICIAL_RESULTS_EVENT, onSameTab);
  window.addEventListener("storage", onStorage);
  emit();

  let channel = null;
  const client = getSupabaseClient();
  if (client) {
    channel = client
      .channel("polla:live-data")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: LIVE_TABLE },
        emit
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: RESULTS_TABLE },
        emit
      )
      .subscribe();
  }

  return () => {
    disposed = true;
    window.removeEventListener(LIVE_SCORE_EVENT, onSameTab);
    window.removeEventListener(OFFICIAL_RESULTS_EVENT, onSameTab);
    window.removeEventListener("storage", onStorage);
    if (client && channel) client.removeChannel(channel);
  };
}

export function resolveCurrentMatch(matches, now = Date.now()) {
  if (!Array.isArray(matches) || matches.length === 0) return null;

  const ordered = [...matches].sort(
    (a, b) => toTime(a.dateUtc) - toTime(b.dateUtc)
  );

  const live = ordered.find((match) => {
    const start = toTime(match.dateUtc);
    return Number.isFinite(start) && now >= start && now <= start + LIVE_WINDOW_MS;
  });
  if (live) return live;

  const upcoming = ordered.find((match) => toTime(match.dateUtc) > now);
  if (upcoming) return upcoming;

  return ordered[ordered.length - 1];
}

function toTime(dateUtc) {
  const value = new Date(dateUtc).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}
