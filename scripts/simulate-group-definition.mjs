// SIMULACION INTEGRAL DE UNA JORNADA DE DEFINICION (DEFINICION SIMULTANEA, F13).
//
// Capstone de la Fase 3: mete goles uno a uno y corre la jornada de definicion sobre
// las MISMAS libs que la app (NO reimplementa puntaje, desempate, gating ni cierre).
// Verifica con node:assert/strict. Sale 0 si todo pasa, !=0 si un assert falla.
//
// NO toca produccion: el "live" es un arreglo de marcadores y el "cierre" de un grupo se
// modela con un objeto closure pasado a los builders (closuresByGroup), NUNCA con la RPC.
//
// Determinismo: mismas entradas -> mismas salidas. Timestamps fijos del escenario; sin
// Date.now()/Math.random() no controlados. Correr dos veces da salida identica.
//
// Reuso estricto (ver comandas_F13_simulacion_cierre/10_contratos.md):
//   - resolveActiveWindow / resolveEffectiveResults  (lib/liveMatch/activeWindow.js)
//   - computeGroupSituation / isGroupDefinitionStarted / getGroupFinalMatches / GROUP_STATE
//     (lib/fixture/groupState.js)
//   - calculateGroupStandings / compareRows / getAutomaticQualified
//     (sections/04_predicciones/predicciones.standings.js)
//   - buildPointLedger (lib/scoring/buildPointLedger.js)
//   - buildGroupBonuses / GROUP_BONUS (lib/scoring/groupBonuses.js)
//   - calculatePointsForPrediction (lib/liveMatch/liveScoring.js)
//   - buildScoreRaceTimeline (lib/statistics/buildScoreRaceTimeline.js)
//   - groupsReadyToClose / bonusPreviewFor / closuresByGroupId (lib/admin/groupClosePreview.js)

import assert from "node:assert/strict";

import { resolveActiveWindow, resolveEffectiveResults } from "../src/lib/liveMatch/activeWindow.js";
import {
  computeGroupSituation,
  isGroupDefinitionStarted,
  getGroupFinalMatches,
  GROUP_STATE,
} from "../src/lib/fixture/groupState.js";
import {
  calculateGroupStandings,
  compareRows,
  getAutomaticQualified,
} from "../src/sections/04_predicciones/predicciones.standings.js";
import { buildPointLedger } from "../src/lib/scoring/buildPointLedger.js";
import { buildGroupBonuses, GROUP_BONUS } from "../src/lib/scoring/groupBonuses.js";
import { calculatePointsForPrediction } from "../src/lib/liveMatch/liveScoring.js";
import { buildScoreRaceTimeline } from "../src/lib/statistics/buildScoreRaceTimeline.js";
import {
  groupsReadyToClose,
  bonusPreviewFor,
  closuresByGroupId,
} from "../src/lib/admin/groupClosePreview.js";

// ── Reporte legible ──────────────────────────────────────────────────────────
let assertCount = 0;
const ok = (cond, msg) => {
  assertCount += 1;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  assertCount += 1;
  assert.equal(a, b, msg);
};
const deepEq = (a, b, msg) => {
  assertCount += 1;
  assert.deepEqual(a, b, msg);
};

const log = (...args) => console.log(...args);
const head = (title) => log(`\n=== ${title} ===`);
const sub = (title) => log(`  -- ${title}`);

// ── Universo sintetico determinista ──────────────────────────────────────────
// Construimos a mano grupos + jugadores + predicciones para FORZAR escenarios exactos
// (recomendado por la comanda para bordes y testigo de desempate). Equipos a/b/c/d
// (grupo A) y e/f/g/h (grupo B). Fechas reales -> los DOS finales de 3a fecha de cada
// grupo son inequivocos (mayor dateUtc). Numero correlativo via dateUtc/matchNumber.

const team = (id, code) => ({ id, name: id.toUpperCase(), shortCode: code ?? id.toUpperCase() });

const GROUP_A = { id: "A", label: "Grupo A", teams: [team("a"), team("b"), team("c"), team("d")] };
const GROUP_B = { id: "B", label: "Grupo B", teams: [team("e"), team("f"), team("g"), team("h")] };

const D1 = "2026-06-11T18:00:00Z"; // fecha 1
const D2 = "2026-06-15T18:00:00Z"; // fecha 2
const D3 = "2026-06-19T18:00:00Z"; // fecha 3 (los DOS finales simultaneos)

// matchNumber FIFA arbitrario (no correlativo): la sim lo usa para verificar que el orden
// del historico NO depende de el sino del numero correlativo (dateUtc -> matchNumber -> id).
let mn = 1;
const mt = (id, groupId, home, away, dateUtc) => ({
  id,
  groupId,
  matchNumber: mn++,
  dateUtc,
  dateChile: dateUtc,
  homeTeam: team(home),
  awayTeam: team(away),
});

// Finales de A = a3 (a-d) y a4 (b-c); de B = b3 (e-h) y b4 (f-g). Mayor dateUtc = D3.
const FIXTURE = {
  matches: [
    mt("a1", "A", "a", "b", D1), mt("a6", "A", "c", "d", D1), // fecha 1
    mt("a2", "A", "a", "c", D2), mt("a5", "A", "b", "d", D2), // fecha 2
    mt("a3", "A", "a", "d", D3), mt("a4", "A", "b", "c", D3), // fecha 3 (finales A)
    mt("b1", "B", "e", "f", D1), mt("b6", "B", "g", "h", D1),
    mt("b2", "B", "e", "g", D2), mt("b5", "B", "f", "h", D2),
    mt("b3", "B", "e", "h", D3), mt("b4", "B", "f", "g", D3), // finales B
  ],
};

// NOW fijo > todos los kickoffs (asi un 0-0 live tambien gatea, aunque usamos goles>0).
const NOW = Date.parse("2026-07-01T00:00:00Z");

// Helpers de payload (forma del seam). official/live usan homeScore|homeTeamScore: las
// libs toleran ambas. Para `live` usamos *TeamScore (forma cruda del seam que pasa por F1).
const off = (matchId, h, a) => ({ matchId, homeScore: h, awayScore: a });
const live = (matchId, h, a) => ({ matchId, homeTeamScore: h, awayTeamScore: a });

const PLAYERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];

