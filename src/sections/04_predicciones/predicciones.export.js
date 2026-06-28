// Exportacion de la polla de ELIMINATORIAS - JSON oficial, nombre de archivo y descarga.
// ESM. buildKnockoutPayload / buildFileName / slugifyPlayer son puros; downloadJson corre
// solo en browser. 100% local (sin red).

export const SCHEMA_VERSION = "2.0-knockout";
export const COMPETITION = "Polla Mundialera SECPLAN 2026";

/** "Luis Renato" -> "luis_renato"; "Narigón" -> "narigon". */
export function slugifyPlayer(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "jugador";
}

const pad = (n) => String(n).padStart(2, "0");

/** predicciones_<slug>_<YYYY-MM-DD_HH-mm>.json */
export function buildFileName(playerName, date = new Date()) {
  const slug = slugifyPlayer(playerName);
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `predicciones_${slug}_${stamp}.json`;
}

/** Codigo del slot (equipo concreto) o null si es placeholder. */
function slotCode(slot) {
  return slot && slot.type === "team" && slot.code ? slot.code : null;
}

/**
 * Construye el JSON oficial de la polla de eliminatorias.
 * Incluye SOLO los cruces predecibles (R32 con ambos lados concretos) + el podio.
 * @param {object} args
 * @param {object} args.player                { id, name|displayName }
 * @param {object} args.knockoutPredictions   bucket del jugador { [matchId]: { homeScore, awayScore, advances } }
 * @param {object} args.podium                { champion, runnerUp, third, fourth }
 * @param {Array}  args.matches               todos los cruces (se filtra predictionEnabled)
 */
export function buildKnockoutPayload({
  player,
  knockoutPredictions = {},
  podium = {},
  matches = [],
  submittedAt = new Date().toISOString(),
}) {
  const predictable = matches
    .filter((m) => m && m.predictionEnabled === true)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const predictions = predictable.map((match) => {
    const pred = knockoutPredictions[match.id] ?? {};
    const codeA = slotCode(match.slotA);
    const codeB = slotCode(match.slotB);
    const qualifiedTeam =
      pred.advances === "home" ? codeA : pred.advances === "away" ? codeB : null;
    return {
      matchId: match.id,
      matchNumber: match.matchNumber,
      round: match.round,
      slotA: codeA,
      slotB: codeB,
      homeScore: pred.homeScore ?? null,
      awayScore: pred.awayScore ?? null,
      advances: pred.advances ?? null,
      qualifiedTeam,
    };
  });

  const completedMatches = predictions.filter(
    (p) => p.homeScore !== null && p.awayScore !== null && p.advances,
  ).length;

  const cleanPodium = {
    champion: podium.champion ?? null,
    runnerUp: podium.runnerUp ?? null,
    third: podium.third ?? null,
    fourth: podium.fourth ?? null,
  };
  const podiumComplete =
    Object.values(cleanPodium).every(Boolean) &&
    new Set(Object.values(cleanPodium)).size === 4;

  return {
    schemaVersion: SCHEMA_VERSION,
    competition: COMPETITION,
    stage: "knockout-round-of-32",
    submittedAt,
    player: {
      id: player?.id ?? "",
      displayName: player?.name ?? player?.displayName ?? "",
    },
    summary: {
      totalPredictableMatches: predictable.length,
      completedMatches,
      podiumComplete,
    },
    predictions,
    podium: cleanPodium,
    raw: {
      knockoutPredictions,
      podium: cleanPodium,
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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
