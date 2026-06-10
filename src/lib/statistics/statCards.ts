import players from "../../data/players.json";
import { rerankToUniverse } from "./statCardsRerank";

/**
 * Registry de fichas estadisticas jugables (Data Arena).
 *
 * Las fichas viven en `src/data/stat-cards/players/` y son contrato editorial
 * resuelto. El registry normaliza sus rankings al universo cargado, las indexa
 * por `player.id` y resuelve los avatares reales desde `players.json`.
 */

export interface StatCardMetric {
  key: string;
  value: number;
  rank: string;
}

export interface StatCardVisualHint {
  front: string;
  back: string;
  animation: string;
}

export interface StatSubCard {
  cardId: string;
  cardType: string;
  deck: string;
  rarity: "comun" | "rara" | "epica" | "legendaria" | "mitica" | string;
  emoji: string;
  title: string;
  headline: string;
  metric: StatCardMetric;
  reading: string;
  shareText: string;
  visualHint: StatCardVisualHint;
}

export interface PlayableCardMeta {
  title: string;
  subtitle: string;
  primaryArchetype: string;
  tone: string;
  riskScore100: number;
  stabilityScore100: number;
  recommendedUse: string[];
  uiBehavior: {
    initialState: "faceDown" | "faceUp" | string;
    interaction: string;
    frontState: string;
    supportsDeckFilter: boolean;
    deckFilterLabel: string;
  };
}

export interface StatCardRankEntry {
  rank: number;
  of: number;
  value: number;
  direction?: "asc" | "desc" | string;
}

export interface RawStatCardFile {
  cardPlayableId: string;
  fileSlug: string;
  player: {
    id: string;
    displayName: string;
    officialPlayerNumber: number;
    avatarSuggestedPath?: string;
    status: string;
  };
  playableCard: PlayableCardMeta;
  summaryStats: Record<string, unknown>;
  rankings?: Record<string, StatCardRankEntry>;
  specialRanksAscending?: Record<string, StatCardRankEntry>;
  cards: StatSubCard[];
  statDetails?: Record<string, unknown>;
  implementationNotes?: Record<string, unknown>;
}

export interface PlayerStatCard {
  /** id de jugador del nucleo (`players.json`). */
  playerId: string;
  displayName: string;
  officialPlayerNumber: number;
  /** Avatar resuelto desde players.json, no desde la ficha. */
  avatar: string;
  avatarThumb: string;
  cardPlayableId: string;
  fileSlug: string;
  playableCard: PlayableCardMeta;
  summaryStats: Record<string, unknown>;
  rankings: Record<string, unknown>;
  /** Subcartas desbloqueables del jugador (mazo_jugadores). */
  cards: StatSubCard[];
  statDetails: Record<string, unknown>;
  /** Carta principal del jugador = primera subcarta (la de mayor rareza editorial). */
  primaryCard: StatSubCard | null;
}

interface PlayerRecord {
  id: string;
  name: string;
  avatar: string;
  avatarThumb: string;
  status: string;
}

const playerRecords = players as PlayerRecord[];
const playerById = new Map(playerRecords.map((player) => [player.id, player]));

const cardModules = import.meta.glob<RawStatCardFile>(
  "../../data/stat-cards/players/*.json",
  { eager: true, import: "default" }
);

const rerankedCards = rerankToUniverse(Object.values(cardModules));

function normalize(raw: RawStatCardFile): PlayerStatCard {
  const record = playerById.get(raw.player.id);
  const avatar = record?.avatar ?? `/assets/players/${raw.player.id}.webp`;
  const avatarThumb =
    record?.avatarThumb ?? `/assets/players/thumbs/${raw.player.id}.webp`;

  return {
    playerId: raw.player.id,
    displayName: record?.name ?? raw.player.displayName,
    officialPlayerNumber: raw.player.officialPlayerNumber,
    avatar,
    avatarThumb,
    cardPlayableId: raw.cardPlayableId,
    fileSlug: raw.fileSlug,
    playableCard: raw.playableCard,
    summaryStats: raw.summaryStats ?? {},
    rankings: raw.rankings ?? {},
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    statDetails: raw.statDetails ?? {},
    primaryCard:
      Array.isArray(raw.cards) && raw.cards.length > 0 ? raw.cards[0] : null,
  };
}

const statCardsByPlayer: Map<string, PlayerStatCard> = new Map(
  rerankedCards
    .map((raw) => normalize(raw))
    .map((card) => [card.playerId, card])
);

const orderedStatCards: PlayerStatCard[] = Array.from(
  statCardsByPlayer.values()
).sort((a, b) => a.officialPlayerNumber - b.officialPlayerNumber);

/** Todas las fichas jugables disponibles, ordenadas por numero oficial. */
export function getPlayerStatCards(): PlayerStatCard[] {
  return orderedStatCards;
}

/** Ficha jugable de un jugador, o null si no tiene ficha cargada. */
export function getPlayerStatCard(playerId: string): PlayerStatCard | null {
  return statCardsByPlayer.get(playerId) ?? null;
}

/** Ids de jugadores con ficha estadistica cargada. */
export function getStatCardPlayerIds(): string[] {
  return orderedStatCards.map((card) => card.playerId);
}

/** True si el jugador tiene ficha jugable. */
export function hasStatCard(playerId: string): boolean {
  return statCardsByPlayer.has(playerId);
}
