import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDataset, validateSubmission } from "../scripts/predictions-importer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const [players, fixture, groups, teams] = await Promise.all([
  readJson(path.join(siteRoot, "src/data/players.json")),
  readJson(path.join(siteRoot, "src/data/fixture.json")),
  readJson(path.join(siteRoot, "src/data/groups.json")),
  readJson(path.join(siteRoot, "src/data/teams.json")),
]);
const inputNames = (await fs.readdir(siteRoot))
  .filter((name) => /^predicciones_.+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/i.test(name))
  .sort();
const entries = await Promise.all(
  inputNames.map(async (fileName) => {
    const raw = await fs.readFile(path.join(siteRoot, fileName), "utf8");
    return { fileName, raw, document: JSON.parse(raw) };
  })
);
const context = { players, matches: fixture.matches, groups, teams };

test("construye el snapshot oficial de todos los cartones cargados", () => {
  const dataset = buildDataset({ entries, ...context });
  const cardCount = entries.length;
  assert.equal(dataset.confirmedCards, cardCount);
  assert.equal(dataset.totals.predictions, cardCount * 72);
  assert.equal(dataset.totals.qualifiedPositions, cardCount * 24);
  assert.equal(new Set(dataset.submissions.map((item) => item.playerId)).size, cardCount);
});

test("rechaza un carton incompleto", () => {
  const broken = structuredClone(entries[0]);
  broken.fileName = "incompleto.json";
  broken.document.groupPredictions[0].matches.pop();
  assert.throws(
    () => validateSubmission({ ...broken, ...context }),
    /Grupo A debe contener 6 partidos/
  );
});

test("rechaza jugadores duplicados", () => {
  assert.throws(
    () => buildDataset({ entries: [entries[0], entries[0]], ...context }),
    /jugador duplicado/
  );
});

test("rechaza marcadores invalidos", () => {
  const broken = structuredClone(entries[0]);
  broken.fileName = "score-invalido.json";
  broken.document.groupPredictions[0].matches[0].homeScore = -1;
  assert.throws(
    () => validateSubmission({ ...broken, ...context }),
    /marcador invalido/
  );
});

test("rechaza jugadores desconocidos", () => {
  const broken = structuredClone(entries[0]);
  broken.fileName = "desconocido.json";
  broken.document.player.id = "fantasma";
  assert.throws(
    () => validateSubmission({ ...broken, ...context }),
    /jugador desconocido/
  );
});

test("clasificado declarado distinto al recompute: se DERIVA al criterio 2026 + aviso (no falla)", () => {
  const altered = structuredClone(entries[0]);
  altered.fileName = "declarado-distinto.json";
  const groupId = altered.document.groupPredictions[0].groupId;
  // declarar un 1o valido del grupo pero distinto al que producen los marcadores.
  altered.document.groupPredictions[0].firstPlace = "south-africa";
  const validated = validateSubmission({ ...altered, ...context });
  // ya no falla: el clasificado se deriva del recompute 2026, el declarado es advisory.
  const first = validated.qualifiedPredictions.find(
    (q) => q.groupId === groupId && q.position === 1
  );
  assert.notEqual(first.teamId, "south-africa", "deriva del recompute 2026, no del declarado");
  assert.ok(
    validated.warnings.some((w) => w.groupId === groupId),
    "registra un aviso de derivacion para el grupo alterado"
  );
});

test("acepta metadata valida de una correccion autorizada", () => {
  const corrected = structuredClone(entries[0]);
  corrected.fileName = "correccion.json";
  corrected.document.replacesChecksum = "a".repeat(64);
  corrected.document.correctionPlayerId = corrected.document.player.id;
  corrected.document.correctionGeneratedAt = "2026-06-09T20:00:00.000Z";
  const validated = validateSubmission({ ...corrected, ...context });
  assert.equal(validated.submission.replacesChecksum, "a".repeat(64));
});

test("rechaza metadata de correccion ligada a otro jugador", () => {
  const corrected = structuredClone(entries[0]);
  corrected.fileName = "correccion-ajena.json";
  corrected.document.replacesChecksum = "a".repeat(64);
  corrected.document.correctionPlayerId = "fantasma";
  corrected.document.correctionGeneratedAt = "2026-06-09T20:00:00.000Z";
  assert.throws(
    () => validateSubmission({ ...corrected, ...context }),
    /correctionPlayerId debe coincidir/
  );
});
