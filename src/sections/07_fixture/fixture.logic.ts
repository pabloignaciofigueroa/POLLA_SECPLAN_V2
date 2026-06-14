export type DisplayMode = "upcoming" | "live" | "finished_recent" | "multi_live" | "off_day";

export type MatchStatusVisual = "live" | "finished" | "today" | "upcoming";

export interface FixtureTeam {
  id: string;
  name: string;
  shortCode: string;
  sourceName?: string;
}

export interface FixtureMatch {
  id: string;
  matchNumber: number;
  /** Numero correlativo cronologico (1..N) para mostrar. Derivado, no del JSON. */
  displayNumber?: number;
  roundNumber: number;
  groupId: string;
  groupLabel: string;
  stage: string;
  dateUtc: string;
  dateChile: string;
  timeChile: string;
  location: string;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  status: string;
}

export interface MatchInfo {
  referee: { name: string; country: string };
  assistants: { name: string; country: string }[];
  weather: { temperatureC: number | null; condition: string };
  capacity: number | null;
  broadcast: string[];
  stadium: { name: string | null; city: string | null; country: string | null };
}

export interface MatchInfoBundle {
  defaultInfo: MatchInfo;
  matches: Record<string, MatchInfo>;
}

interface RelevantOptions {
  activeWindowMinutes?: number;
  recentWindowMinutes?: number;
  offDayThresholdMinutes?: number;
}

export interface RelevantMatchesResult {
  displayMode: DisplayMode;
  liveMatches: FixtureMatch[];
  nextMatches: FixtureMatch[];
  lastFinishedMatches: FixtureMatch[];
  primaryMatch?: FixtureMatch;
}

const minutes = (value: number) => value * 60 * 1000;

function sameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function getRelevantMatches(
  matches: FixtureMatch[],
  now: Date = new Date(),
  options: RelevantOptions = {}
): RelevantMatchesResult {
  const activeWindow = minutes(options.activeWindowMinutes ?? 120);
  const recentWindow = minutes(options.recentWindowMinutes ?? 360);
  const offDayThreshold = minutes(options.offDayThresholdMinutes ?? 720);
  const ordered = [...matches].sort(
    (a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime()
  );
  const nowMs = now.getTime();

  const liveMatches = ordered.filter((match) => {
    const start = new Date(match.dateUtc).getTime();
    return start <= nowMs && nowMs < start + activeWindow;
  });
  const nextMatches = ordered.filter((match) => new Date(match.dateUtc).getTime() > nowMs);
  const lastFinishedMatches = ordered
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
    const firstMatch = ordered[0];
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

export function getMatchStatusVisual(match: FixtureMatch, now: Date = new Date()): MatchStatusVisual {
  const start = new Date(match.dateUtc).getTime();
  const nowMs = now.getTime();
  const activeWindow = minutes(120);
  if (start <= nowMs && nowMs < start + activeWindow) return "live";
  if (start + activeWindow <= nowMs) return "finished";
  if (isSameChileDay(match.dateChile, now)) return "today";
  return "upcoming";
}

export function isSameChileDay(dateChileIso: string, now: Date): boolean {
  const matchDay = dateChileIso.slice(0, 10);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = formatter.format(now);
  return matchDay === today;
}

export function getTodayMatches(matches: FixtureMatch[], now: Date = new Date()): FixtureMatch[] {
  return matches.filter((match) => isSameChileDay(match.dateChile, now));
}

export function getMatchesForChileDate(
  matches: FixtureMatch[],
  dateChileIso: string
): FixtureMatch[] {
  const targetDay = dateChileIso.slice(0, 10);
  return matches
    .filter((match) => match.dateChile.slice(0, 10) === targetDay)
    .sort((a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime());
}

export function groupMatchesByDate(matches: FixtureMatch[]): { dateKey: string; matches: FixtureMatch[] }[] {
  const ordered = [...matches].sort(
    (a, b) => new Date(a.dateUtc).getTime() - new Date(b.dateUtc).getTime()
  );
  const buckets = new Map<string, FixtureMatch[]>();
  for (const match of ordered) {
    const key = match.dateChile.slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(match);
  }
  return Array.from(buckets.entries()).map(([dateKey, matches]) => ({ dateKey, matches }));
}

export function filterByGroup(matches: FixtureMatch[], group: string): FixtureMatch[] {
  if (!group || group === "all") return matches;
  return matches.filter((match) => match.groupId === group);
}

export type StageFilter = "today" | "all" | "group" | "round-of-16" | "quarter" | "semi" | "final";

export function filterByStage(
  matches: FixtureMatch[],
  stage: StageFilter,
  now: Date = new Date()
): FixtureMatch[] {
  switch (stage) {
    case "today":
      return getTodayMatches(matches, now);
    case "all":
      return matches;
    case "group":
      return matches.filter((m) => m.stage.toLowerCase().startsWith("fase de grupos"));
    case "round-of-16":
    case "quarter":
    case "semi":
    case "final":
      return [];
    default:
      return matches;
  }
}

export function getMatchInfo(bundle: MatchInfoBundle, matchId: string): MatchInfo {
  return bundle.matches[matchId] ?? bundle.defaultInfo;
}

export function getCurrentRound(matches: FixtureMatch[], now: Date = new Date()): { current: number; total: number } {
  const rounds = [...new Set(matches.map((m) => m.roundNumber))].sort((a, b) => a - b);
  const total = rounds.length || 3;
  const nowMs = now.getTime();
  let current = rounds[0] ?? 1;
  for (const round of rounds) {
    const roundMatches = matches.filter((m) => m.roundNumber === round);
    const anyUpcoming = roundMatches.some((m) => new Date(m.dateUtc).getTime() + minutes(120) > nowMs);
    if (anyUpcoming) {
      current = round;
      break;
    }
    current = round;
  }
  return { current, total };
}

export function getStageLabel(stage: StageFilter): string {
  const labels: Record<StageFilter, string> = {
    today: "Hoy",
    all: "Todos",
    group: "Fase de grupos",
    "round-of-16": "Octavos",
    quarter: "Cuartos",
    semi: "Semifinales",
    final: "Final",
  };
  return labels[stage] ?? "Todos";
}

export function getStatusLabel(status: MatchStatusVisual): string {
  if (status === "today" || status === "upcoming") return "Por jugar";
  switch (status) {
    case "live": return "En vivo";
    case "finished": return "Finalizado";
    case "today": return "Hoy";
    case "upcoming": return "Próximo";
  }
}

export function formatChileDateLong(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

export function formatChileDateHeader(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    timeZone: "America/Santiago",
  })
    .format(date)
    .toUpperCase();
}

export function formatChileTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  }).format(date);
}

export function uniqueLocationCount(matches: FixtureMatch[]): number {
  return new Set(matches.map((m) => m.location)).size;
}
