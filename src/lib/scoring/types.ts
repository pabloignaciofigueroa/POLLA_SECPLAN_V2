// Tipos del motor de grupo + libro contable (DEFINICION SIMULTANEA).
//
// Documentacion/contrato para los libs puros .js (via JSDoc). Sin consumidor runtime.

import type { GroupStateName } from "../liveMatch/types";

export type { GroupStateName };

/** Fila de standings, espejo de lo que devuelve calculateGroupStandings. */
export interface StandingRow {
  teamId: string;
  name: string;
  shortCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
  qualified: boolean;
  originalIndex: number;
}

/** Vista calculada en vivo de la situacion de un grupo (no es la fila DB). */
export interface GroupSituation {
  groupId: string;
  standings: StandingRow[];
  first: string | null; // teamId 1o (congelado si state==='final')
  second: string | null; // teamId 2o (congelado si state==='final')
  liveFirst: string | null; // 1o recomputado en vivo (para detectar staleness)
  liveSecond: string | null; // 2o recomputado en vivo
  state: GroupStateName;
  finishedCount: number; // partidos oficiales del grupo
  liveCount: number; // partidos live (provisionales) del grupo
  totalMatches: number; // == groups.json matchIds.length (6)
  isProvisional: boolean; // standings incluyen >=1 marcador live
  closureStale: boolean; // closure final que ya no coincide con la realidad -> forzar reapertura
}

export type LedgerOrigin = "match" | "group";
export type LedgerEstado = "provisional" | "final" | "anulado";
export type LedgerRegla =
  | "lone_wolf"
  | "exact_shared"
  | "tendency"
  | "none"
  | "group_first"
  | "group_second"
  | "group_miss";

/** Una linea auditable del libro contable. El total se reconstruye sumando lineas. */
export interface PointLedgerLine {
  playerId: string;
  origen: LedgerOrigin;
  evento: string; // matchId (match) | "first" | "second" (group)
  regla: LedgerRegla;
  puntos: number; // 0|1|3|5 (match) ; 0|1|3 (group)
  estado: LedgerEstado;
  group: string | null; // groupId
  groupState: GroupStateName | null; // estado del grupo en lineas origen 'group' (A5: dos confianzas de provisional)
  ts: number | null; // best-effort
  key: string; // clave logica de idempotencia
}

/** Fila persistida de cierre de grupo (mirror de polla_group_closure). */
export interface GroupClosure {
  groupId: string;
  state: GroupStateName;
  officialFirstTeam: string | null;
  officialSecondTeam: string | null;
  officialStandings: StandingRow[] | null;
  version: number;
  closedAt: string | null;
  closedBy: string | null;
  reopenReason: string | null;
  updatedAt: string | null;
}

/** Linea de bono de clasificacion (subconjunto de PointLedgerLine, origen 'group'). */
export interface GroupBonusLine {
  group: string;
  playerId: string;
  position: 1 | 2;
  evento: "first" | "second";
  predictedTeamId: string | null;
  officialTeamId: string | null;
  regla: "group_first" | "group_second" | "group_miss";
  puntos: number;
  estado: "provisional" | "final";
  groupState: GroupStateName;
  key: string;
}
