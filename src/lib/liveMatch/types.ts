// Tipos de la capa DEFINICION SIMULTANEA (ventana activa + resultados efectivos).
//
// Los libs puros son .js y referencian estos typedefs via JSDoc
// `@typedef {import('./types').X}`. No hay consumidor runtime: este archivo es
// solo contrato/documentacion (esbuild lo ignora porque nadie lo importa en runtime).

export type GroupStateName =
  | "pending"
  | "in_definition"
  | "pending_close"
  | "final"
  | "reopened";

export type MatchPhase = "official" | "live" | "pending";

/** Un partido dentro de la ventana activa, con estado REAL (no de reloj) y *Score ya mapeado. */
export interface ActiveWindowMatch {
  matchId: string;
  groupId: string;
  displayNumber: number; // correlativo cronologico (buildMatchSequence)
  matchNumber: number; // FIFA, para orden estable del historico
  dateUtc: string;
  phase: MatchPhase; // resuelto por resolveLiveMatchPhase
  homeScore: number | null; // *Score ya mapeado; null si no es puntuable
  awayScore: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  ts: number | null; // best-effort (finishedAt/updatedAt si existe; si no, null)
}

/** Coleccion 1..N de partidos activos, agrupados por grupo. */
export interface ActiveWindow {
  matches: ActiveWindowMatch[];
  byGroup: Record<string, ActiveWindowMatch[]>;
  isSimultaneous: boolean; // algun grupo con >=2 partidos live a la vez
}

/**
 * Resultado EFECTIVO de un partido (oficial pisa live). Producido una sola vez por
 * `resolveEffectiveResults({official, window})` y consumido por los builders. Es el
 * unico contrato que F2/F3/F4 leen para marcadores: nunca el payload crudo + now.
 */
export interface EffectiveResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  official: boolean; // true = resultado oficial; false = live (provisional)
  ts: number | null; // best-effort (finishedAt/updatedAt si existe; si no, null)
}
