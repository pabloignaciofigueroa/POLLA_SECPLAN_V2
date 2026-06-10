export type RankDirection = "asc" | "desc";

interface RankEntry {
  rank?: unknown;
  of?: unknown;
  value?: unknown;
  direction?: unknown;
}

interface CardMetric {
  key?: unknown;
  value?: unknown;
  rank?: unknown;
}

interface StatCardSource {
  player?: {
    id?: unknown;
  };
  summaryStats?: Record<string, unknown>;
  rankings?: Record<string, RankEntry | undefined>;
  specialRanksAscending?: Record<string, RankEntry | undefined>;
  cards?: Array<{
    metric?: CardMetric;
  }>;
}

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const baseMetricKey = (key: string): string => key.replace(/_asc$/, "");

const playerLabel = (card: StatCardSource): string =>
  typeof card.player?.id === "string" ? card.player.id : "jugador-desconocido";

const parsePrintedRank = (label: unknown, context: string): number => {
  const match = typeof label === "string" ? label.match(/^#(\d+)\s+de\s+\d+$/i) : null;
  if (!match) {
    throw new Error(`${context}: ranking impreso invalido.`);
  }
  return Number(match[1]);
};

const competitionRank = (
  values: number[],
  playerValue: number,
  direction: RankDirection
): number =>
  1 +
  values.filter((value) =>
    direction === "desc" ? value > playerValue : value < playerValue
  ).length;

const directionForEntry = (
  direction: unknown,
  fallback: RankDirection,
  context: string
): RankDirection => {
  if (direction === undefined) return fallback;
  if (direction === "asc" || direction === "desc") return direction;
  throw new Error(`${context}: direccion de ranking invalida.`);
};

const rankFromGroup = (
  group: Record<string, RankEntry | undefined>,
  key: string
): number | null => {
  const entry = group[key] ?? group[`${key}_asc`];
  return toFiniteNumber(entry?.rank);
};

function inferCardDirection(
  printedRank: number,
  descRank: number | null,
  ascRank: number | null,
  context: string
): RankDirection {
  const matches: RankDirection[] = [];
  if (descRank === printedRank) matches.push("desc");
  if (ascRank === printedRank) matches.push("asc");

  if (matches.length !== 1) {
    throw new Error(
      `${context}: no se pudo inferir una direccion unica ` +
        `(impreso=${printedRank}, desc=${descRank ?? "n/a"}, asc=${ascRank ?? "n/a"}).`
    );
  }
  return matches[0];
}

/**
 * Reordena rankings sobre el universo completo sin mutar los JSON fuente.
 * Solo cambia rank/of y el texto visible "#R de N".
 */
export function rerankToUniverse<T extends StatCardSource>(cards: T[]): T[] {
  const clones = JSON.parse(JSON.stringify(cards)) as T[];
  const total = clones.length;

  if (total === 0) return clones;

  const valuesByMetric = new Map<string, number[]>();
  for (const card of clones) {
    for (const [key, rawValue] of Object.entries(card.summaryStats ?? {})) {
      const value = toFiniteNumber(rawValue);
      if (value === null) continue;
      const values = valuesByMetric.get(key) ?? [];
      values.push(value);
      valuesByMetric.set(key, values);
    }
  }

  const valueFor = (card: T, key: string, context: string): number => {
    const metric = baseMetricKey(key);
    const value = toFiniteNumber(card.summaryStats?.[metric]);
    if (value === null) {
      throw new Error(`${context}: falta summaryStats.${metric}.`);
    }
    return value;
  };

  const rankFor = (
    key: string,
    value: number,
    direction: RankDirection,
    context: string
  ): number => {
    const metric = baseMetricKey(key);
    const values = valuesByMetric.get(metric) ?? [];
    if (values.length !== total) {
      throw new Error(
        `${context}: la metrica ${metric} tiene ${values.length}/${total} valores.`
      );
    }
    return competitionRank(values, value, direction);
  };

  for (const card of clones) {
    const playerId = playerLabel(card);
    const rankings = card.rankings ?? {};
    const ascending = card.specialRanksAscending ?? {};

    const cardDirections = (card.cards ?? []).map((subCard, index) => {
      const key =
        typeof subCard.metric?.key === "string" ? subCard.metric.key : "";
      const context = `${playerId}.cards[${index}]`;
      if (!key) throw new Error(`${context}: falta metric.key.`);

      return inferCardDirection(
        parsePrintedRank(subCard.metric?.rank, context),
        rankFromGroup(rankings, key),
        rankFromGroup(ascending, key),
        context
      );
    });

    const recalculateGroup = (
      group: Record<string, RankEntry | undefined>,
      fallbackDirection: RankDirection,
      groupName: string
    ) => {
      for (const [key, entry] of Object.entries(group)) {
        const context = `${playerId}.${groupName}.${key}`;
        if (!entry || typeof entry !== "object") {
          throw new Error(`${context}: entrada de ranking invalida.`);
        }
        const value = valueFor(card, key, context);
        const direction = directionForEntry(
          entry.direction,
          fallbackDirection,
          context
        );
        entry.rank = rankFor(key, value, direction, context);
        entry.of = total;
      }
    };

    recalculateGroup(rankings, "desc", "rankings");
    recalculateGroup(ascending, "asc", "specialRanksAscending");

    (card.cards ?? []).forEach((subCard, index) => {
      const context = `${playerId}.cards[${index}]`;
      if (!subCard.metric || typeof subCard.metric.key !== "string") {
        throw new Error(`${context}: falta metric.`);
      }
      const key = subCard.metric.key;
      const value = valueFor(card, key, context);
      const rank = rankFor(key, value, cardDirections[index], context);
      subCard.metric.rank = `#${rank} de ${total}`;
    });
  }

  return clones;
}
