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