// ── helpers de lectura del libro ─────────────────────────────────────────────
const matchLine = (ledger, playerId, matchId) =>
  ledger.lines.find((l) => l.origen === "match" && l.playerId === playerId && l.evento === matchId);
const groupLine = (ledger, playerId, evento, groupId = "A") =>
  ledger.lines.find(
    (l) => l.origen === "group" && l.playerId === playerId && l.evento === evento && l.group === groupId
  );
const sumFinal = (ledger) =>
  ledger.lines.filter((l) => l.estado === "final").reduce((s, l) => s + l.puntos, 0);
const sumProjected = (ledger) =>
  ledger.lines
    .filter((l) => l.estado === "final" || l.estado === "provisional")
    .reduce((s, l) => s + l.puntos, 0);

// step(): corre los builders con un estado dado y devuelve un snapshot legible.
function step(label, { official = [], live: liveArr = [], now = NOW, closuresByGroup = {}, groups = [GROUP_A], players = PLAYERS, predictions = [], qualifiedPredictions = [], invalidatedKeys = null } = {}) {
  const window = resolveActiveWindow({ fixture: FIXTURE, official, live: liveArr, now });
  const { byMatch } = resolveEffectiveResults({ official, window });
  const ledger = buildPointLedger({
    players,
    predictions,
    qualifiedPredictions,
    groups,
    fixture: FIXTURE,
    official,
    live: liveArr,
    closuresByGroup,
    invalidatedKeys,
    now,
  });
  const situations = {};
  for (const g of groups) {
    situations[g.id] = computeGroupSituation(g.id, {
      group: g,
      fixture: FIXTURE,
      official,
      live: liveArr,
      closure: closuresByGroup[g.id] ?? null,
    });
  }
  log(`  [${label}] window: ${window.matches.length} activos, simul=${window.isSimultaneous}`);
  for (const g of groups) {
    const s = situations[g.id];
    log(
      `    grupo ${g.id}: estado=${s.state} 1o=${s.first ?? "-"} 2o=${s.second ?? "-"}` +
        ` (live 1o=${s.liveFirst ?? "-"}) def=${s.definitionStarted} prov=${s.isProvisional} stale=${s.closureStale}`
    );
  }
  for (const pl of players) {
    const agg = ledger.byPlayer[pl.id];
    if (!agg) continue;
    log(`    ${pl.id}: oficial=${agg.official} proyectado=${agg.projected} (match ${agg.match.projected} / grupo ${agg.group.projected})`);
  }
  return { window, byMatch, ledger, situations };
}

// =============================================================================
// PASO A - Escenarios principales A..E
// =============================================================================

function escenarioA_bloqueoDefinicion() {
  head("A. BLOQUEO -> DEFINICION (gatillo del bono por final de 3a fecha)");

  // Predicciones de clasificado: p1 acierta 1o(a)+2o(b); p2 falla ambos.
  const qualified = [
    { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
    { playerId: "p1", groupId: "A", position: 2, teamId: "b" },
    { playerId: "p2", groupId: "A", position: 1, teamId: "c" },
    { playerId: "p2", groupId: "A", position: 2, teamId: "d" },
  ];

  // A.1 BLOQUEADO: fechas 1 y 2 oficiales, finales (a3/a4) sin iniciar.
  sub("fechas 1-2 oficiales, finales sin iniciar -> BLOQUEADO (sin bonos)");
  const blocked = step("A.bloqueado", {
    official: [off("a1", 1, 0), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0)],
    qualifiedPredictions: qualified,
  });
  eq(blocked.situations.A.definitionStarted, false, "A: definitionStarted false sin final iniciado");
  // Gatillo directo (fuente unica): con solo fechas 1-2 oficiales, NO empezo la definicion.
  eq(
    isGroupDefinitionStarted("A", {
      group: GROUP_A,
      fixture: FIXTURE,
      official: [off("a1", 1, 0), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0)],
      live: [],
      now: NOW,
    }),
    false,
    "isGroupDefinitionStarted false (ningun final de 3a fecha iniciado)"
  );
  // ...y un sanity check del helper getGroupFinalMatches: los 2 finales de A son a3 y a4.
  deepEq(
    getGroupFinalMatches("A", { group: GROUP_A, fixture: FIXTURE }).map((m) => m.id).sort(),
    ["a3", "a4"],
    "getGroupFinalMatches(A) = los 2 partidos de mayor dateUtc (a3, a4)"
  );
  const groupLinesBlocked = blocked.ledger.lines.filter((l) => l.origen === "group");
  eq(groupLinesBlocked.length, 0, "A bloqueado: buildGroupBonuses NO emite ninguna linea de grupo");

  // A.2 ABRIR UN FINAL (live con goles) -> el grupo pasa a definicion; bonos provisional.
  sub("abrir UN final (a3 live 1-0) -> EN DEFINICION, bonos provisionales (solo este grupo)");
  const opened = step("A.definicion", {
    official: [off("a1", 1, 0), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0)],
    live: [live("a3", 1, 0)], // a vence a d en el final -> a sube
    groups: [GROUP_A, GROUP_B],
    qualifiedPredictions: qualified,
  });
  eq(opened.situations.A.definitionStarted, true, "A: definitionStarted true al abrir un final");
  eq(opened.situations.A.state, GROUP_STATE.PENDING_CLOSE, "A: 1 final live + viejos oficiales -> pending_close");
  const aBonuses = opened.ledger.lines.filter((l) => l.origen === "group" && l.group === "A");
  ok(aBonuses.length > 0, "A en definicion: ya emite lineas de grupo");
  ok(aBonuses.every((l) => l.estado === "provisional"), "A en definicion: lineas provisionales (no oficial)");
  // Aislamiento: el grupo B (sin final iniciado) sigue BLOQUEADO.
  eq(opened.situations.B.definitionStarted, false, "B sigue bloqueado (no abri su final)");
  const bBonuses = opened.ledger.lines.filter((l) => l.origen === "group" && l.group === "B");
  eq(bBonuses.length, 0, "B sin final: ningun bono (aislamiento de grupos)");

  log("  OK escenario A (bloqueo -> definicion, aislado por grupo).");
  return { qualified };
}

