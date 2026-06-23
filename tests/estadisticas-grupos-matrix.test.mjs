import assert from "node:assert/strict";
import test from "node:test";

import { resolveActiveWindow } from "../src/lib/liveMatch/activeWindow.js";
import { buildGroupBonuses } from "../src/lib/scoring/groupBonuses.js";
import {
  computeGroupSituation,
  isGroupDefinitionStarted,
  GROUP_STATE,
} from "../src/lib/fixture/groupState.js";

// F9 (Clasificacion de grupos en /estadisticas) es SOLO RENDER: la decision
// BLOQUEADO / EN DEFINICION / DEFINITIVO y los puntos +1/+3/0 salen de la
// fundacion. Este test fija el CONTRATO DE COMPOSICION que ejecuta buildGroupsModel
// (en estadisticas.client.js), sin re-implementar formula alguna en la UI:
//   1. resolveActiveWindow (F1) gatea fase y mapea *TeamScore->*Score (gatedLive).
//   2. buildGroupBonuses.byGroup solo trae grupos EN DEFINICION o cerrados.
//   3. los grupos BLOQUEADOS no aparecen en byGroup -> la UI los pinta con candado.
//   4. computeGroupSituation da estado + 1o/2o (provisional o congelado).

// Mini-torneo de 2 grupos (A y K), 6 partidos cada uno. Finales = los 2 de mayor
// dateUtc. Bonos: 1o = +1, 2o = +3.
const D1 = "2026-06-11T18:00:00Z";
const D2 = "2026-06-15T18:00:00Z";
const D3 = "2026-06-19T18:00:00Z";
const KICKOFF_3A = Date.parse(D3);
const AFTER_3A = KICKOFF_3A + 60_000;

const mt = (id, groupId, home, away, dateUtc) => ({
  id,
  groupId,
  dateUtc,
  homeTeam: { id: home },
  awayTeam: { id: away },
});

const FIXTURE = {
  matches: [
    // Grupo A
    mt("a1", "A", "a", "b", D1), mt("a6", "A", "c", "d", D1),
    mt("a2", "A", "a", "c", D2), mt("a5", "A", "b", "d", D2),
    mt("a3", "A", "a", "d", D3), mt("a4", "A", "b", "c", D3), // finales A
    // Grupo K
    mt("k1", "K", "p", "q", D1), mt("k6", "K", "r", "s", D1),
    mt("k2", "K", "p", "r", D2), mt("k5", "K", "q", "s", D2),
    mt("k7", "K", "p", "s", D3), mt("k8", "K", "q", "r", D3), // finales K
  ],
};

const GROUP_A = { id: "A", label: "Grupo A", teams: ["a", "b", "c", "d"].map((id) => ({ id })) };
const GROUP_K = { id: "K", label: "Grupo K", teams: ["p", "q", "r", "s"].map((id) => ({ id })) };
const groups = [GROUP_A, GROUP_K];

const players = [{ id: "luis", name: "Luis" }];

// luis predijo: A -> 1o=a, 2o=b ; K -> 1o=p, 2o=q
const qualifiedPredictions = [
  { playerId: "luis", groupId: "A", position: 1, teamId: "a" },
  { playerId: "luis", groupId: "A", position: 2, teamId: "b" },
  { playerId: "luis", groupId: "K", position: 1, teamId: "p" },
  { playerId: "luis", groupId: "K", position: 2, teamId: "q" },
];

// Replica EXACTA de la pieza de calculo de buildGroupsModel (estadisticas.client.js).
function buildGroupsModel({ playerId, official = [], live = [], closuresByGroup = {}, now }) {
  const win = resolveActiveWindow({ fixture: FIXTURE.matches, official, live, now });
  const gatedLive = win.matches
    .filter((m) => m.phase === "live")
    .map((m) => ({ matchId: m.matchId, homeScore: m.homeScore, awayScore: m.awayScore }));

  const { byGroup } = buildGroupBonuses({
    players,
    qualifiedPredictions,
    groups,
    fixture: FIXTURE.matches,
    official,
    live: gatedLive,
    closuresByGroup,
  });

  let definitiveTotal = 0;
  let provisionalTotal = 0;

  const cards = groups.map((group) => {
    const closure = closuresByGroup[group.id] ?? null;
    const sit = computeGroupSituation(group.id, {
      group,
      fixture: FIXTURE.matches,
      official,
      live: gatedLive,
      closure,
    });
    const started = sit.definitionStarted;
    const isFinal = sit.state === GROUP_STATE.FINAL;

    if (!started && !isFinal) {
      return { groupId: group.id, state: "locked", total: null, points1: null, points2: null };
    }
    const lines = byGroup[group.id] ?? [];
    const lineFor = (evento) => lines.find((l) => l.playerId === playerId && l.evento === evento) ?? null;
    const points1 = lineFor("first")?.puntos ?? 0;
    const points2 = lineFor("second")?.puntos ?? 0;
    const total = points1 + points2;
    if (isFinal) definitiveTotal += total;
    else provisionalTotal += total;
    return {
      groupId: group.id,
      state: isFinal ? "final" : "in_definition",
      first: sit.first,
      second: sit.second,
      points1,
      points2,
      total,
    };
  });

  return { cards, definitiveTotal, provisionalTotal };
}

