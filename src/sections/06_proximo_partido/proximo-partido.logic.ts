export type DisplayMode = "upcoming" | "live" | "finished_recent" | "multi_live" | "off_day";

export interface RelevantMatch {
  id: string;
  dateUtc: string;
  groupId: string;
  groupLabel: string;
}

interface RelevantOptions {
  activeWindowMinutes?: number;
  recentWindowMinutes?: number;
  offDayThresholdMinutes?: number;
}

export interface RelevantMatchesResult<TMatch extends RelevantMatch> {
  displayMode: DisplayMode;
  liveMatches: TMatch[];
  nextMatches: TMatch[];
  lastFinishedMatches: TMatch[];
  primaryMatch?: TMatch;
}

const minutes = (value: number) => value * 60 * 1000;

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function getRelevantMatches<TMatch extends RelevantMatch>(
  matches: TMatch[],
  now = new Date(),
  options: RelevantOptions = {}
): RelevantMatchesResult<TMatch> {
  const activeWindow = minutes(options.activeWindowMinutes ?? 120);
  const recentWindow = minutes(options.recentWindowMinutes ?? 360);
  const offDayThreshold = minutes(options.offDayThresholdMinutes ?? 720);
  const orderedMatches = [...matches].sort((a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime());
  const nowMs = now.getTime();

  const liveMatches = orderedMatches.filter((match) => {
    const start = new Date(match.dateUtc).getTime();
    return start <= nowMs && nowMs < start + activeWindow;
  });

  const nextMatches = orderedMatches.filter((match) => new Date(match.dateUtc).getTime() > nowMs);
  const lastFinishedMatches = orderedMatches
    .filter((match) => new Date(match.dateUtc).getTime() + activeWindow <= nowMs)
    .reverse();

  if (liveMatches.length > 1) {
    return { displayMode: "multi_live", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: liveMatches[0] };
  }

  if (liveMatches.length === 1) {
    return { displayMode: "live", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: liveMatches[0] };
  }

  const lastFinished = lastFinishedMatches[0];
  const nextMatch = nextMatches[0];
  const lastFinishedEnd = lastFinished ? new Date(lastFinished.dateUtc).getTime() + activeWindow : 0;
  const nextStart = nextMatch ? new Date(nextMatch.dateUtc).getTime() : Number.POSITIVE_INFINITY;
  const recentFinished = lastFinished && nowMs - lastFinishedEnd <= recentWindow;
  const nextFarAway = nextStart - nowMs > offDayThreshold;

  if (recentFinished && nextFarAway) {
    return { displayMode: "finished_recent", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: lastFinished };
  }

  if (nextMatch) {
    const firstMatch = orderedMatches[0];
    const beforeTournament = firstMatch && nowMs < new Date(firstMatch.dateUtc).getTime();
    const offDay = !beforeTournament && !sameUtcDay(now, new Date(nextMatch.dateUtc)) && nextStart - nowMs > offDayThreshold;

    return {
      displayMode: offDay ? "off_day" : "upcoming",
      liveMatches,
      nextMatches,
      lastFinishedMatches,
      primaryMatch: nextMatch,
    };
  }

  return { displayMode: "off_day", liveMatches, nextMatches, lastFinishedMatches, primaryMatch: lastFinished };
}