function escenarioB_desempate2026() {
  head("B. DESEMPATE 2026 (head-to-head PRIMERO)");

  // Caso testigo (mismo del test de tiebreakers): A y B empatados a puntos, A MEJOR DG
  // total, pero B le gano el head-to-head -> 2026 pone a B 1o (el viejo daba A por DG).
  sub("testigo: A mejor DG total pero B gano el head-to-head -> B 1o");
  const groupMatchesA = FIXTURE.matches.filter((m) => m.groupId === "A");
  const predictions2026 = {
    a1: { homeScore: 0, awayScore: 1 }, // a-b: B gana 1-0 (head-to-head a B)
    a2: { homeScore: 3, awayScore: 0 }, // a-c: A golea 3-0 (infla DG total de A)
    a3: { homeScore: 1, awayScore: 0 }, // a-d: A gana
    a4: { homeScore: 0, awayScore: 1 }, // b-c: C gana
    a5: { homeScore: 1, awayScore: 0 }, // b-d: B gana
    a6: { homeScore: 0, awayScore: 1 }, // c-d: D gana
  };
  const standings = calculateGroupStandings(GROUP_A, groupMatchesA, predictions2026);
  const rowFor = (id) => standings.standings.find((r) => r.teamId === id);
  eq(rowFor("a").points, rowFor("b").points, "A y B empatados a puntos");
  ok(rowFor("a").goalDifference > rowFor("b").goalDifference, "A tiene MEJOR DG total (el viejo lo pondria 1o)");
  deepEq(standings.standings.slice(0, 2).map((r) => r.teamId), ["b", "a"], "2026: B 1o por head-to-head, no A por DG");
  eq(getAutomaticQualified(standings).firstPlaceTeamId, "b", "getAutomaticQualified: 1o = b");
  // compareRows par-a-par confirma el head-to-head puro.
  ok(compareRows(rowFor("a"), rowFor("b"), groupMatchesA, predictions2026) > 0, "compareRows: a va despues de b");

  // Empate de 3 -> mini-tabla transitiva (orden estable b > c > a, NO la DG global).
  sub("3 empatados -> mini-tabla transitiva (b > c > a), no la DG global");
  const TIE3 = {
    a1: { homeScore: 0, awayScore: 2 }, // a-b: b 2-0
    a2: { homeScore: 1, awayScore: 0 }, // a-c: a 1-0
    a4: { homeScore: 0, awayScore: 1 }, // b-c: c 1-0
    a3: { homeScore: 5, awayScore: 0 }, // a-d: a 5-0 (infla DG global de a)
    a5: { homeScore: 1, awayScore: 0 }, // b-d: b 1-0
    a6: { homeScore: 1, awayScore: 0 }, // c-d: c 1-0
  };
  const tie3 = calculateGroupStandings(GROUP_A, groupMatchesA, TIE3);
  eq(tie3.standings.find((r) => r.teamId === "a").points, 6, "a 6 pts");
  ok(
    tie3.standings.find((r) => r.teamId === "a").goalDifference >
      tie3.standings.find((r) => r.teamId === "b").goalDifference,
    "a tiene la MEJOR DG global pero la mini-tabla lo manda al fondo del cluster"
  );
  deepEq(tie3.standings.map((r) => r.teamId), ["b", "c", "a", "d"], "mini-tabla transitiva: b > c > a > d");
  // Determinismo: barajar la entrada da el mismo orden.
  const shuffledGroup = { id: "A", teams: ["c", "a", "d", "b"].map((id) => team(id)) };
  const shuffledMatches = [...groupMatchesA].reverse();
  const tie3b = calculateGroupStandings(shuffledGroup, shuffledMatches, TIE3);
  deepEq(tie3b.standings.map((r) => r.teamId), ["b", "c", "a", "d"], "desempate determinista (barajar -> mismo orden)");

  log("  OK escenario B (desempate 2026 head-to-head primero + mini-tabla).");
}

function escenarioC_libro(qualified) {
  head("C. LIBRO POR JUGADOR (partido + clasificacion; oficial vs proyectado)");

  // a1 oficial 2-1; a3 (final) live 1-0 (a sube). Predicciones de marcador controladas:
  //   p1 a1 = 2-1 (exacto), p2 a1 = 0-0 (nada), p3 a1 = 1-0 (tendencia local).
  const predictions = [
    { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
    { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 0, awayScore: 0 },
    { playerId: "p3", matchId: "a1", groupId: "A", homeScore: 1, awayScore: 0 },
  ];
  const snapshot = step("C.libro", {
    official: [off("a1", 2, 1), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0)],
    live: [live("a3", 1, 0)], // abre el final -> grupo en definicion, bonos provisionales
    predictions,
    qualifiedPredictions: qualified,
  });
  const { ledger } = snapshot;

  sub("lineas de partido (5/3/1/0) por jugador");
  // p1 a1 = 2-1 exacto y unico (nadie mas lo puso) -> lone_wolf 5, FINAL (a1 oficial).
  const p1a1 = matchLine(ledger, "p1", "a1");
  eq(p1a1.puntos, 5, "p1 a1 exacto unico = 5 (lone wolf)");
  eq(p1a1.regla, "lone_wolf");
  eq(p1a1.estado, "final", "a1 oficial -> linea final");
  // p3 a1 = 1-0 vs 2-1 -> tendencia local +1.
  eq(matchLine(ledger, "p3", "a1").puntos, 1, "p3 tendencia local = 1");
  // p2 a1 = 0-0 vs 2-1 -> nada.
  eq(matchLine(ledger, "p2", "a1").puntos, 0, "p2 nada = 0");

  sub("lineas de grupo (+1/+3) gateadas, provisionales (final live abierto)");
  // a sube con a3 1-0; standings provisionales con a3 oficial-or-live. p1 predijo 1o=a, 2o=b.
  const p1First = groupLine(ledger, "p1", "first");
  ok(p1First, "existe linea de grupo first para p1 (grupo en definicion)");
  eq(p1First.estado, "provisional", "linea de grupo provisional (grupo no cerrado)");

  sub("reconciliacion: oficial = suma final ; proyectado = suma final+provisional");
  const totalOfficial = Object.values(ledger.byPlayer).reduce((s, p) => s + p.official, 0);
  const totalProjected = Object.values(ledger.byPlayer).reduce((s, p) => s + p.projected, 0);
  eq(totalOfficial, sumFinal(ledger), "total oficial == suma de lineas final");
  eq(totalProjected, sumProjected(ledger), "total proyectado == suma de lineas final+provisional");
  ok(totalProjected >= totalOfficial, "proyectado nunca menor que oficial");

  log("  OK escenario C (libro reconciliado por origen y plano).");
}

