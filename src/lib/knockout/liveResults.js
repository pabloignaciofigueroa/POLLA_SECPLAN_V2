// Resultados VIVOS de la llave en modo LOCAL. Lee/escribe localStorage y mergea con el seed
// commiteado (knockout-results.json). Fuente de verdad en runtime = localStorage; el seed es
// el respaldo/inicial. Emite un evento + 'storage' para sincronizar pestañas/secciones.
export const KNOCKOUT_RESULTS_KEY = "polla:knockoutResults";
export const KNOCKOUT_RESULTS_EVENT = "polla:knockout-results-updated";

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch {}
}

/**
 * Mergea dos listas/maps de resultados por matchId (el segundo gana), con UNA excepción:
 * un resultado FINAL en `base` (seed oficial commiteado) NO es pisado por uno LIVE en `override`
 * (un marcador EN VIVO local viejo). Lo oficial/finalizado manda; una corrección final→final sí
 * pisa. Cuando `base` es null/vacío (caso del admin editando local) no hay nada que proteger.
 */
export function mergeResults(base, override) {
  const toMap = (r) => {
    if (!r) return {};
    if (Array.isArray(r)) {
      const m = {};
      for (const x of r) if (x && x.matchId) m[x.matchId] = x;
      return m;
    }
    return { ...r };
  };
  const baseMap = toMap(base);
  const overrideMap = toMap(override);
  const merged = { ...baseMap };
  for (const [matchId, ov] of Object.entries(overrideMap)) {
    const bs = merged[matchId];
    // Final oficial (seed) vs live local viejo -> se queda el final oficial.
    if (bs && bs.status === "final" && ov && ov.status === "live") continue;
    merged[matchId] = ov;
  }
  return merged;
}

/**
 * Lee el estado vivo (localStorage) mergeado sobre el seed.
 * @param {object} seed  knockout-results.json ({ slotAssignments, results })
 * @returns {{ assignments: object, results: object }}
 */
export function readLiveKnockout(seed = {}) {
  let local = {};
  if (typeof window !== "undefined") {
    try { local = JSON.parse(safeGet(KNOCKOUT_RESULTS_KEY) || "null") || {}; } catch { local = {}; }
  }
  return {
    assignments: { ...(seed.slotAssignments ?? {}), ...(local.slotAssignments ?? {}) },
    results: mergeResults(seed.results, local.results),
  };
}

/** Devuelve el objeto local crudo guardado (para que el admin lo edite). */
export function readLocalKnockout() {
  if (typeof window === "undefined") return { slotAssignments: {}, results: {} };
  try {
    const parsed = JSON.parse(safeGet(KNOCKOUT_RESULTS_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      return { slotAssignments: parsed.slotAssignments ?? {}, results: mergeResults(null, parsed.results) };
    }
  } catch {}
  return { slotAssignments: {}, results: {} };
}

/** Persiste el estado local y notifica. `data` = { slotAssignments, results(map o array) }. */
export function writeLocalKnockout(data) {
  if (typeof window === "undefined") return;
  const payload = {
    slotAssignments: data?.slotAssignments ?? {},
    results: mergeResults(null, data?.results),
  };
  safeSet(KNOCKOUT_RESULTS_KEY, JSON.stringify(payload));
  try {
    window.dispatchEvent(new CustomEvent(KNOCKOUT_RESULTS_EVENT, { detail: payload }));
  } catch {}
}

/** Suscribe a cambios (mismo tab via CustomEvent, otras pestañas via 'storage'). */
export function subscribeLiveKnockout(callback) {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => callback();
  const onStorage = (e) => { if (!e || e.key === KNOCKOUT_RESULTS_KEY) callback(); };
  window.addEventListener(KNOCKOUT_RESULTS_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KNOCKOUT_RESULTS_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
