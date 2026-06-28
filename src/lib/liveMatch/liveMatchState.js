// ── MODO SEGURIDAD TOTAL: sin Supabase. Estado de marcadores/resultados 100% LOCAL
// (localStorage + eventos same-tab/storage). Sin RPC, sin realtime, sin lecturas remotas.

export const LIVE_MATCH_STATE_KEY = "polla:liveMatchState";
export const LIVE_SCORE_EVENT = "polla:live-score-updated";
export const OFFICIAL_RESULTS_KEY = "polla:officialResults";
export const OFFICIAL_RESULTS_EVENT = "polla:official-results-updated";

// DEFINICION SIMULTANEA: multi-fila live + closures de grupo (aditivo).
export const LIVE_MATCHES_KEY = "polla:liveMatches";
export const GROUP_CLOSURES_KEY = "polla:groupClosures";
export const GROUP_CLOSURES_EVENT = "polla:group-closures-updated";

export const ADMIN_SESSION_TOKEN_KEY = "polla:adminSessionToken";
export const ADMIN_SESSION_EXPIRES_KEY = "polla:adminSessionExpiresAt";

// GUARDRAIL (addendum A3): el multi-write (setLiveScore/clearLiveScore) NO se usa en
// produccion hasta que los consumidores (tabla/estadisticas/score-race) lean
// liveMatches[]. Mientras lean solo el `liveMatch` legado (el mas nuevo por updatedAt),
// dos vivos a la vez subcontarian el ranking publico. Hasta entonces el admin sigue
// escribiendo UN vivo via saveLiveMatchState (wrapper singleton). Flip a true recien
// cuando los consumidores esten migrados (Stage 1/2).
export const MULTI_LIVE_WRITE_ENABLED = true;

const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
const LIVE_TABLE = "polla_live_match";
const RESULTS_TABLE = "polla_official_results";
const CLOSURE_TABLE = "polla_group_closure";

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

// ── Helpers puros (testeables sin window/remote) ─────────────────────────────

/** El marcador vivo "legado" (single) = la fila mas nueva por updatedAt. */
export function pickNewestLiveMatch(liveMatches) {
  if (!Array.isArray(liveMatches) || liveMatches.length === 0) return null;
  let newest = null;
  let newestTs = -Infinity;
  for (const payload of liveMatches) {
    if (!payload) continue;
    const ts = Date.parse(payload.updatedAt ?? "") || 0;
    if (ts >= newestTs) {
      newestTs = ts;
      newest = payload;
    }
  }
  return newest;
}