function escenarioD_contradictorio() {
  head("D. CASO CONTRADICTORIO (gana el partido pero pierde el 2o clasificado)");

  // Estado base: a1-a5 oficiales (a 1o claro), a6 (c-d) en vivo. p1 predijo a6 = 2-2 (empate,
  // NO exacto) y 2o de grupo = c. X (a6 1-0): c va 2o -> p1 acierta 2o(+3); su a6 da 0.
  // Y (a6 1-1): d sube a 2o, c cae 3o -> p1 falla 2o(0); su a6 pasa a tendencia(+1).
  // Neto proyectado de Y vs X: +1 (partido) -3 (clasificado) = -2.
  const base = {
    players: [{ id: "p1" }],
    predictions: [{ playerId: "p1", matchId: "a6", groupId: "A", homeScore: 2, awayScore: 2 }],
    qualifiedPredictions: [
      { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
      { playerId: "p1", groupId: "A", position: 2, teamId: "c" },
    ],
    groups: [GROUP_A],
    official: [off("a1", 1, 0), off("a2", 1, 0), off("a3", 1, 0), off("a4", 1, 1), off("a5", 0, 1)],
  };

  sub("X: a6 1-0 (c va 2o) -> p1 acierta 2o (+3); su a6 da 0");
  const stateX = step("D.X", { ...base, live: [live("a6", 1, 0)] });
  sub("Y: a6 1-1 (d sube, c cae 3o) -> p1 falla 2o (0); su a6 pasa a tendencia (+1)");
  const stateY = step("D.Y", { ...base, live: [live("a6", 1, 1)] });

  const matchX = matchLine(stateX.ledger, "p1", "a6");
  const matchY = matchLine(stateY.ledger, "p1", "a6");
  eq(matchX.puntos, 0, "X: 2-2 vs 1-0 no acierta tendencia");
  eq(matchY.puntos, 1, "Y: 2-2 vs 1-1 acierta tendencia empate");
  eq(matchY.regla, "tendency");

  const secondX = groupLine(stateX.ledger, "p1", "second");
  const secondY = groupLine(stateY.ledger, "p1", "second");
  eq(secondX.puntos, 3, "X: c va 2o -> acierta (+3)");
  eq(secondY.puntos, 0, "Y: c cae a 3o -> falla (0)");
  // 1o = a constante en ambos (aisla el flip del 2o).
  eq(groupLine(stateX.ledger, "p1", "first").puntos, 1, "1o=a constante (+1)");

  const net = stateY.ledger.byPlayer.p1.projected - stateX.ledger.byPlayer.p1.projected;
  eq(net, -2, "neto proyectado del contradictorio: +1 partido -3 clasificado = -2");
  // El oficial no se movio (todo lo de a6 es provisional: grupo en definicion).
  eq(stateX.ledger.byPlayer.p1.official, stateY.ledger.byPlayer.p1.official, "oficial no cambia (provisional)");

  log("  OK escenario D (desglose por origen correcto; neto contradictorio -2).");
}

function escenarioE_pendingClose() {
  head("E. PENDING_CLOSE con UN solo final finalizado (no se cierra solo)");

  // a3 final oficial; a4 final aun en vivo. Maquina: 1 oficial + 1 live -> pending_close.
  // NO se cierra solo (no hay closure validada): sigue provisional.
  sub("a3 oficial + a4 live -> pending_close; provisional; sin closure no es final");
  const snap = step("E.pendingClose", {
    official: [off("a1", 1, 0), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0), off("a3", 1, 0)],
    live: [live("a4", 0, 1)], // el segundo final aun jugandose
    qualifiedPredictions: [{ playerId: "p1", groupId: "A", position: 1, teamId: "a" }],
  });
  const s = snap.situations.A;
  eq(s.state, GROUP_STATE.PENDING_CLOSE, "1 final oficial + 1 final live -> pending_close");
  eq(s.isProvisional, true, "sigue provisional (no hay closure final)");
  ok(s.state !== GROUP_STATE.FINAL, "NO se cerro solo (requiere closure validada por Admin)");
  // Los bonos del grupo, si los hay, son provisionales (no oficial).
  const groupLines = snap.ledger.lines.filter((l) => l.origen === "group" && l.group === "A");
  ok(groupLines.length > 0 && groupLines.every((l) => l.estado === "provisional"), "bonos provisionales en pending_close");

  log("  OK escenario E (pending_close no se cierra solo).");
}

// =============================================================================
// PASO B - Cierre simulado, idempotencia, reapertura, closureStale, historico
// =============================================================================

// Mini-mock del lado RPC (espejo de polla_close_group): upsert por group_id, version++.
// NO es la RPC real: es un objeto en memoria para modelar el EFECTO del cierre.
function fakeCloseGroup(closures, groupId, first, second, standings, state = "final") {
  const next = (closures ?? []).filter((c) => c.groupId !== groupId);
  const prev = (closures ?? []).find((c) => c.groupId === groupId) ?? null;
  next.push({
    groupId,
    state,
    officialFirstTeam: first,
    officialSecondTeam: second,
    officialStandings: standings ?? null,
    version: (prev?.version ?? 0) + 1,
  });
  return next;
}
function fakeReopenGroup(closures, groupId, reason) {
  const next = (closures ?? []).filter((c) => c.groupId !== groupId);
  const prev = (closures ?? []).find((c) => c.groupId === groupId) ?? null;
  next.push({
    groupId,
    state: "reopened",
    reopenReason: reason ?? null,
    version: (prev?.version ?? 0) + 1,
  });
  return next;
}

