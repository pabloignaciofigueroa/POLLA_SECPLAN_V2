// Prediccion de PODIO (campeon / subcampeon / 3o / 4o). ESM puro (sin DOM). Modo local.
// El jugador elige 4 slots DISTINTOS del set de 32 clasificados (incluye placeholders).

export const PODIUM_SLOTS = ["champion", "runnerUp", "third", "fourth"];

export const PODIUM_LABELS = {
  champion: "Campeón",
  runnerUp: "Subcampeón",
  third: "Tercer lugar",
  fourth: "Cuarto lugar",
};

/** Normaliza un podio parcial a la forma canonica. */
export function normalizePodium(podium = {}) {
  return {
    champion: podium.champion ?? null,
    runnerUp: podium.runnerUp ?? null,
    third: podium.third ?? null,
    fourth: podium.fourth ?? null,
  };
}

/**
 * Valida el podio.
 * @param {object} podium     { champion, runnerUp, third, fourth } (codigos de slot)
 * @param {Set|Array} validCodes  los 32 codigos validos (de knockout-teams.json)
 * @returns {{ isComplete, filled, total, duplicates:string[], invalid:string[], errors:string[] }}
 */
export function validatePodium(podium = {}, validCodes = []) {
  const valid = validCodes instanceof Set ? validCodes : new Set(validCodes);
  const p = normalizePodium(podium);

  const picks = PODIUM_SLOTS.map((k) => p[k]);
  const chosen = picks.filter(Boolean);
  const filled = chosen.length;

  // Duplicados (un equipo no puede ocupar dos puestos).
  const seen = new Set();
  const duplicates = [];
  for (const code of chosen) {
    if (seen.has(code)) duplicates.push(code);
    seen.add(code);
  }

  // Fuera del set de 32.
  const invalid = chosen.filter((code) => !valid.has(code));

  const errors = [];
  if (duplicates.length) errors.push("No repitas equipos en el podio.");
  if (invalid.length) errors.push("Solo equipos clasificados a dieciseisavos.");

  return {
    isComplete: filled === PODIUM_SLOTS.length && duplicates.length === 0 && invalid.length === 0,
    filled,
    total: PODIUM_SLOTS.length,
    duplicates,
    invalid,
    errors,
  };
}