test("Caso 1: sin finales abiertos -> los 2 grupos BLOQUEADOS, sin puntos ni 1o/2o", () => {
  // Hay marcadores de fechas 1-2 (no finales): NO deben abrir la definicion.
  const model = buildGroupsModel({
    playerId: "luis",
    official: [{ matchId: "a2", homeTeamScore: 1, awayTeamScore: 0 }],
    live: [{ matchId: "k1", homeTeamScore: 2, awayTeamScore: 1, updatedAt: D1 }],
    now: AFTER_3A,
  });
  assert.equal(model.cards.length, 2);
  model.cards.forEach((card) => {
    assert.equal(card.state, "locked", `${card.groupId} debe estar BLOQUEADO`);
    assert.equal(card.total, null);
  });
  assert.equal(model.definitiveTotal, 0);
  assert.equal(model.provisionalTotal, 0);
});

test("Caso 2: un final del Grupo K en vivo -> solo K EN DEFINICION; A sigue BLOQUEADO", () => {
  // k7 final en vivo: p le gana a s (1o p). Basta UNO para abrir la definicion.
  const model = buildGroupsModel({
    playerId: "luis",
    official: [],
    live: [{ matchId: "k7", homeTeamScore: 2, awayTeamScore: 0, updatedAt: AFTER_3A }],
    now: AFTER_3A,
  });
  const a = model.cards.find((c) => c.groupId === "A");
  const k = model.cards.find((c) => c.groupId === "K");
  assert.equal(a.state, "locked");
  assert.equal(k.state, "in_definition");
  // El gatillo es la fundacion, no la UI.
  assert.equal(
    isGroupDefinitionStarted("A", { group: GROUP_A, fixture: FIXTURE.matches, official: [], live: [{ matchId: "k7", homeScore: 2, awayScore: 0 }], now: AFTER_3A }),
    false
  );
  // K provisional: total entre 0 y +4 (1o +1 / 2o +3), nunca negativo.
  assert.ok(k.total >= 0 && k.total <= 4);
  assert.equal(model.provisionalTotal, k.total);
  assert.equal(model.definitiveTotal, 0);
});

test("puntos por linea: acertar 1o vale +1, acertar 2o vale +3, fallar 0", () => {
  // Forzamos por oficiales un orden conocido en K: p 1o, q 2o.
  // p gana sus 3; q gana 2; r 1; s 0 -> orden p>q>r>s.
  const official = [
    { matchId: "k1", homeTeamScore: 3, awayTeamScore: 0 }, // p vs q -> p
    { matchId: "k6", homeTeamScore: 1, awayTeamScore: 0 }, // r vs s -> r
    { matchId: "k2", homeTeamScore: 3, awayTeamScore: 0 }, // p vs r -> p
    { matchId: "k5", homeTeamScore: 3, awayTeamScore: 0 }, // q vs s -> q
    { matchId: "k7", homeTeamScore: 3, awayTeamScore: 0 }, // p vs s -> p (final)
    { matchId: "k8", homeTeamScore: 3, awayTeamScore: 0 }, // q vs r -> q (final)
  ];
  const model = buildGroupsModel({ playerId: "luis", official, live: [], now: AFTER_3A });
  const k = model.cards.find((c) => c.groupId === "K");
  assert.equal(k.state, "in_definition"); // sin closure: provisional aunque todos oficiales
  assert.equal(k.first, "p");
  assert.equal(k.second, "q");
  // luis predijo 1o=p (acierta -> +1), 2o=q (acierta -> +3).
  assert.equal(k.points1, 1);
  assert.equal(k.points2, 3);
  assert.equal(k.total, 4);
});

test("DEFINITIVO solo con closure final: el total cuenta como definitivo, no provisional", () => {
  const official = [
    { matchId: "k1", homeTeamScore: 3, awayTeamScore: 0 },
    { matchId: "k6", homeTeamScore: 1, awayTeamScore: 0 },
    { matchId: "k2", homeTeamScore: 3, awayTeamScore: 0 },
    { matchId: "k5", homeTeamScore: 3, awayTeamScore: 0 },
    { matchId: "k7", homeTeamScore: 3, awayTeamScore: 0 },
    { matchId: "k8", homeTeamScore: 3, awayTeamScore: 0 },
  ];
  const closuresByGroup = {
    K: { groupId: "K", state: "final", officialFirstTeam: "p", officialSecondTeam: "q", version: 1 },
  };
  const model = buildGroupsModel({ playerId: "luis", official, live: [], closuresByGroup, now: AFTER_3A });
  const k = model.cards.find((c) => c.groupId === "K");
  assert.equal(k.state, "final");
  assert.equal(k.total, 4);
  assert.equal(model.definitiveTotal, 4);
  assert.equal(model.provisionalTotal, 0);
});
