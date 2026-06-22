import { calculateGroupStandings } from "../../sections/04_predicciones/predicciones.standings.js";

/**
 * Tabla real de un grupo a partir de resultados oficiales (polla_official_results).
 *
 * Reusa el motor de standings de predicciones (puntos 3/1/0, orden PTS > DG >
 * GF > head-to-head > indice original). El desempate head-to-head es la regla
 * FIFA real, por eso se conserva en lugar del orden alfabetico.
 *
 * @param {{ group: object, matches: object[], officialResults: object[] }} args
 *   group: entrada de groups.json (teams + id). matches: fixture.json completo.
 *   officialResults: payloads remotos ({matchId, homeTeamScore, awayTeamScore}).
 * @returns {{ groupId: string, completedMatches: number, totalMatches: number, isComplete: boolean, standings: object[] }}
 */
export function buildOfficialGroupStandings({ group, matches = [], officialResults = [] }) {
  const groupMatches = matches.filter((match) => match.groupId === group?.id);

  const resultsMap = {};
  for (const result of officialResults) {
    if (
      result &&
      result.matchId &&
      Number.isInteger(Number(result.homeTeamScore)) &&
      Number.isInteger(Number(result.awayTeamScore))
    ) {
      resultsMap[result.matchId] = {
        homeScore: Number(result.homeTeamScore),
        awayScore: Number(result.awayTeamScore),
      };
    }
  }

  return calculateGroupStandings(group, groupMatches, resultsMap);
}

const readScores = (payload) => {
  const home = payload?.homeScore ?? payload?.homeTeamScore;
  const away = payload?.awayScore ?? payload?.awayTeamScore;
  const h = Number(home);
  const a = Number(away);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return null;
  return { homeScore: h, awayScore: a };
};

/**
 * Tabla de grupo desde resultados OFICIALES mezclados con LIVE (provisional).
 *
 * Oficial es autoritativo (pisa al live del mismo partido); el live solo rellena
 * partidos aun no oficiales. NO hace gating de fase: asume que `live` ya viene
 * filtrado a "los que cuentan" por F1 (resolveActiveWindow). El mapeo *TeamScore ->
 * *Score se tolera aqui (igual que buildOfficialGroupStandings), no es un segundo
 * gating. Reusa calculateGroupStandings (desempate gratis).
 *
 * @param {{ group: object, matches: object[], official: object[], live: object[] }} args
 * @returns {ReturnType<typeof calculateGroupStandings> & { isProvisional: boolean, liveCount: number, finishedCount: number }}
 */
export function buildMergedGroupStandings({ group, matches = [], official = [], live = [] }) {
  const groupMatches = matches.filter((match) => match.groupId === group?.id);
  const groupMatchIds = new Set(groupMatches.map((match) => match.id));

  const resultsMap = {};
  let finishedCount = 0;
  for (const result of official) {
    if (!result?.matchId || !groupMatchIds.has(result.matchId)) continue;
    const scores = readScores(result);
    if (!scores) continue;
    if (!resultsMap[result.matchId]) finishedCount += 1;
    resultsMap[result.matchId] = scores;
  }

  let liveCount = 0;
  for (const result of live) {
    if (!result?.matchId || !groupMatchIds.has(result.matchId)) continue;
    if (resultsMap[result.matchId]) continue; // oficial pisa live
    const scores = readScores(result);
    if (!scores) continue;
    resultsMap[result.matchId] = scores;
    liveCount += 1;
  }

  const standings = calculateGroupStandings(group, groupMatches, resultsMap);
  return { ...standings, finishedCount, liveCount, isProvisional: liveCount > 0 };
}
