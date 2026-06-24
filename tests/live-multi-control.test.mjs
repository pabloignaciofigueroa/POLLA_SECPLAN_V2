// Stage 2 - Control MULTI-marcador (DEFINICION SIMULTANEA): logica offline.
//
// Ejercita (a) la logica pura de que controles mostrar (buildLiveControlModels) y (b) el
// path de ESCRITURA multi del seam con allowMultiWrite por-llamada (NO toca el flag global
// MULTI_LIVE_WRITE_ENABLED, que sigue false; ver GUARDRAIL A3). En Node, Supabase no esta
// configurado, asi que setLiveScore/clearLiveScore/finalizeOfficialResult caen al cache
// local; un stub minimo de window/localStorage permite verificar la semantica multi-fila
// (upsert por matchId, limpiar por matchId, finalizar uno deja el otro) sin remoto.

import assert from "node:assert/strict";
import test from "node:test";

// ── Stub minimo de window + localStorage (el seam usa window para cache + eventos) ──────
const store = new Map();
const noop = () => {};
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  dispatchEvent: noop,
  addEventListener: noop,
  removeEventListener: noop,
};

const {
  setLiveScore,
  clearLiveScore,
  finalizeOfficialResult,
  saveLiveMatchState,
  readLiveMatches,
  MULTI_LIVE_WRITE_ENABLED,
} = await import("../src/lib/liveMatch/liveMatchState.js");
const {
  buildLiveControlModels,
  buildLiveScorePayload,
  buildFinalizeResult,
  resolveAdminControlWindow,
} = await import("../src/lib/liveMatch/liveMultiControl.js");

const resetStore = () => store.clear();

// Fixture: dos finales del Grupo A a la misma hora (pasado -> live) + uno del Grupo B futuro.
const PAST = new Date(Date.now() - 30 * 60000).toISOString();
const FUTURE = new Date(Date.now() + 6 * 60 * 60000).toISOString();
const team = (id) => ({ id, name: id.toUpperCase(), shortCode: id.slice(0, 3).toUpperCase() });
const fxMatch = (id, groupId, dateUtc, n, h, a) => ({
  id,
  groupId,
  dateUtc,
  matchNumber: n,
  homeTeam: team(h),
  awayTeam: team(a),
});
const FIXTURE = {
  matches: [
    fxMatch("match-071", "A", PAST, 71, "mex", "can"),
    fxMatch("match-072", "A", PAST, 72, "usa", "pan"),
    fxMatch("match-073", "B", FUTURE, 73, "arg", "bra"),
  ],
};

// Los payloads live de este sistema llevan scores ENTEROS (buildState usa numeros); el
// gate de fase (resolveLiveMatchPhase) exige Number.isInteger. Espejo de produccion.
const livePayload = (matchId, home, away) => ({
  matchId,
  homeTeamScore: home,
  awayTeamScore: away,
  status: "live",
  updatedAt: new Date().toISOString(),
});

// ── 1) Logica pura: N=1 vs N=2 ──────────────────────────────────────────────────────────

test("buildLiveControlModels: N=1 vivo -> liveCount 1, NO simultaneo", () => {
  const model = buildLiveControlModels({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 1, 0)],
  });
  assert.equal(model.liveCount, 1);
  assert.equal(model.isSimultaneous, false);
  assert.equal(model.liveControls.length, 1);
  assert.equal(model.liveControls[0].matchId, "match-071");
  assert.equal(model.liveControls[0].editable, true);
});

test("buildLiveControlModels: 2 finales del mismo grupo -> simultaneo, 2 controles editables", () => {
  const model = buildLiveControlModels({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 1, 0), livePayload("match-072", 0, 2)],
  });
  assert.equal(model.isSimultaneous, true);
  assert.equal(model.liveCount, 2);
  assert.equal(model.byGroup.A.length, 2);
  assert.ok(model.controls.every((c) => c.editable));
  const ids = model.controls.map((c) => c.matchId).sort();
  assert.deepEqual(ids, ["match-071", "match-072"]);
});

test("buildLiveControlModels: hermano OFICIAL se muestra read-only (no editable) junto al live", () => {
  const model = buildLiveControlModels({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 2, 1)],
    officialResults: [{ matchId: "match-072", homeScore: 3, awayScore: 0, status: "finished" }],
  });
  // 1 live (no simultaneo) pero el panel arma el par del grupo: 071 live + 072 official.
  assert.equal(model.liveCount, 1);
  assert.equal(model.byGroup.A.length, 2);
  const official = model.controls.find((c) => c.matchId === "match-072");
  assert.equal(official.phase, "official");
  assert.equal(official.editable, false);
});