function escenarioF_cierreIdempotencia(qualified) {
  head("F. CIERRE (simulado) + IDEMPOTENCIA");

  // Grupo A con los dos finales finalizados (todo oficial). a gana todo -> a 1o, b 2o.
  const officialA = [off("a1", 1, 0), off("a6", 1, 0), off("a2", 1, 0), off("a5", 1, 0), off("a3", 1, 0), off("a4", 1, 0)];

  sub("dos finales oficiales, sin closure -> pending_close; el panel lo ofrece");
  const snapshotOpen = { officialResults: officialA, liveMatches: [], groupClosures: [] };
  const ready = groupsReadyToClose([GROUP_A, GROUP_B], { fixture: FIXTURE, snapshot: snapshotOpen });
  eq(ready.length, 1, "solo A esta listo para cerrar");
  eq(ready[0].situation.state, GROUP_STATE.PENDING_CLOSE, "A en pending_close");

  sub("cerrar (closure final con 1o/2o congelados) -> bonos en estado final (oficial)");
  let closures = fakeCloseGroup([], "A", "a", "b", []);
  const closuresByGroup = closuresByGroupId(closures);
  const closed = step("F.cerrado", { official: officialA, closuresByGroup, qualifiedPredictions: qualified });
  eq(closed.situations.A.state, GROUP_STATE.FINAL, "A FINAL tras closure");
  eq(closed.situations.A.first, "a", "1o congelado = a");
  eq(closed.situations.A.second, "b", "2o congelado = b");
  const closedGroupLines = closed.ledger.lines.filter((l) => l.origen === "group" && l.group === "A");
  ok(closedGroupLines.length > 0 && closedGroupLines.every((l) => l.estado === "final"), "lineas de grupo en FINAL (oficial)");
  // El bono de p1 (acerto 1o=a, 2o=b) es +1 +3 = +4, ahora oficial.
  eq(groupLine(closed.ledger, "p1", "first").puntos, GROUP_BONUS.first, "p1 1o acierta +1");
  eq(groupLine(closed.ledger, "p1", "second").puntos, GROUP_BONUS.second, "p1 2o acierta +3");
  const p1OfficialClosed = closed.ledger.byPlayer.p1.group.official;
  eq(p1OfficialClosed, 4, "p1 grupo oficial = 4 (+1 +3)");

  sub("re-cerrar (version++) -> mismas keys, sin duplicar bonos (total no cambia)");
  closures = fakeCloseGroup(closures, "A", "a", "b", []);
  eq(closures.filter((c) => c.groupId === "A").length, 1, "una sola closure por grupo (upsert)");
  eq(closures.find((c) => c.groupId === "A").version, 2, "version++ en el re-cierre");
  const reclosed = step("F.recerrado", { official: officialA, closuresByGroup: closuresByGroupId(closures), qualifiedPredictions: qualified });
  // Mismas claves logicas y mismos puntos: el motor reconstruye desde lineas (no suma a ciegas).
  deepEq(
    closed.ledger.lines.filter((l) => l.origen === "group").map((l) => [l.key, l.puntos, l.estado]),
    reclosed.ledger.lines.filter((l) => l.origen === "group").map((l) => [l.key, l.puntos, l.estado]),
    "re-cierre idempotente: mismas keys/puntos/estado"
  );
  const keysClosed = reclosed.ledger.lines.filter((l) => l.origen === "group").map((l) => l.key);
  eq(new Set(keysClosed).size, keysClosed.length, "claves de bono unicas (no se duplican)");
  // Reuso del builder admin: bonusPreviewFor da el mismo total tras re-cierre.
  const previewClosed = bonusPreviewFor(GROUP_A, {
    players: PLAYERS, qualifiedPredictions: qualified, groups: [GROUP_A],
    fixture: FIXTURE, snapshot: { officialResults: officialA, liveMatches: [], groupClosures: closures },
  });
  eq(previewClosed.totalPoints, p1OfficialClosed, "bonusPreviewFor total == oficial reconstruido (no duplica)");

  log("  OK escenario F (cierre -> oficial, re-cierre idempotente sin duplicar).");
  return { officialA, closures, qualified };
}

