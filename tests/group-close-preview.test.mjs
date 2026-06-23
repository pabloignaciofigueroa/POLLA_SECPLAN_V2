import assert from "node:assert/strict";
import test from "node:test";

import {
  groupsReadyToClose,
  bonusPreviewFor,
  canOfferClose,
  canOfferReopen,
  isClosureStaleSituation,
  closuresByGroupId,
  CLOSE_PANEL_STATES,
} from "../src/lib/admin/groupClosePreview.js";
import { GROUP_STATE } from "../src/lib/fixture/groupState.js";
import { dedupeClosuresByVersion } from "../src/lib/liveMatch/liveMatchState.js";

// ── Fixture (mismo modelo que group-bonuses.test) ────────────────────────────
const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.toUpperCase() });
const GROUP_A = { id: "A", label: "Grupo A", teams: ["a", "b", "c", "d"].map(team) };
const GROUP_B = { id: "B", label: "Grupo B", teams: ["e", "f", "g", "h"].map(team) };

const D1 = "2026-06-11T18:00:00Z";
const D2 = "2026-06-15T18:00:00Z";
const D3 = "2026-06-19T18:00:00Z"; // 3a fecha (finales)
const mt = (id, groupId, home, away, dateUtc) => ({
  id, groupId, dateUtc, homeTeam: { id: home }, awayTeam: { id: away },
});
const FIXTURE = {
  matches: [
    mt("a1", "A", "a", "b", D1), mt("a6", "A", "c", "d", D1),
    mt("a2", "A", "a", "c", D2), mt("a5", "A", "b", "d", D2),
    mt("a3", "A", "a", "d", D3), mt("a4", "A", "b", "c", D3),
    mt("b1", "B", "e", "f", D1), mt("b6", "B", "g", "h", D1),
    mt("b2", "B", "e", "g", D2), mt("b5", "B", "f", "h", D2),
    mt("b3", "B", "e", "h", D3), mt("b4", "B", "f", "g", D3),
  ],
};
const r = (matchId, h, a) => ({ matchId, homeScore: h, awayScore: a });
// Grupo A oficial completo: a gana todo -> a 1o, b 2o (a=9,b=6,c=3,d=0).
const OFFICIAL_A = [r("a1", 1, 0), r("a2", 1, 0), r("a3", 1, 0), r("a4", 1, 0), r("a5", 1, 0), r("a6", 1, 0)];
// Correccion: c gana lo suyo -> c 1o, a 2o (rompe la closure congelada a/b).
const OFFICIAL_A_CORRECTED = [r("a1", 1, 0), r("a2", 0, 1), r("a3", 1, 0), r("a4", 0, 1), r("a5", 1, 0), r("a6", 1, 0)];
// Solo fechas 1-2 (ningun final): BLOQUEADO / EN DEFINICION (no pending_close).
const OFFICIAL_A_PHASES_1_2 = [r("a1", 1, 0), r("a6", 1, 0), r("a2", 1, 0), r("a5", 1, 0)];

const PLAYERS = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
const QUALIFIED = [
  { playerId: "p1", groupId: "A", position: 1, teamId: "a" }, // acierta 1o
  { playerId: "p1", groupId: "A", position: 2, teamId: "b" }, // acierta 2o
  { playerId: "p2", groupId: "A", position: 1, teamId: "a" }, // acierta 1o
  { playerId: "p2", groupId: "A", position: 2, teamId: "c" }, // falla 2o
];

const snap = (extra = {}) => ({
  officialResults: [],
  liveMatches: [],
  groupClosures: [],
  ...extra,
});

// ── 1. Deteccion: que grupos muestra el panel ────────────────────────────────

test("groupsReadyToClose: PENDING_CLOSE aparece (dos finales oficiales, sin closure)", () => {
  const ready = groupsReadyToClose([GROUP_A, GROUP_B], {
    fixture: FIXTURE,
    snapshot: snap({ officialResults: OFFICIAL_A }),
  });
  assert.equal(ready.length, 1);
  assert.equal(ready[0].group.id, "A");
  assert.equal(ready[0].situation.state, GROUP_STATE.PENDING_CLOSE);
});

test("groupsReadyToClose: EN DEFINICION (solo fechas 1-2) NO aparece", () => {
  const ready = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE,
    snapshot: snap({ officialResults: OFFICIAL_A_PHASES_1_2 }),
  });
  assert.equal(ready.length, 0, "sin finales jugados, el panel no ofrece cerrar");
});