test("buildLiveScorePayload / buildFinalizeResult parametrizan por matchId (no singleton)", () => {
  const [control] = buildLiveControlModels({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 1, 0), livePayload("match-072", 0, 0)],
  }).liveControls;
  const payload = buildLiveScorePayload(control, { homeScore: 2, awayScore: 1 });
  assert.equal(payload.matchId, "match-071");
  assert.equal(payload.homeTeamScore, 2);
  assert.equal(payload.awayTeamScore, 1);
  assert.equal(payload.status, "live");
  const result = buildFinalizeResult(control, { homeScore: 2, awayScore: 1 });
  assert.equal(result.matchId, "match-071");
  assert.equal(result.matchNumber, 71);
  assert.equal(result.homeTeamScore, 2);
});

// ── 2) Escritura multi via seam (override por-llamada; flag global intacto) ──────────────

test("dos setLiveScore por matchId -> DOS filas independientes en liveMatches[]", async () => {
  resetStore();
  await setLiveScore(livePayload("match-071", 1, 0), { allowMultiWrite: true });
  await setLiveScore(livePayload("match-072", 0, 2), { allowMultiWrite: true });
  const list = await readLiveMatches();
  assert.equal(list.length, 2);
  const byId = new Map(list.map((p) => [p.matchId, p]));
  assert.equal(byId.get("match-071").homeTeamScore, 1);
  assert.equal(byId.get("match-072").awayTeamScore, 2);
});

test("setLiveScore es upsert por matchId: re-actualizar uno NO duplica ni toca el otro", async () => {
  resetStore();
  await setLiveScore(livePayload("match-071", 1, 0), { allowMultiWrite: true });
  await setLiveScore(livePayload("match-072", 0, 2), { allowMultiWrite: true });
  await setLiveScore(livePayload("match-071", 2, 0), { allowMultiWrite: true });
  const list = await readLiveMatches();
  assert.equal(list.length, 2, "sigue habiendo 2 filas (upsert, no insert)");
  const byId = new Map(list.map((p) => [p.matchId, p]));
  assert.equal(byId.get("match-071").homeTeamScore, 2);
  assert.equal(byId.get("match-072").awayTeamScore, 2, "el otro quedo intacto");
});

test("clearLiveScore(uno) quita SOLO su fila; la otra sigue viva", async () => {
  resetStore();
  await setLiveScore(livePayload("match-071", 1, 0), { allowMultiWrite: true });
  await setLiveScore(livePayload("match-072", 0, 2), { allowMultiWrite: true });
  await clearLiveScore("match-071", { allowMultiWrite: true });
  const list = await readLiveMatches();
  assert.equal(list.length, 1);
  assert.equal(list[0].matchId, "match-072");
});

// ── 3) Finalizar uno NO borra el otro (Paso C) ──────────────────────────────────────────

test("finalizar match-071 deja vivo match-072 (aislamiento por matchId)", async () => {
  resetStore();
  await setLiveScore(livePayload("match-071", 1, 0), { allowMultiWrite: true });
  await setLiveScore(livePayload("match-072", 0, 2), { allowMultiWrite: true });

  const result = {
    matchId: "match-071",
    matchNumber: 71,
    homeTeamId: "mex",
    awayTeamId: "can",
    homeTeam: "MEX",
    awayTeam: "CAN",
    homeTeamScore: 1,
    awayTeamScore: 0,
    finishedAt: new Date().toISOString(),
  };
  // next-live = null: en multi NO se auto-avanza; la fila live del finalizado se quita,
  // el otro final del grupo NO se toca.
  await finalizeOfficialResult(result, null);

  const live = await readLiveMatches();
  const liveIds = live.map((p) => p.matchId);
  assert.ok(!liveIds.includes("match-071"), "match-071 ya no esta vivo");
  assert.ok(liveIds.includes("match-072"), "match-072 sigue vivo (no se borro)");
});

// ── 4) N=1 byte-igual: el flujo diario (wrapper singleton) no cambia ─────────────────────

