import type { Movement } from "./types";

export function calculatePlayerMovement(position: number, previousPosition?: number): Movement {
  if (!previousPosition) return "new";
  if (position < previousPosition) return "up";
  if (position > previousPosition) return "down";
  return "same";
}
