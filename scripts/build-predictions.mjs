import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDataset } from "./predictions-importer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const dataRoot = path.join(siteRoot, "src", "data");
const publicDataRoot = path.join(siteRoot, "public", "data");

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const [players, fixture, groups, teams] = await Promise.all([
  readJson(path.join(dataRoot, "players.json")),
  readJson(path.join(dataRoot, "fixture.json")),
  readJson(path.join(dataRoot, "groups.json")),
  readJson(path.join(dataRoot, "teams.json")),
]);

const inputNames = (await fs.readdir(siteRoot))
  .filter((name) => /^predicciones_.+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/i.test(name))
  .sort();

if (inputNames.length === 0) {
  throw new Error(`No se encontraron cartones en ${siteRoot}.`);
}

const entries = await Promise.all(
  inputNames.map(async (fileName) => {
    const raw = await fs.readFile(path.join(siteRoot, fileName), "utf8");
    return { fileName, raw, document: JSON.parse(raw) };
  })
);

const dataset = buildDataset({
  entries,
  players,
  matches: fixture.matches,
  groups,
  teams,
});
const serialized = `${JSON.stringify(dataset, null, 2)}\n`;

await fs.mkdir(publicDataRoot, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(dataRoot, "predictions.json"), serialized, "utf8"),
  fs.writeFile(path.join(publicDataRoot, "community-predictions.json"), serialized, "utf8"),
]);

console.log(
  `Predicciones: ${dataset.confirmedCards}/${dataset.expectedPlayers} cartones, ` +
    `${dataset.totals.predictions} marcadores, ` +
    `${dataset.totals.qualifiedPositions} posiciones clasificatorias.`
);