function escenarioG_reaperturaStale({ officialA, qualified }) {
  head("G. REAPERTURA + closureStale");

  // Reapertura: closure reopened (version++) -> el grupo recomputa en vivo; bonos vuelven a
  // provisional; el proyectado NO duplica (mismas keys).
  sub("reabrir (closure reopened) -> bonos provisionales otra vez, sin duplicar");
  let closures = fakeCloseGroup([], "A", "a", "b", []); // cerrado primero
  closures = fakeReopenGroup(closures, "A", "se corrigio un marcador");
  eq(closures.filter((c) => c.groupId === "A").length, 1, "reabrir no duplica la fila");
  eq(closures.find((c) => c.groupId === "A").version, 2, "version++ al reabrir");
  const reopened = step("G.reabierto", { official: officialA, closuresByGroup: closuresByGroupId(closures), qualifiedPredictions: qualified });
  eq(reopened.situations.A.state, GROUP_STATE.REOPENED, "A vuelve a REOPENED");
  eq(reopened.situations.A.isProvisional, true, "reabierto: deja de ser oficial");
  const reopenedGroupLines = reopened.ledger.lines.filter((l) => l.origen === "group" && l.group === "A");
  ok(reopenedGroupLines.every((l) => l.estado === "provisional"), "reabierto: lineas provisionales");
  // Sin doble conteo: el grupo oficial vuelve a 0 (provisional no suma a oficial).
  eq(reopened.ledger.byPlayer.p1.group.official, 0, "reabierto: oficial de grupo = 0 (no duplica el cierre previo)");
  const reopenKeys = reopenedGroupLines.map((l) => l.key);
  eq(new Set(reopenKeys).size, reopenKeys.length, "claves unicas tras reabrir");

  // Reapertura via buildPointLedger.invalidatedKeys: 1 anulado(0) + 1 fresca; proyectado solo la fresca.
  sub("invalidatedKeys (auditoria de reapertura): 1 anulado(0) + 1 fresca; proyectado = fresca");
  const inv = step("G.invalidacion", {
    official: officialA,
    closuresByGroup: closuresByGroupId(fakeCloseGroup([], "A", "a", "b", [], "reopened")),
    qualifiedPredictions: [
      { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
      { playerId: "p1", groupId: "A", position: 2, teamId: "b" },
    ],
    players: [{ id: "p1" }],
    invalidatedKeys: new Set(["group:A:p1:second"]),
  });
  const anulado = inv.ledger.lines.filter((l) => l.estado === "anulado");
  eq(anulado.length, 1, "una sola linea anulada");
  eq(anulado[0].puntos, 0, "anulado aporta 0");
  eq(anulado[0].key, "group:A:p1:second:anulado", "key de auditoria del anulado");
  const frescas = inv.ledger.lines.filter((l) => l.key === "group:A:p1:second");
  eq(frescas.length, 1, "una sola linea fresca con la key original (sin duplicar)");
  eq(inv.ledger.byPlayer.p1.group.projected, 4, "proyectado solo la fresca: a 1o(+1) + b 2o(+3) = 4");

  // closureStale: closure final a/b pero un official corregido a c 1o -> closureStale true.
  sub("closureStale: closure a/b congelada pero official corregido a c 1o -> stale=true");
  const officialCorrected = [off("a1", 1, 0), off("a2", 0, 1), off("a3", 1, 0), off("a4", 0, 1), off("a5", 1, 0), off("a6", 1, 0)];
  const staleClosures = [{ groupId: "A", state: "final", officialFirstTeam: "a", officialSecondTeam: "b", version: 1 }];
  const stale = step("G.stale", {
    official: officialCorrected,
    closuresByGroup: closuresByGroupId(staleClosures),
    qualifiedPredictions: qualified,
  });
  eq(stale.situations.A.state, GROUP_STATE.FINAL, "sigue FINAL (closure congelada)");
  eq(stale.situations.A.first, "a", "el plano oficial sigue congelado en a (el peligro)");
  eq(stale.situations.A.liveFirst, "c", "el recompute en vivo ya da c");
  eq(stale.situations.A.closureStale, true, "closureStale true -> F11 debe forzar reapertura");
  // Coherente: con el official correcto, no stale.
  const coherent = step("G.coherente", {
    official: officialA,
    closuresByGroup: closuresByGroupId(staleClosures),
    qualifiedPredictions: qualified,
  });
  eq(coherent.situations.A.closureStale, false, "closureStale false cuando coincide con la realidad");

  log("  OK escenario G (reapertura sin doble conteo + closureStale).");
}

function escenarioH_historicoDeterminista() {
  head("H. HISTORICO DETERMINISTA (F12: orden de finalizacion no cambia el grafico)");

  const players = [
    { id: "p1", name: "Ana" },
    { id: "p2", name: "Beto" },
    { id: "p3", name: "Caco" },
  ];
  // Predicciones de marcador para los 6 partidos de A.
  const P = (playerId, matchId, h, a) => ({ playerId, matchId, homeScore: h, awayScore: a });
  const predictions = [
    P("p1", "a1", 1, 0), P("p2", "a1", 0, 0), P("p3", "a1", 2, 1),
    P("p1", "a2", 1, 0), P("p2", "a2", 1, 0), P("p3", "a2", 0, 0),
    P("p1", "a6", 0, 0), P("p2", "a6", 1, 1), P("p3", "a6", 0, 1),
    P("p1", "a5", 1, 0), P("p2", "a5", 0, 0), P("p3", "a5", 2, 2),
    P("p1", "a3", 1, 0), P("p2", "a3", 1, 0), P("p3", "a3", 0, 0), // final a3
    P("p1", "a4", 0, 2), P("p2", "a4", 1, 1), P("p3", "a4", 0, 2), // final a4
  ];
  const officialResults = [
    { matchId: "a1", homeScore: 1, awayScore: 0 },
    { matchId: "a2", homeScore: 1, awayScore: 0 },
    { matchId: "a6", homeScore: 0, awayScore: 0 },
    { matchId: "a5", homeScore: 1, awayScore: 0 },
    { matchId: "a3", homeScore: 1, awayScore: 0 }, // final
    { matchId: "a4", homeScore: 0, awayScore: 2 }, // final
  ];

  const signatureOf = (tl) =>
    JSON.stringify({
      matches: tl.matches.map((m) => `${m.matchId}:${m.status}:${m.homeScore}-${m.awayScore}`),
      clusters: tl.clusters.map((c) => `${c.matchId}|${c.cumulativePoints}|${[...c.playerIds].join(",")}|${c.maxHitTypeInCluster}`),
      totals: tl.players.map((p) => `${p.playerId}:${p.totals.map((t) => t.cumulativePoints).join("-")}`),
      max: tl.maxCumulative,
    });

  sub("finalizar los 2 finales en orden [a3,a4] vs [a4,a3] -> mismo timeline");
  const base = [...officialResults.slice(0, 4)];
  const orderA3A4 = [...base, officialResults[4], officialResults[5]]; // a3 luego a4
  const orderA4A3 = [...base, officialResults[5], officialResults[4]]; // a4 luego a3
  const tlA = buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults: orderA3A4 });
  const tlB = buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults: orderA4A3 });
  // Los dos finales comparten dateUtc (D3); desempata matchNumber -> matchId.
  eq(signatureOf(tlA), signatureOf(tlB), "distinto orden de finalizacion -> firma identica");

  sub("barajar muchas veces el array de oficiales -> firma identica (sin azar de carga)");
  const shuffle = (arr, seed) => {
    const out = [...arr];
    let s = seed >>> 0;
    for (let i = out.length - 1; i > 0; i -= 1) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const j = s % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const baseSig = signatureOf(buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults }));
  for (let seed = 1; seed <= 20; seed += 1) {
    const shuffled = shuffle(officialResults, seed);
    const tl = buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults: shuffled });
    eq(signatureOf(tl), baseSig, `barajado seed=${seed} -> firma identica`);
  }
  log(`  timeline matches (orden correlativo): ${tlA.matches.map((m) => m.matchId).join(" -> ")}`);

  log("  OK escenario H (historico determinista bajo distinto orden de finalizacion).");
}

// =============================================================================
// PASO C - Casos borde
// =============================================================================

