// Tipos puros de la llave eliminatoria (knockout) - Mundial 2026. Sin DOM, sin remoto. 100% local.
// Modelo de SLOTS: cada lado de un cruce puede ser un equipo concreto o un placeholder
// (posicion de grupo / mejor tercero / ganador|perdedor de otro cruce).

export type SlotType = "team" | "group" | "third" | "winner" | "runner-up";

export interface KnockoutSlot {
  type: SlotType;
  /** Codigo FIFA del equipo (type team) o del placeholder de clasificacion (group/third). */
  code?: string;
  /** Id del cruce origen (type winner/runner-up), ej. "P74". */
  from?: string;
  /** Texto a mostrar mientras el slot no es un equipo concreto. */
  label?: string;
}

export interface KnockoutMatch {
  id: string;
  matchNumber: number;
  round: string;        // "R32" | "R16" | "QF" | "SF" | "3P" | "F"
  roundLabel: string;
  bracketSlot: number;  // posicion dentro de su ronda (1..N)
  dateCL?: string;      // "2026-06-28" (hora Chile)
  timeCL?: string;      // "15:00"
  slotA: KnockoutSlot;
  slotB: KnockoutSlot;
  winnerTo?: string | null;
  loserTo?: string | null;
  status: string;       // "open" | "locked"
  predictionEnabled: boolean;
}

/** "home" = slotA, "away" = slotB (se mantiene el contrato del bucket existente). */
export type AdvanceSide = "home" | "away";

export type PredictionStatus = "empty" | "partial" | "complete";

export interface KnockoutPrediction {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  advances: AdvanceSide | null;
  status: PredictionStatus;
}

/** Slot resuelto para render (equipo concreto o placeholder). */
export interface ResolvedSlot {
  code: string;
  name: string;
  shortCode: string;
  flag: string | null;
  concrete: boolean;
}

/** Ordena cruces por su posicion en la llave (1..N). */
export function sortBySlot<T extends { bracketSlot?: number }>(matches: T[]): T[] {
  return [...matches].sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0));
}

/** Etiqueta legible del estado de un cruce. */
export function getKnockoutStatusLabel(status: PredictionStatus): string {
  if (status === "complete") return "Completo";
  if (status === "partial") return "Incompleto";
  return "Por jugar";
}