/** snake_case (fila DB) -> camelCase (GroupClosure). */
export function mapClosureRow(row) {
  if (!row) return null;
  return {
    groupId: row.group_id ?? row.groupId ?? null,
    state: row.state ?? "pending",
    officialFirstTeam: row.official_first_team ?? row.officialFirstTeam ?? null,
    officialSecondTeam: row.official_second_team ?? row.officialSecondTeam ?? null,
    officialStandings: row.official_standings ?? row.officialStandings ?? null,
    version: Number(row.version ?? 0),
    closedAt: row.closed_at ?? row.closedAt ?? null,
    closedBy: row.closed_by ?? row.closedBy ?? null,
    reopenReason: row.reopen_reason ?? row.reopenReason ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

/** Dedup de closures por grupo: gana la de mayor version (descarta ecos viejos). */
export function dedupeClosuresByVersion(closures) {
  const byGroup = new Map();
  for (const closure of closures ?? []) {
    if (!closure?.groupId) continue;
    const prev = byGroup.get(closure.groupId);
    if (!prev || Number(closure.version ?? 0) >= Number(prev.version ?? 0)) {
      byGroup.set(closure.groupId, closure);
    }
  }
  return Array.from(byGroup.values());
}

// ── Cache local ──────────────────────────────────────────────────────────────

function readCachedLiveMatch() {
  const parsed = parseJson(localStorageGet(LIVE_MATCH_STATE_KEY), null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function readCachedLiveMatches() {
  const parsed = parseJson(localStorageGet(LIVE_MATCHES_KEY), null);
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  // Fallback: envolver el single legado si el array aun no existe.
  const single = readCachedLiveMatch();
  return single ? [single] : [];
}

function readCachedOfficialResults() {
  const parsed = parseJson(localStorageGet(OFFICIAL_RESULTS_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function readCachedGroupClosures() {
  const parsed = parseJson(localStorageGet(GROUP_CLOSURES_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function cacheLiveMatches(liveMatches) {
  const list = Array.isArray(liveMatches) ? liveMatches.filter(Boolean) : [];
  localStorageSet(LIVE_MATCHES_KEY, JSON.stringify(list));
  // Mantener la key legada (el mas nuevo) para pestanas/consumidores viejos.
  const newest = pickNewestLiveMatch(list);
  if (newest) localStorageSet(LIVE_MATCH_STATE_KEY, JSON.stringify(newest));
}

function cacheLiveMatch(state) {
  if (!state) return;
  localStorageSet(LIVE_MATCH_STATE_KEY, JSON.stringify(state));
  // Upsert por matchId en el array cache.
  const matchId = state.matchId;
  const list = readCachedLiveMatches().filter((item) => item && item.matchId !== matchId);
  list.push(state);
  localStorageSet(LIVE_MATCHES_KEY, JSON.stringify(list));
}

function cacheOfficialResults(results) {
  localStorageSet(OFFICIAL_RESULTS_KEY, JSON.stringify(results));
}

function cacheGroupClosures(closures) {
  localStorageSet(GROUP_CLOSURES_KEY, JSON.stringify(dedupeClosuresByVersion(closures)));
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

export function isRemoteLiveDataEnabled() {
  // MODO SEGURIDAD TOTAL: siempre local, nunca remoto.
  return false;
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
  // MODO SEGURIDAD TOTAL: el login de administrador remoto (RPC) quedo deshabilitado.
  // El admin local de la etapa 2 se definira en una pasada futura.
  throw new Error(
    "Modo local: el panel de administrador remoto esta deshabilitado en esta copia."
  );
}

export async function validateAdminSession() {
  // MODO SEGURIDAD TOTAL: validacion solo local (sin backend).
  return hasValidAdminSession();
}

/** Todos los marcadores vivos (multi-fila). Modo local: solo cache (localStorage). */
export async function readLiveMatches() {
  return readCachedLiveMatches();
}

/** Compat: el marcador vivo legado (single) = el mas nuevo de la multi-fila. */
export async function readLiveMatchState() {
  const list = await readLiveMatches();
  return pickNewestLiveMatch(list);
}

export async function readGroupClosures() {
  return readCachedGroupClosures();
}

export async function saveLiveMatchState(state) {
  cacheLiveMatch(state);
  dispatch(LIVE_SCORE_EVENT, state);
  return state;
}

/**
 * Multi-write por match_id (DEFINICION SIMULTANEA). GUARDRAIL A3: no usar en prod hasta
 * migrar consumidores; lanza si MULTI_LIVE_WRITE_ENABLED es false (excepto override
 * explicito para tests/migracion controlada).
 */
export async function setLiveScore(payload, { allowMultiWrite = MULTI_LIVE_WRITE_ENABLED } = {}) {
  if (!allowMultiWrite) {
    throw new Error(
      "setLiveScore deshabilitado: el multi-write no se usa hasta migrar los consumidores a liveMatches[] (MULTI_LIVE_WRITE_ENABLED)."
    );
  }
  cacheLiveMatch(payload);
  dispatch(LIVE_SCORE_EVENT, payload);
  return payload;
}

export async function clearLiveScore(matchId, { allowMultiWrite = MULTI_LIVE_WRITE_ENABLED } = {}) {
  if (!matchId) throw new Error("Falta el identificador del partido.");
  if (!allowMultiWrite) {
    throw new Error(
      "clearLiveScore deshabilitado: el multi-write no se usa hasta migrar los consumidores (MULTI_LIVE_WRITE_ENABLED)."
    );
  }
  const list = readCachedLiveMatches().filter((item) => item && item.matchId !== matchId);
  cacheLiveMatches(list);
  dispatch(LIVE_SCORE_EVENT, null);
  return list;
}

export async function readOfficialResults() {
  return readCachedOfficialResults();
}

export async function saveOfficialResult(result) {
  const list = readCachedOfficialResults().filter(
    (item) => item && item.matchId !== result.matchId
  );
  list.push(result);
  cacheOfficialResults(list);
  dispatch(OFFICIAL_RESULTS_EVENT, list);
  return list;
}

export async function deleteOfficialResult(matchId) {
  if (!matchId) throw new Error("Falta el identificador del partido.");
  const list = readCachedOfficialResults().filter(
    (item) => item && item.matchId !== matchId
  );
  cacheOfficialResults(list);
  dispatch(OFFICIAL_RESULTS_EVENT, list);
  return list;
}

export async function finalizeOfficialResult(result, nextLiveMatch) {
  await saveOfficialResult(result);
  // El partido finalizado deja de ser vivo: se quita SU fila live del cache (los demas
  // marcadores vivos quedan intactos). Sin esto el cache conservaria una fila live fantasma.
  const liveList = readCachedLiveMatches().filter(
    (item) => item && item.matchId !== result?.matchId
  );
  if (nextLiveMatch && nextLiveMatch.matchId) {
    const deduped = liveList.filter((item) => item.matchId !== nextLiveMatch.matchId);
    deduped.push(nextLiveMatch);
    cacheLiveMatches(deduped);
  } else {
    cacheLiveMatches(liveList);
  }
  dispatch(LIVE_SCORE_EVENT, nextLiveMatch ?? null);
  return { result, liveMatch: nextLiveMatch };
}

/** Cierre validado de grupo (DEFINICION SIMULTANEA). Era server-side (RPC) -> deshabilitado en local. */
export async function closeGroup(groupId, officialFirst, officialSecond, standings = []) {
  // MODO SEGURIDAD TOTAL: el cierre validado de grupo se hacia en el backend. Deshabilitado.
  throw new Error(
    "Modo local: el cierre de grupo (validado en backend) esta deshabilitado en esta copia."
  );
}

/** Reapertura de grupo (invalida la definitiva). Era server-side (RPC) -> deshabilitada en local. */
export async function reopenGroup(groupId, reason = null) {
  // MODO SEGURIDAD TOTAL: la reapertura validada de grupo se hacia en el backend. Deshabilitada.
  throw new Error(
    "Modo local: la reapertura de grupo (validada en backend) esta deshabilitada en esta copia."
  );
}

export async function readLiveSnapshot() {
  const [liveMatches, officialResults, groupClosures] = await Promise.all([
    readLiveMatches(),
    readOfficialResults(),
    readGroupClosures(),
  ]);
  return {
    liveMatch: pickNewestLiveMatch(liveMatches), // legado (compat)
    liveMatches,
    officialResults,
    groupClosures,
  };
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
      event.key === LIVE_MATCHES_KEY ||
      event.key === OFFICIAL_RESULTS_KEY ||
      event.key === GROUP_CLOSURES_KEY
    ) {
      emit();
    }
  };

  window.addEventListener(LIVE_SCORE_EVENT, onSameTab);
  window.addEventListener(OFFICIAL_RESULTS_EVENT, onSameTab);
  window.addEventListener(GROUP_CLOSURES_EVENT, onSameTab);
  window.addEventListener("storage", onStorage);
  emit();

  // MODO SEGURIDAD TOTAL: sin canal realtime remoto. El sync es 100% local
  // (eventos same-tab + 'storage' entre pestanas del mismo navegador).
  return () => {
    disposed = true;
    window.removeEventListener(LIVE_SCORE_EVENT, onSameTab);
    window.removeEventListener(OFFICIAL_RESULTS_EVENT, onSameTab);
    window.removeEventListener(GROUP_CLOSURES_EVENT, onSameTab);
    window.removeEventListener("storage", onStorage);
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