test("CLOSE_PANEL_STATES no incluye IN_DEFINITION ni PENDING", () => {
  assert.ok(CLOSE_PANEL_STATES.includes(GROUP_STATE.PENDING_CLOSE));
  assert.ok(CLOSE_PANEL_STATES.includes(GROUP_STATE.FINAL));
  assert.ok(CLOSE_PANEL_STATES.includes(GROUP_STATE.REOPENED));
  assert.ok(!CLOSE_PANEL_STATES.includes(GROUP_STATE.IN_DEFINITION));
  assert.ok(!CLOSE_PANEL_STATES.includes(GROUP_STATE.PENDING));
});

// ── 2. Preview de bonos (CERO formula nueva: cuenta del libro) ───────────────

test("bonusPreviewFor: cuenta aciertos 1o/2o y puntos sin inventar formula", () => {
  const preview = bonusPreviewFor(GROUP_A, {
    players: PLAYERS,
    qualifiedPredictions: QUALIFIED,
    groups: [GROUP_A],
    fixture: FIXTURE,
    // Cierre final a/b: p1 acierta 1o(a) y 2o(b); p2 acierta 1o(a), falla 2o(c).
    snapshot: snap({
      officialResults: OFFICIAL_A,
      groupClosures: [{ groupId: "A", state: "final", officialFirstTeam: "a", officialSecondTeam: "b", version: 1 }],
    }),
  });
  assert.equal(preview.firstHits, 2, "p1 y p2 aciertan 1o=a");
  assert.equal(preview.secondHits, 1, "solo p1 acierta 2o=b");
  assert.equal(preview.firstValue, 1);
  assert.equal(preview.secondValue, 3);
  assert.equal(preview.firstPoints, 2); // 2 x +1
  assert.equal(preview.secondPoints, 3); // 1 x +3
  assert.equal(preview.totalPoints, 5);
});

// ── 3. Idempotencia del cierre (upsert por group_id, version++, sin duplicar) ─

// Mini-mock del lado RPC: upsert por group_id, version++ (espejo de polla_close_group).
function fakeCloseGroup(closures, groupId, first, second, standings) {
  const next = closures.filter((c) => c.groupId !== groupId);
  const prev = closures.find((c) => c.groupId === groupId) ?? null;
  next.push({
    groupId,
    state: "final",
    officialFirstTeam: first,
    officialSecondTeam: second,
    officialStandings: standings,
    version: (prev?.version ?? 0) + 1,
  });
  return next;
}

test("cierre idempotente: dos cierres = UNA closure por grupo, version sube de a 1", () => {
  let closures = [];
  closures = fakeCloseGroup(closures, "A", "a", "b", []);
  closures = fakeCloseGroup(closures, "A", "a", "b", []);
  const forA = closures.filter((c) => c.groupId === "A");
  assert.equal(forA.length, 1, "no se duplica la fila del grupo");
  assert.equal(forA[0].version, 2, "version++ en el segundo cierre");
  // dedupe del seam tambien conserva una sola (la de mayor version).
  assert.equal(dedupeClosuresByVersion(closures).filter((c) => c.groupId === "A").length, 1);
});

test("cierre idempotente: bonos NO se duplican (claves unicas last-wins) en re-cierre", () => {
  let closures = [];
  closures = fakeCloseGroup(closures, "A", "a", "b", []);
  const first = bonusPreviewFor(GROUP_A, {
    players: PLAYERS, qualifiedPredictions: QUALIFIED, groups: [GROUP_A],
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A, groupClosures: closures }),
  });
  closures = fakeCloseGroup(closures, "A", "a", "b", []); // recierre
  const second = bonusPreviewFor(GROUP_A, {
    players: PLAYERS, qualifiedPredictions: QUALIFIED, groups: [GROUP_A],
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A, groupClosures: closures }),
  });
  // Mismos totales (el motor reconstruye desde lineas, no suma a ciegas).
  assert.equal(second.totalPoints, first.totalPoints);
  // Las claves del libro de bonos del grupo son unicas (no hay duplicados).
  const keys = second.lines.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length, "claves de bono unicas: no se duplican");
});

// ── 4. canOfferClose / canOfferReopen (idempotencia en UI) ───────────────────

test("canOfferClose: en PENDING_CLOSE y REOPENED si; en FINAL coherente no; en FINAL stale si", () => {
  const pendingClose = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A }),
  })[0].situation;
  assert.equal(canOfferClose(pendingClose), true);
  assert.equal(canOfferReopen(pendingClose), false);

  const finalCoherent = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE,
    snapshot: snap({
      officialResults: OFFICIAL_A,
      groupClosures: [{ groupId: "A", state: "final", officialFirstTeam: "a", officialSecondTeam: "b", version: 1 }],
    }),
  })[0].situation;
  assert.equal(finalCoherent.state, GROUP_STATE.FINAL);
  assert.equal(canOfferClose(finalCoherent), false, "FINAL coherente: no se re-ofrece cerrar (idempotencia UI)");
  assert.equal(canOfferReopen(finalCoherent), true);
});