function borde1_simultaneos() {
  head("BORDE 1. DOS goles casi simultaneos (orden estable, reproducible)");

  // Dos cambios de marcador "en el mismo tick": a3 y a4 (finales, mismo dateUtc D3) pasan
  // a oficial. El orden del historico y los standings NO dependen del orden de llegada.
  const players = [{ id: "p1", name: "Ana" }, { id: "p2", name: "Beto" }];
  const P = (playerId, matchId, h, a) => ({ playerId, matchId, homeScore: h, awayScore: a });
  const predictions = [
    P("p1", "a3", 1, 0), P("p2", "a3", 0, 1),
    P("p1", "a4", 0, 1), P("p2", "a4", 1, 0),
  ];
  const a3 = { matchId: "a3", homeScore: 1, awayScore: 0 };
  const a4 = { matchId: "a4", homeScore: 0, awayScore: 1 };

  sub("historico: [a3,a4] y [a4,a3] -> mismo orden de matches y misma firma");
  const tl1 = buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults: [a3, a4] });
  const tl2 = buildScoreRaceTimeline({ players, predictions, fixture: FIXTURE, officialResults: [a4, a3] });
  deepEq(tl1.matches.map((m) => m.matchId), tl2.matches.map((m) => m.matchId), "orden de matches estable (desempate matchNumber/matchId)");
  // a3 (matchNumber menor) va antes que a4 (mismo dateUtc).
  const a3idx = tl1.matches.findIndex((m) => m.matchId === "a3");
  const a4idx = tl1.matches.findIndex((m) => m.matchId === "a4");
  ok(a3idx < a4idx, "a3 antes que a4 por matchNumber (mismo dateUtc)");

  sub("standings: aplicar a3/a4 en distinto orden -> misma tabla 1o/2o");
  const groupMatchesA = FIXTURE.matches.filter((m) => m.groupId === "A");
  const predMap = { a3: { homeScore: 1, awayScore: 0 }, a4: { homeScore: 0, awayScore: 1 } };
  const st1 = calculateGroupStandings(GROUP_A, groupMatchesA, predMap);
  const st2 = calculateGroupStandings(GROUP_A, [...groupMatchesA].reverse(), predMap);
  deepEq(st1.standings.map((r) => r.teamId), st2.standings.map((r) => r.teamId), "standings estables ante distinto orden de partidos");

  log("  OK borde 1 (simultaneos estables y reproducibles).");
}

function borde2_netoCero() {
  head("BORDE 2. JUGADOR con 0 NETO por compensacion (visible en el desglose)");

  // Compensacion exacta de +3 / -3 con desglose visible. Mismo molde que el contradictorio
  // (scenario D) pero calibrado a neto 0: p1 (y p2, para que el exacto sea COMPARTIDO +3, no
  // lone wolf +5) predicen a6 = 1-1; clasificado 2o = c.
  //   X (a6 1-0): a6 1-1 vs 1-0 -> NADA (0). En la tabla c va 2o -> p1 acierta 2o (+3).
  //   Y (a6 1-1): a6 1-1 vs 1-1 -> EXACTO COMPARTIDO (+3). Pero d sube a 2o, c cae 3o ->
  //               p1 FALLA el 2o (0).
  // => entre X e Y: partido +3, clasificado 2o -3 -> NETO 0, con el +3 y el -3 visibles.
  const base = {
    players: [{ id: "p1" }, { id: "p2" }],
    predictions: [
      { playerId: "p1", matchId: "a6", groupId: "A", homeScore: 1, awayScore: 1 },
      { playerId: "p2", matchId: "a6", groupId: "A", homeScore: 1, awayScore: 1 }, // hace el exacto COMPARTIDO
    ],
    qualifiedPredictions: [
      { playerId: "p1", groupId: "A", position: 1, teamId: "a" }, // 1o = a (constante en X/Y)
      { playerId: "p1", groupId: "A", position: 2, teamId: "c" }, // 2o = c (bascula con a6)
    ],
    groups: [GROUP_A],
    official: [off("a1", 1, 0), off("a2", 1, 0), off("a3", 1, 0), off("a4", 1, 1), off("a5", 0, 1)],
  };

  sub("X: a6=1-0 -> a6 no acierta (0); en la tabla c va 2o -> p1 acierta 2o (+3)");
  const X = step("borde2.X", { ...base, live: [live("a6", 1, 0)] });
  sub("Y: a6=1-1 -> a6 exacto compartido (+3); d sube a 2o, c cae 3o -> p1 falla 2o (0)");
  const Y = step("borde2.Y", { ...base, live: [live("a6", 1, 1)] });

  const matchX = matchLine(X.ledger, "p1", "a6").puntos;
  const matchY = matchLine(Y.ledger, "p1", "a6").puntos;
  const secondX = groupLine(X.ledger, "p1", "second").puntos;
  const secondY = groupLine(Y.ledger, "p1", "second").puntos;
  log(`    desglose X: match=${matchX} grupo2o=${secondX} | Y: match=${matchY} grupo2o=${secondY}`);

  // Compensacion: el cambio en partido y el cambio en grupo se cancelan.
  const deltaMatch = matchY - matchX; // +3 (a6 pasa a exacto compartido)
  const deltaSecond = secondY - secondX; // -3 (2o deja de acertar)
  eq(deltaMatch, 3, "a6 sube +3 (exacto compartido al ser 1-1)");
  eq(deltaSecond, -3, "el 2o cae -3 (c deja de ser 2o cuando d lo supera en vivo)");
  const net = Y.ledger.byPlayer.p1.projected - X.ledger.byPlayer.p1.projected;
  eq(net, 0, "neto proyectado = 0 (compensacion exacta +3/-3)");
  // El desglose por origen lo MUESTRA: NO es 'no paso nada'.
  ok(deltaMatch !== 0 && deltaSecond !== 0, "el desglose por origen muestra el +3 y el -3 (no es estatico)");

  log("  OK borde 2 (neto 0 con desglose +3/-3 visible).");
}

