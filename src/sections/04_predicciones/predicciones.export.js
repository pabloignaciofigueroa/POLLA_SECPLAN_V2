// Exportacion de la polla - construccion del JSON oficial, nombre de archivo y
// descarga. ESM. buildPredictionPayload / buildFileName / slugifyPlayer son puros
// y downloadJson corre solo en browser.

export const SCHEMA_VERSION = "1.0";
export const COMPETITION = "Polla Mundialera SECPLAN 2026";

/** "Luis Renato" -> "luis_renato"; "Narigón" -> "narigon". (Comanda §8) */
export function slugifyPlayer(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "jugador";
}

const pad = (n) => String(n).padStart(2, "0");

/** predicciones_<slug>_<YYYY-MM-DD_HH-mm>.json (Comanda §8) */
export function buildFileName(playerName, date = new Date()) {
  const slug = slugifyPlayer(playerName);
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `predicciones_${slug}_${stamp}.json`;
}

/**
 * Construye el JSON oficial de la polla. (Comanda §7)
 * Partidos ordenados por matchNumber; grupos en el orden de `groups`.
 * Sin datos visuales ni mocks.
 */
export function buildPredictionPayload({
  player,
  predictions = {},
  qualified = {},
  groups = [],
  matches = [],
  summary = {},
  submittedAt = new Date().toISOString(),
  correction = null,
}) {
  const matchesByGroup = new Map();
  for (const match of matches) {
    if (!matchesByGroup.has(match.groupId)) matchesByGroup.set(match.groupId, []);
    matchesByGroup.get(match.groupId).push(match);
  }

  const groupPredictions = groups.map((group) => {
    const q = qualified[group.id] ?? {};
    const groupMatches = (matchesByGroup.get(group.id) ?? [])
      .slice()
      .sort((a, b) => a.matchNumber - b.matchNumber)
      .map((match) => {
        const pred = predictions[match.id] ?? {};
        return {
          matchId: match.id,
          matchNumber: match.matchNumber,
          group: group.id,
          homeTeam: match.homeTeam?.name ?? "",
          awayTeam: match.awayTeam?.name ?? "",
          homeScore: pred.homeScore ?? null,
          awayScore: pred.awayScore ?? null,
        };
      });

    return {
      groupId: group.id,
      firstPlace: q.firstPlaceTeamId ?? null,
      secondPlace: q.secondPlaceTeamId ?? null,
      matches: groupMatches,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    competition: COMPETITION,
    submittedAt,
    ...(correction?.replacesChecksum
      ? {
          replacesChecksum: correction.replacesChecksum,
          correctionGeneratedAt: correction.generatedAt ?? submittedAt,
          correctionPlayerId: correction.playerId ?? player?.id ?? "",
        }
      : {}),
    player: {
      id: player?.id ?? "",
      displayName: player?.name ?? player?.displayName ?? "",
    },
    summary: {
      totalMatches: summary.totalMatches ?? 72,
      completedMatches: summary.completedMatches ?? 0,
      totalGroups: summary.totalGroups ?? 12,
      completedGroups: summary.completedGroups ?? 0,
      totalQualifiedSlots: summary.totalQualifiedSlots ?? 24,
      completedQualifiedSlots: summary.completedQualifiedSlots ?? 0,
    },
    groupPredictions,
    raw: {
      predictions,
      qualifiedPredictions: qualified,
    },
  };
}

/** Descarga el JSON como archivo. Solo browser. */
export function downloadJson(payload, filename) {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revocar en el siguiente tick para no cancelar la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
