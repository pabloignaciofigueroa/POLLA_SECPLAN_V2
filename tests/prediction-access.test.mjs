import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../src/data/predictions.json" with { type: "json" };
import {
  PREDICTION_ACCESS_STATES,
  buildOfficialPlayerBuckets,
  isStatisticsUnlocked,
  resolvePredictionAccess,
} from "../src/lib/predictions/predictionAccess.js";
import { buildPredictionPayload } from "../src/sections/04_predicciones/predicciones.export.js";

test("un jugador oficial queda desbloqueado para lectura en otro dispositivo", () => {
  const access = resolvePredictionAccess({
    playerId: "pancho",
    submissions: dataset.submissions,
    localPredictions: null,
  });

  assert.equal(access.state, PREDICTION_ACCESS_STATES.officialLocked);
  assert.equal(access.canReadStatistics, true);
  assert.equal(access.canEdit, false);
});

test("una sesion vigente habilita solo al jugador autorizado", () => {
  const session = {
    token: "session-token",
    playerId: "pancho",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const pancho = resolvePredictionAccess({
    playerId: "pancho",
    submissions: dataset.submissions,
    editSession: session,
  });
  const tanke = resolvePredictionAccess({
    playerId: "tanke",
    submissions: dataset.submissions,
    editSession: session,
  });

  assert.equal(pancho.state, PREDICTION_ACCESS_STATES.officialEditing);
  assert.equal(pancho.canEdit, true);
  assert.equal(tanke.state, PREDICTION_ACCESS_STATES.officialLocked);
  assert.equal(tanke.canEdit, false);
});

test("una sesion vencida falla hacia el carton protegido", () => {
  const access = resolvePredictionAccess({
    playerId: "pancho",
    submissions: dataset.submissions,
    editSession: {
      token: "expired",
      playerId: "pancho",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
  });

  assert.equal(access.state, PREDICTION_ACCESS_STATES.officialLocked);
  assert.equal(access.canEdit, false);
});

test("reconstruye 72 marcadores y 12 grupos desde el dataset oficial", () => {
  const buckets = buildOfficialPlayerBuckets(dataset, "pancho");
  assert.equal(Object.keys(buckets.predictions).length, 72);
  assert.equal(Object.keys(buckets.qualified).length, 12);
  assert.equal(
    Object.values(buckets.qualified).filter(
      (row) => row.firstPlaceTeamId && row.secondPlaceTeamId
    ).length,
    12
  );
});

test("un carton local completo tambien desbloquea estadisticas", () => {
  const localPredictions = Object.fromEntries(
    Array.from({ length: 72 }, (_, index) => [
      `match-${index + 1}`,
      { homeScore: 1, awayScore: 0, status: "complete" },
    ])
  );
  assert.equal(
    isStatisticsUnlocked({
      playerId: "jaime",
      confirmedPlayerIds: dataset.submissions.map((row) => row.playerId),
      localPredictions,
    }),
    true
  );
});

test("la correccion exportada declara el checksum reemplazado", () => {
  const buckets = buildOfficialPlayerBuckets(dataset, "pancho");
  const submission = dataset.submissions.find((row) => row.playerId === "pancho");
  const generatedAt = "2026-06-09T20:00:00.000Z";
  const payload = buildPredictionPayload({
    player: { id: "pancho", name: "Pancho" },
    predictions: buckets.predictions,
    qualified: buckets.qualified,
    groups: [],
    matches: [],
    summary: {
      totalMatches: 72,
      completedMatches: 72,
      totalGroups: 12,
      completedGroups: 12,
      totalQualifiedSlots: 24,
      completedQualifiedSlots: 24,
    },
    submittedAt: generatedAt,
    correction: {
      replacesChecksum: submission.checksum,
      generatedAt,
      playerId: "pancho",
    },
  });

  assert.equal(payload.replacesChecksum, submission.checksum);
  assert.equal(payload.correctionGeneratedAt, generatedAt);
  assert.equal(payload.correctionPlayerId, "pancho");
});