function borde3_loneWolf() {
  head("BORDE 3. LONE WOLF que aparece/desaparece (exacto unico <-> compartido)");

  // a1 oficial 2-1. p1 predijo 2-1 (exacto). Si es el unico -> lone_wolf +5; si otro tambien
  // pone 2-1 -> exacto compartido +3. Reusa calculatePointsForPrediction con allPredictionsForMatch.
  const result = { homeScore: 2, awayScore: 1 };
  const p1Pred = { homeScore: 2, awayScore: 1 };

  sub("p1 unico exacto -> lone_wolf +5");
  const allLone = [p1Pred, { homeScore: 0, awayScore: 0 }, { homeScore: 1, awayScore: 1 }];
  const lone = calculatePointsForPrediction(p1Pred, result, allLone);
  eq(lone.points, 5, "lone wolf = 5");
  eq(lone.hitType, "lone_wolf");

  sub("otro jugador tambien pone 2-1 -> ambos pasan a exacto compartido +3");
  const allShared = [p1Pred, { homeScore: 2, awayScore: 1 }, { homeScore: 1, awayScore: 1 }];
  const shared = calculatePointsForPrediction(p1Pred, result, allShared);
  eq(shared.points, 3, "exacto compartido = 3");
  eq(shared.hitType, "exact");

  sub("al revertir (vuelve a ser el unico) -> +5 de nuevo (en vivo, allPredictionsForMatch manda)");
  const reverted = calculatePointsForPrediction(p1Pred, result, allLone);
  eq(reverted.points, 5, "revertir -> vuelve a lone wolf +5");

  // Tambien por la ruta del libro (buildPointLedger) en vivo: a1 live 2-1.
  sub("via buildPointLedger en vivo: el conteo de exactos del partido se respeta");
  const ledgerLone = buildPointLedger({
    players: [{ id: "p1" }, { id: "p2" }],
    predictions: [
      { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
      { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 0, awayScore: 0 },
    ],
    qualifiedPredictions: [],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [],
    live: [live("a1", 2, 1)],
    now: NOW,
  });
  eq(matchLine(ledgerLone, "p1", "a1").regla, "lone_wolf", "libro: p1 lone_wolf en vivo");
  const ledgerShared = buildPointLedger({
    players: [{ id: "p1" }, { id: "p2" }],
    predictions: [
      { playerId: "p1", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
      { playerId: "p2", matchId: "a1", groupId: "A", homeScore: 2, awayScore: 1 },
    ],
    qualifiedPredictions: [],
    groups: [GROUP_A],
    fixture: FIXTURE,
    official: [],
    live: [live("a1", 2, 1)],
    now: NOW,
  });
  eq(matchLine(ledgerShared, "p1", "a1").regla, "exact_shared", "libro: p1 exacto compartido cuando p2 iguala");

  log("  OK borde 3 (lone wolf <-> exacto compartido en vivo).");
}

function borde4_dosGruposSolapados() {
  head("BORDE 4. DOS GRUPOS SOLAPADOS (4 finales vivos a la vez, aislados)");

  // A y B con sus DOS finales en vivo al mismo tiempo (a3,a4 y b3,b4). resolveActiveWindow
  // detecta ambos; cada grupo aislado; el ranking general suma los bonos de AMBOS.
  const liveArr = [live("a3", 1, 0), live("a4", 0, 1), live("b3", 2, 0), live("b4", 1, 0)];
  const qualified = [
    { playerId: "p1", groupId: "A", position: 1, teamId: "a" },
    { playerId: "p1", groupId: "B", position: 1, teamId: "e" },
    { playerId: "p2", groupId: "A", position: 1, teamId: "d" },
  ];

  sub("resolveActiveWindow detecta ambos grupos en simultaneo (4 finales live)");
  const window = resolveActiveWindow({ fixture: FIXTURE, official: [], live: liveArr, now: NOW });
  const liveGroups = new Set(window.matches.filter((m) => m.phase === "live").map((m) => m.groupId));
  deepEq([...liveGroups].sort(), ["A", "B"], "ambos grupos A y B activos");
  eq(window.isSimultaneous, true, "isSimultaneous: hay un grupo con 2 finales live");

  sub("cada grupo aislado: su 1o/2o no depende del otro");
  const snap = step("borde4", { live: liveArr, groups: [GROUP_A, GROUP_B], qualifiedPredictions: qualified });
  eq(snap.situations.A.definitionStarted, true, "A en definicion");
  eq(snap.situations.B.definitionStarted, true, "B en definicion");
  // Cambiar B no afecta el 1o de A.
  const onlyA = computeGroupSituation("A", { group: GROUP_A, fixture: FIXTURE, official: [], live: [live("a3", 1, 0), live("a4", 0, 1)], closure: null });
  eq(snap.situations.A.first, onlyA.first, "el 1o de A es el mismo con o sin B vivo (aislamiento)");

  sub("ranking general suma los bonos de AMBOS grupos en definicion");
  const aLines = snap.ledger.lines.filter((l) => l.origen === "group" && l.group === "A");
  const bLines = snap.ledger.lines.filter((l) => l.origen === "group" && l.group === "B");
  ok(aLines.length > 0, "hay bonos de A");
  ok(bLines.length > 0, "hay bonos de B");
  ok(aLines.every((l) => l.estado === "provisional") && bLines.every((l) => l.estado === "provisional"), "bonos de ambos provisionales");

  sub("un grupo bloqueado (sin final live) seguiria en 0");
  const onlyAlive = step("borde4.soloA", { live: [live("a3", 1, 0), live("a4", 0, 1)], groups: [GROUP_A, GROUP_B], qualifiedPredictions: qualified });
  eq(onlyAlive.situations.B.definitionStarted, false, "B sin final live -> bloqueado");
  eq(onlyAlive.ledger.lines.filter((l) => l.origen === "group" && l.group === "B").length, 0, "B bloqueado: 0 bonos");

  log("  OK borde 4 (dos grupos solapados, aislados, ambos suman al ranking).");
}

// =============================================================================
// MAIN
// =============================================================================
function main() {
  log("###############################################################");
  log("# F13 - Simulacion integral de jornada de definicion (PURA)   #");
  log("# Reusa las MISMAS libs que la app. No toca Supabase/RPC.      #");
  log("###############################################################");

  // Determinismo: aislar Math.random / Date.now por si alguna lib las tocara sin querer.
  const originalRandom = Math.random;
  const originalNow = Date.now;
  Math.random = () => {
    throw new Error("DETERMINISMO: Math.random() no permitido en la sim");
  };
  Date.now = () => NOW;
  try {
    // PASO A
    const { qualified } = escenarioA_bloqueoDefinicion();
    escenarioB_desempate2026();
    escenarioC_libro(qualified);
    escenarioD_contradictorio();
    escenarioE_pendingClose();
    // PASO B
    const cierre = escenarioF_cierreIdempotencia(qualified);
    escenarioG_reaperturaStale(cierre);
    escenarioH_historicoDeterminista();
    // PASO C
    borde1_simultaneos();
    borde2_netoCero();
    borde3_loneWolf();
    borde4_dosGruposSolapados();
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }

  log(`\n###############################################################`);
  log(`# TODOS LOS ASSERTS VERDES: ${assertCount} asserts`);
  log(`# Cobertura: A bloqueo->definicion | B desempate 2026 | C libro |`);
  log(`#            D contradictorio | E pending_close | F cierre idemp. |`);
  log(`#            G reapertura+stale | H historico determinista |`);
  log(`#            bordes 1-4 (simultaneos, neto 0, lone wolf, 2 grupos)`);
  log(`###############################################################`);
}

main();
