// Reglas de "se puede predecir" + resolucion de slots de la llave. ESM puro (sin DOM).
// Un cruce de dieciseisavos es predecible solo si la ronda es R32, esta "open" y ambos
// lados son equipos concretos (type "team"). Placeholders (group/third/winner/runner-up)
// se MUESTRAN pero no se pueden pronosticar hasta resolverse.

/** ¿El slot es ya un equipo concreto? */
export function isConcreteSlot(slot) {
  return Boolean(slot && slot.type === "team" && slot.code);
}

/** ¿El cruce admite pronostico ahora mismo? */
export function canPredictMatch(match) {
  if (!match) return false;
  if (match.round !== "R32") return false;
  if (match.status !== "open") return false;
  return isConcreteSlot(match.slotA) && isConcreteSlot(match.slotB);
}

/** Indexa teams.json por shortCode (codigo FIFA) para resolver banderas. */
export function buildTeamsByCode(teams = []) {
  const map = new Map();
  for (const team of teams) {
    if (team && team.shortCode) map.set(team.shortCode, team);
  }
  return map;
}

/**
 * Resuelve un slot a un objeto de display.
 * @param {object} slot        { type, code|from, label }
 * @param {Map}    teamsByCode  resultado de buildTeamsByCode(teams.json)
 * @returns {{code,name,shortCode,flag,concrete}}
 */
export function resolveSlot(slot, teamsByCode) {
  if (isConcreteSlot(slot)) {
    const team = teamsByCode?.get?.(slot.code);
    if (team) {
      return {
        code: slot.code,
        name: team.name,
        shortCode: team.shortCode,
        flag: team.flag ?? null,
        concrete: true,
      };
    }
    // Slot "team" pero sin match en teams.json: degradar a placeholder con el code.
    return { code: slot.code, name: slot.label ?? slot.code, shortCode: slot.code, flag: null, concrete: false };
  }
  // Placeholder (group/third/winner/runner-up): sin bandera, se muestra el label.
  const label = slot?.label ?? slot?.code ?? slot?.from ?? "Por definir";
  return {
    code: slot?.code ?? slot?.from ?? "",
    name: label,
    shortCode: slot?.code ?? "?",
    flag: null,
    concrete: false,
  };
}
