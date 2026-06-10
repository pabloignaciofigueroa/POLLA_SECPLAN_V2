import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { rerankToUniverse } from "../src/lib/statistics/statCardsRerank.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cardsRoot = path.resolve(here, "../src/data/stat-cards/players");

async function readOfficialCards() {
  const names = (await fs.readdir(cardsRoot))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(
    names.map(async (name) =>
      JSON.parse(await fs.readFile(path.join(cardsRoot, name), "utf8"))
    )
  );
}

function fixtureCard(id, value, printedRank, descRank, ascRank = null) {
  return {
    player: { id },
    summaryStats: { metric: value },
    rankings: {
      metric: { rank: descRank, of: 2, value, direction: "desc" },
    },
    specialRanksAscending:
      ascRank === null
        ? {}
        : {
            metric_asc: { rank: ascRank, of: 2, value, direction: "asc" },
          },
    cards: [
      {
        metric: {
          key: "metric",
          value,
          rank: printedRank,
        },
      },
    ],
  };
}

test("reordena las fichas oficiales a universo 11 sin mutar las fuentes", async () => {
  const source = await readOfficialCards();
  const before = structuredClone(source);
  const reranked = rerankToUniverse(source);

  assert.deepEqual(source, before);
  assert.equal(reranked.length, 11);
  assert.ok(
    reranked.every((card) =>
      card.cards.every((subCard) => / de 11$/.test(subCard.metric.rank))
    )
  );
  assert.ok(
    reranked.every((card) =>
      Object.values(card.rankings).every((entry) => entry.of === 11)
    )
  );
  assert.ok(
    reranked.every((card) =>
      Object.values(card.specialRanksAscending).every((entry) => entry.of === 11)
    )
  );
  reranked.forEach((card, index) => {
    assert.deepEqual(card.summaryStats, source[index].summaryStats);
    assert.deepEqual(card.playableCard, source[index].playableCard);
    card.cards.forEach((subCard, cardIndex) => {
      const original = source[index].cards[cardIndex];
      assert.equal(subCard.metric.value, original.metric.value);
      assert.equal(subCard.title, original.title);
      assert.equal(subCard.reading, original.reading);
      assert.equal(subCard.rarity, original.rarity);
    });
  });
});

test("conserva empates y respeta rankings ascendentes y descendentes", () => {
  const desc = [
    fixtureCard("uno", 10, "#1 de 2", 1),
    fixtureCard("dos", 10, "#1 de 2", 1),
  ];
  const descResult = rerankToUniverse(desc);
  assert.deepEqual(
    descResult.map((card) => card.cards[0].metric.rank),
    ["#1 de 2", "#1 de 2"]
  );

  const asc = [
    fixtureCard("bajo", 1, "#1 de 2", 2, 1),
    fixtureCard("alto", 4, "#2 de 2", 1, 2),
  ];
  const ascResult = rerankToUniverse(asc);
  assert.deepEqual(
    ascResult.map((card) => card.cards[0].metric.rank),
    ["#1 de 2", "#2 de 2"]
  );
});

test("falla si una metrica no cubre todo el universo", () => {
  const cards = [
    fixtureCard("completo", 2, "#1 de 2", 1),
    {
      ...fixtureCard("incompleto", 1, "#2 de 2", 2),
      summaryStats: {},
    },
  ];

  assert.throws(
    () => rerankToUniverse(cards),
    /falta summaryStats\.metric|tiene 1\/2 valores/
  );
});

test("falla si la direccion de una carta es ambigua", () => {
  const cards = [
    fixtureCard("uno", 2, "#1 de 2", 1, 1),
    fixtureCard("dos", 1, "#2 de 2", 2, 2),
  ];

  assert.throws(
    () => rerankToUniverse(cards),
    /no se pudo inferir una direccion unica/
  );
});

test("mantiene los casos ancla del universo oficial", async () => {
  const reranked = rerankToUniverse(await readOfficialCards());
  const byId = new Map(reranked.map((card) => [card.player.id, card]));
  const rankFor = (playerId, metricKey) =>
    byId
      .get(playerId)
      .cards.find((subCard) => subCard.metric.key === metricKey).metric.rank;

  assert.equal(rankFor("isaias", "withMajorityOutcome"), "#2 de 11");
  assert.equal(rankFor("jaime", "atLeastOneCleanSheet"), "#1 de 11");
  assert.equal(rankFor("pancho", "averageGoalsPerMatch"), "#2 de 11");
});