// ── 5. closureStale: correccion de un grupo cerrado fuerza reapertura ────────

test("closureStale: closure a/b pero realidad corregida a c/a -> stale y se OFRECE recerrar", () => {
  const situation = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE,
    snapshot: snap({
      officialResults: OFFICIAL_A_CORRECTED, // c 1o, a 2o
      groupClosures: [{ groupId: "A", state: "final", officialFirstTeam: "a", officialSecondTeam: "b", version: 1 }],
    }),
  })[0].situation;
  assert.equal(situation.state, GROUP_STATE.FINAL, "sigue FINAL (closure congelada)");
  assert.equal(situation.first, "a", "el plano oficial sigue congelado (el peligro)");
  assert.equal(situation.liveFirst, "c", "el recompute ya da c");
  assert.equal(isClosureStaleSituation(situation), true, "stale: el banner debe forzar reapertura");
  assert.equal(canOfferClose(situation), true, "FINAL stale: se ofrece recerrar con la nueva realidad");
  assert.equal(canOfferReopen(situation), true, "y tambien reabrir");
});

test("closureStale=false cuando la closure coincide con la realidad", () => {
  const situation = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE,
    snapshot: snap({
      officialResults: OFFICIAL_A,
      groupClosures: [{ groupId: "A", state: "final", officialFirstTeam: "a", officialSecondTeam: "b", version: 1 }],
    }),
  })[0].situation;
  assert.equal(isClosureStaleSituation(situation), false);
  assert.equal(canOfferClose(situation), false);
});

// ── 6. Reapertura sin doble conteo (vuelve a provisional) ────────────────────

function fakeReopenGroup(closures, groupId, reason) {
  const next = closures.filter((c) => c.groupId !== groupId);
  const prev = closures.find((c) => c.groupId === groupId) ?? null;
  next.push({ groupId, state: "reopened", reopenReason: reason ?? null, version: (prev?.version ?? 0) + 1 });
  return next;
}

test("reapertura: FINAL -> REOPENED, bonos vuelven a provisional sin duplicar (version++)", () => {
  let closures = fakeCloseGroup([], "A", "a", "b", []);
  // Cerrado: bonos en estado final.
  const closed = bonusPreviewFor(GROUP_A, {
    players: PLAYERS, qualifiedPredictions: QUALIFIED, groups: [GROUP_A],
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A, groupClosures: closures }),
  });
  assert.ok(closed.lines.length > 0);
  assert.ok(closed.lines.every((l) => l.estado === "final"), "cerrado: lineas finales");

  closures = fakeReopenGroup(closures, "A", "se corrigio un marcador");
  const forA = closures.filter((c) => c.groupId === "A");
  assert.equal(forA.length, 1, "reabrir no duplica la fila");
  assert.equal(forA[0].version, 2, "version++ al reabrir");
  assert.equal(forA[0].reopenReason, "se corrigio un marcador");

  const reopened = groupsReadyToClose([GROUP_A], {
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A, groupClosures: closures }),
  })[0].situation;
  assert.equal(reopened.state, GROUP_STATE.REOPENED);
  assert.equal(reopened.isProvisional, true, "reabierto: deja de ser oficial");

  // Los bonos del grupo reabierto son provisionales (mismas claves, sin duplicar).
  const reopenedPreview = bonusPreviewFor(GROUP_A, {
    players: PLAYERS, qualifiedPredictions: QUALIFIED, groups: [GROUP_A],
    fixture: FIXTURE, snapshot: snap({ officialResults: OFFICIAL_A, groupClosures: closures }),
  });
  assert.ok(reopenedPreview.lines.every((l) => l.estado === "provisional"), "reabierto: lineas provisionales");
  assert.equal(reopenedPreview.totalPoints, closed.totalPoints, "mismos puntos: no se duplica el conteo");
  const keys = reopenedPreview.lines.map((l) => l.key);
  assert.equal(new Set(keys).size, keys.length, "claves unicas tras reabrir");
});

// ── 7. closuresByGroupId helper ──────────────────────────────────────────────

test("closuresByGroupId: indexa por groupId", () => {
  const map = closuresByGroupId([
    { groupId: "A", state: "final" },
    { groupId: "B", state: "reopened" },
    { state: "final" }, // sin groupId -> ignorada
  ]);
  assert.equal(map.A.state, "final");
  assert.equal(map.B.state, "reopened");
  assert.equal(Object.keys(map).length, 2);
});
