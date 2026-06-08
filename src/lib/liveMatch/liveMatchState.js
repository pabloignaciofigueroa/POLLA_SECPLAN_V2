// Contrato y helpers del marcador en vivo de la Polla.
//
// Fixture JSON = calendario fijo (NO se modifica nunca).
// liveMatchState = marcador vivo editable desde Admin.
// La tabla recalcula leyendo este estado en el futuro.
//
// Este modulo es el unico punto de guardado del marcador. Hoy persiste en
// localStorage; mas adelante saveLiveMatchState pasara a fetch("/api/admin/live-match")
// sin tocar la UI ni el contrato.

export const LIVE_MATCH_STATE_KEY = "polla:liveMatchState";
export const LIVE_SCORE_EVENT = "polla:live-score-updated";

// Resultados oficiales acumulados localmente (historial de la temporada).
// Lista de partidos finalizados por el admin. Supabase reemplaza este store.
export const OFFICIAL_RESULTS_KEY = "polla:officialResults";
export const OFFICIAL_RESULTS_EVENT = "polla:official-results-updated";

// Ventana en la que un partido se considera "en vivo" desde su dateUtc.
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Lee y parsea el estado de marcador vivo desde localStorage.
 * @returns {object|null} liveMatchState guardado o null si no hay / es invalido.
 */
export function readLiveMatchState() {
  try {
    const raw = window.localStorage.getItem(LIVE_MATCH_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Unico punto de guardado del marcador vivo.
 * Hoy: localStorage. Futuro: reemplazar por
 *   await fetch("/api/admin/live-match", { method: "POST", body: JSON.stringify(state) })
 * manteniendo el mismo contrato.
 * @param {object} state liveMatchState a persistir.
 * @returns {object} el mismo state guardado.
 */
export function saveLiveMatchState(state) {
  try {
    window.localStorage.setItem(LIVE_MATCH_STATE_KEY, JSON.stringify(state));
  } catch {}
  // Notifica a los suscriptores de la misma pestaña (otras pestañas usan storage).
  try {
    window.dispatchEvent(new CustomEvent(LIVE_SCORE_EVENT, { detail: state }));
  } catch {}
  return state;
}

/**
 * Lee la lista de resultados oficiales acumulados localmente.
 * @returns {Array<object>} resultados finalizados (vacio si no hay).
 */
export function readOfficialResults() {
  try {
    const raw = window.localStorage.getItem(OFFICIAL_RESULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Guarda (upsert por matchId) un resultado oficial finalizado.
 * Hoy: localStorage. Futuro: POST a Supabase manteniendo el mismo contrato.
 * @param {object} result { matchId, matchNumber, homeTeamScore, awayTeamScore, ... }.
 * @returns {Array<object>} lista actualizada.
 */
export function saveOfficialResult(result) {
  const list = readOfficialResults().filter((item) => item && item.matchId !== result.matchId);
  list.push(result);
  try {
    window.localStorage.setItem(OFFICIAL_RESULTS_KEY, JSON.stringify(list));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(OFFICIAL_RESULTS_EVENT, { detail: list }));
  } catch {}
  return list;
}

/**
 * Snapshot completo de datos vivos: marcador en vivo + oficiales acumulados.
 * Es la forma que el consumidor (tabla) recibe en cada actualizacion.
 * @returns {{ liveMatch: object|null, officialResults: Array<object> }}
 */
export function readLiveSnapshot() {
  return {
    liveMatch: readLiveMatchState(),
    officialResults: readOfficialResults(),
  };
}

/**
 * Pipeline transport-agnostico. El consumidor llama esto y recibe el snapshot
 * actual de inmediato y en cada cambio (marcador en vivo u oficiales), venga de
 * la misma pestaña (CustomEvent) o de otra pestaña del mismo navegador (storage).
 *
 * SEAM FUTURO: cuando entre Supabase realtime, reimplementar SOLO esta funcion
 * para que tambien llame `callback(snapshot)` ante cambios remotos. El consumidor
 * (tabla) no cambia.
 *
 * @param {(snapshot: { liveMatch: object|null, officialResults: Array<object> }) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeLiveData(callback) {
  if (typeof window === "undefined") return () => {};

  const emit = () => callback(readLiveSnapshot());
  emit(); // snapshot inicial

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

  return () => {
    window.removeEventListener(LIVE_SCORE_EVENT, onSameTab);
    window.removeEventListener(OFFICIAL_RESULTS_EVENT, onSameTab);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Funcion pura: elige el partido en vivo o el proximo segun la hora real.
 * - "en vivo": now dentro de [dateUtc, dateUtc + LIVE_WINDOW_MS].
 * - si no hay en vivo: el proximo partido programado (dateUtc > now).
 * - si todos pasaron: el ultimo del calendario.
 * Reutilizable por server (build) y client (runtime).
 * @param {Array<object>} matches lista slim de partidos (id, matchNumber, dateUtc, homeTeam, awayTeam).
 * @param {number} now epoch ms.
 * @returns {object|null} partido elegido o null si la lista esta vacia.
 */
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
