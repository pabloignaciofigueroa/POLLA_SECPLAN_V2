import arenaBase from "../../data/stat-cards/data-arena-13.json";
import players from "../../data/players.json";

/**
 * Accessor de la base Data Arena (corte canonico de 13 jugadores).
 *
 * `data/stat-cards/data-arena-13.json` viene YA RESUELTA por el generador
 * externo (rankings, duelos y highlights calculados contra el universo
 * completo). Este modulo solo lee, recorta y resuelve identidad/avatares
 * desde `players.json`; no recalcula ninguna metrica.
 */

interface PlayerRecord {
  id: string;
  name: string;
  avatar: string;
  avatarThumb: string;
}

interface RawHighlightEntry {
  playerId: string;
  displayName: string;
  value: number;
  rank: number;
}

interface RawPairEntry {
  players: [string, string];
  exactScoreMatches: number;
  sameOutcomeMatches: number;
  sameQualifiedSlots: number;
  similarityScore100: number;
  rivalryScore100: number;
}

export interface ArenaHighlightEntry {
  playerId: string;
  displayName: string;
  avatarThumb: string;
  value: number;
  rank: number;
}

export interface ArenaHighlightCategory {
  key: string;
  emoji: string;
  title: string;
  description: string;
  /** "count" = entero; "avg" = promedio con decimales. */
  format: "count" | "avg";
  entries: ArenaHighlightEntry[];
}

export interface ArenaDuelSide {
  playerId: string;
  displayName: string;
  avatarThumb: string;
}

export interface ArenaDuelEntry {
  home: ArenaDuelSide;
  away: ArenaDuelSide;
  exactScoreMatches: number;
  sameOutcomeMatches: number;
  sameQualifiedSlots: number;
  /** Score principal del duelo: similarity o rivalry segun la lista. */
  score100: number;
}

const playerRecords = players as PlayerRecord[];
const playerById = new Map(playerRecords.map((player) => [player.id, player]));

const base = arenaBase as {
  players: Array<{ id: string; displayName: string }>;
  globalHighlights: Record<string, RawHighlightEntry[]>;
  pairwiseInteractions: {
    mostSimilar: RawPairEntry[];
    biggestRivalries: RawPairEntry[];
  };
};

const HIGHLIGHT_CATEGORIES: Array<
  Pick<ArenaHighlightCategory, "key" | "emoji" | "title" | "description" | "format">
> = [
  {
    key: "topLoneWolf",
    emoji: "🐺",
    title: "Lobos solitarios",
    description: "Marcadores exactos que nadie más se atrevió a poner.",
    format: "count",
  },
  {
    key: "topConsensus",
    emoji: "🤝",
    title: "Voz de la oficina",
    description: "Los que más resultados firmaron junto a la mayoría.",
    format: "count",
  },
  {
    key: "topAntiOffice",
    emoji: "😈",
    title: "Anti-oficina",
    description: "Los que más le juegan en contra al consenso.",
    format: "count",
  },
  {
    key: "topOver",
    emoji: "🔥",
    title: "Fiesta de goles",
    description: "Promedio de goles por partido más alto del universo.",
    format: "avg",
  },
  {
    key: "topUnder",
    emoji: "🧊",
    title: "Candado total",
    description: "Promedio de goles por partido más bajo del universo.",
    format: "avg",
  },
  {
    key: "topClassifierRebels",
    emoji: "🃏",
    title: "Clasificadores rebeldes",
    description: "Cupos de clasificación que casi nadie más marcó.",
    format: "count",
  },
];

function resolveSide(playerId: string, fallbackName?: string): ArenaDuelSide {
  const record = playerById.get(playerId);
  return {
    playerId,
    displayName: record?.name ?? fallbackName ?? playerId,
    avatarThumb: record?.avatarThumb ?? `/assets/players/thumbs/${playerId}.webp`,
  };
}

/** Tamaño del universo del corte canonico (13). */
export function getArenaUniverseSize(): number {
  return base.players.length;
}

/** Highlights globales ya rankeados, con identidad/avatar del nucleo. */
export function getArenaHighlights(limit = 3): ArenaHighlightCategory[] {
  return HIGHLIGHT_CATEGORIES.flatMap((category) => {
    const raw = base.globalHighlights?.[category.key];
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const entries = raw.slice(0, limit).map((entry) => {
      const side = resolveSide(entry.playerId, entry.displayName);
      return {
        playerId: entry.playerId,
        displayName: side.displayName,
        avatarThumb: side.avatarThumb,
        value: entry.value,
        rank: entry.rank,
      };
    });
    return [{ ...category, entries }];
  });
}

/** Duelos del universo: pares más parecidos y rivalidades más fuertes. */
export function getArenaDuels(limit = 3): {
  mostSimilar: ArenaDuelEntry[];
  biggestRivalries: ArenaDuelEntry[];
} {
  const toDuel = (pair: RawPairEntry, score100: number): ArenaDuelEntry => ({
    home: resolveSide(pair.players[0]),
    away: resolveSide(pair.players[1]),
    exactScoreMatches: pair.exactScoreMatches,
    sameOutcomeMatches: pair.sameOutcomeMatches,
    sameQualifiedSlots: pair.sameQualifiedSlots,
    score100,
  });

  return {
    mostSimilar: (base.pairwiseInteractions?.mostSimilar ?? [])
      .slice(0, limit)
      .map((pair) => toDuel(pair, pair.similarityScore100)),
    biggestRivalries: (base.pairwiseInteractions?.biggestRivalries ?? [])
      .slice(0, limit)
      .map((pair) => toDuel(pair, pair.rivalryScore100)),
  };
}