test("N=1: saveLiveMatchState (wrapper) deja UNA fila; el control multi queda oculto (liveCount<2)", async () => {
  resetStore();
  await saveLiveMatchState({
    id: "current",
    matchId: "match-071",
    matchNumber: 71,
    status: "live",
    homeTeam: "MEX",
    awayTeam: "CAN",
    homeTeamScore: 1,
    awayTeamScore: 0,
    updatedAt: new Date().toISOString(),
  });
  const list = await readLiveMatches();
  assert.equal(list.length, 1);
  assert.equal(list[0].matchId, "match-071");

  const model = buildLiveControlModels({ fixture: FIXTURE, liveMatches: list });
  assert.equal(model.liveCount, 1);
  assert.equal(model.isSimultaneous, false, "con N=1 el panel multi no se activa");
});

// ── 5) GUARDRAIL A3 sigue firme con la logica multi en juego ─────────────────────────────

test("GUARDRAIL A3 (mecanismo): allowMultiWrite:false SIEMPRE bloquea, sin importar el flag global", async () => {
  // El flag global ya esta en true (go-live 2026-06-24, definicion simultanea en prod). El
  // guardrail sigue verificable por override explicito por-llamada -> rollback de emergencia.
  await assert.rejects(
    () => setLiveScore(livePayload("match-071", 1, 0), { allowMultiWrite: false }),
    /deshabilitado|MULTI_LIVE_WRITE_ENABLED/
  );
  await assert.rejects(
    () => clearLiveScore("match-071", { allowMultiWrite: false }),
    /deshabilitado|MULTI_LIVE_WRITE_ENABLED/
  );
});

// ── 6) resolveAdminControlWindow: bootstrap del PAR simultaneo desde el FIXTURE ───────────

test("resolveAdminControlWindow: par simultaneo sin nada vivo -> simultaneo, 2 controles READY", () => {
  const model = resolveAdminControlWindow({ fixture: FIXTURE });
  assert.equal(model.simultaneous, true);
  assert.equal(model.controls.length, 2);
  assert.ok(model.controls.every((c) => c.phase === "ready"), "ambos preparables (bootstrap)");
  assert.ok(model.controls.every((c) => c.editable));
  assert.equal(model.liveCount, 0);
  assert.deepEqual(
    model.controls.map((c) => c.matchId),
    ["match-071", "match-072"],
    "orden cronologico (el primero a la izquierda)"
  );
});

test("resolveAdminControlWindow: uno vivo + uno por iniciar -> 2 controles (live + ready)", () => {
  const model = resolveAdminControlWindow({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 1, 0)],
  });
  assert.equal(model.simultaneous, true);
  assert.equal(model.liveCount, 1);
  const byId = new Map(model.controls.map((c) => [c.matchId, c]));
  assert.equal(byId.get("match-071").phase, "live");
  assert.equal(byId.get("match-071").homeScore, 1);
  assert.equal(byId.get("match-072").phase, "ready");
});

test("resolveAdminControlWindow: hermano oficial entra read-only junto al vivo", () => {
  const model = resolveAdminControlWindow({
    fixture: FIXTURE,
    liveMatches: [livePayload("match-071", 2, 1)],
    officialResults: [{ matchId: "match-072", homeScore: 3, awayScore: 0 }],
  });
  assert.equal(model.simultaneous, true);
  const byId = new Map(model.controls.map((c) => [c.matchId, c]));
  assert.equal(byId.get("match-072").phase, "official");
  assert.equal(byId.get("match-072").editable, false);
  assert.equal(byId.get("match-072").homeScore, 3);
});

test("resolveAdminControlWindow: con los 2 finales oficiales avanza al siguiente (NO simultaneo)", () => {
  const model = resolveAdminControlWindow({
    fixture: FIXTURE,
    officialResults: [
      { matchId: "match-071", homeScore: 1, awayScore: 0 },
      { matchId: "match-072", homeScore: 0, awayScore: 2 },
    ],
  });
  assert.equal(model.simultaneous, false, "el par del grupo B (futuro) tiene 1 -> N=1");
  assert.equal(model.controls.length, 1);
  assert.equal(model.controls[0].matchId, "match-073");
});

test("resolveAdminControlWindow: status 'pending' (preparado) cuenta como READY, no live", () => {
  const prepared = {
    matchId: "match-071",
    homeTeamScore: 0,
    awayTeamScore: 0,
    status: "pending",
    updatedAt: new Date().toISOString(),
  };
  const model = resolveAdminControlWindow({ fixture: FIXTURE, liveMatches: [prepared] });
  const byId = new Map(model.controls.map((c) => [c.matchId, c]));
  assert.equal(byId.get("match-071").phase, "ready");
  assert.equal(model.liveCount, 0);
});
