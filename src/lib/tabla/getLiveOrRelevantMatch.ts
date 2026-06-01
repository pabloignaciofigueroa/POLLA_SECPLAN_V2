import type { Match, MatchResult } from "./types";

interface Args {
  matches: Match[];
  results: MatchResult[];
  currentMatchId?: string;
  nextMatchId?: string;
}

export function getLiveOrRelevantMatch({ matches, results, currentMatchId, nextMatchId }: Args) {
  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));
  const current =
    matches.find((match) => match.id === currentMatchId) ??
    matches.find((match) => resultByMatchId.get(match.id)?.status === "in_progress") ??
    matches[0];
  const next = matches.find((match) => match.id === nextMatchId) ?? matches.find((match) => match.id !== current?.id);

  return {
    currentMatch: current,
    currentResult: current ? resultByMatchId.get(current.id) : undefined,
    nextMatch: next,
  };
}
