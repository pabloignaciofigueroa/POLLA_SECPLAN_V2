/**
 * Fase del marcador compartido (fuente unica del tri-estado).
 *
 * El payload de `polla_live_match` puede representar tres realidades:
 * - "official": el partido ya tiene resultado oficial (gana siempre).
 * - "live": marcador puntuable; mueve la tabla provisional.
 * - "pending": partido preparado/visible que NO entrega puntos.
 *
 * Regla madre (de la comanda): un 0-0 preparado por Admin no puntua antes de
 * la hora real del partido; al llegar la hora (o al existir resultado/estado
 * confiable) el marcador pasa a vivo. Compatible con filas viejas de Supabase
 * que traen `status: "live"` ambiguo: el reloj decide cuando hay hora de
 * fixture, y ante ambiguedad total un 0-0 jamas regala puntos.
 *
 * La fase "live" termina solo con FINALIZAR (resultado oficial); no hay
 * expiracion automatica por tiempo, el banner provisional cubre la espera.
 */

export const LIVE_MATCH_PHASE = Object.freeze({
  OFFICIAL: "official",
  LIVE: "live",
  PENDING: "pending",
});

const hasIntegerScores = (liveMatch) =>
  Number.isInteger(liveMatch?.homeTeamScore) &&
  Number.isInteger(liveMatch?.awayTeamScore);

/**
 * @param {object} input
 * @param {object|null} input.liveMatch payload de `polla_live_match` (o cache local).
 * @param {object|null} [input.fixtureMatch] match del fixture; se leen `id` y `dateUtc`/`dateChile`.
 * @param {Array}       [input.officialResults] payloads de `polla_official_results`.
 * @param {number}      [input.now] epoch ms inyectable (tests).
 * @returns {"official"|"live"|"pending"|null} null = no hay marcador remoto que interpretar.
 */
export function resolveLiveMatchPhase({
  liveMatch,
  fixtureMatch = null,
  officialResults = [],
  now = Date.now(),
}) {
  if (!liveMatch) return null;

  const matchId = liveMatch.matchId ?? fixtureMatch?.id ?? null;
  if (!matchId) return null;

  if ((officialResults ?? []).some((result) => result?.matchId === matchId)) {
    return LIVE_MATCH_PHASE.OFFICIAL;
  }

  // Sin marcador valido no existe nada puntuable que mostrar como vivo.
  if (!hasIntegerScores(liveMatch)) return LIVE_MATCH_PHASE.PENDING;

  // Goles registrados = acto explicito del Admin: el partido esta vivo aunque
  // el reloj del visitante este desfasado. Un partido preparado siempre nace
  // 0-0, asi que esta rama jamas puntua anticipado un marcador preparado.
  if (liveMatch.homeTeamScore > 0 || liveMatch.awayTeamScore > 0) {
    return LIVE_MATCH_PHASE.LIVE;
  }

  // 0-0: el reloj decide contra la hora del fixture (un 0-0 real en juego
  // puntua tendencia empate; el 0-0 preparado queda EN ESPERA hasta la hora).
  const kickoffIso = fixtureMatch?.dateUtc ?? fixtureMatch?.dateChile ?? null;
  const kickoff = kickoffIso ? Date.parse(kickoffIso) : NaN;
  if (Number.isFinite(kickoff)) {
    return now >= kickoff ? LIVE_MATCH_PHASE.LIVE : LIVE_MATCH_PHASE.PENDING;
  }

  // 0-0 sin hora confiable: ambiguo (filas legacy con status "live"
  // preparado incluidas) => nunca regalar puntos.
  return LIVE_MATCH_PHASE.PENDING;
}
