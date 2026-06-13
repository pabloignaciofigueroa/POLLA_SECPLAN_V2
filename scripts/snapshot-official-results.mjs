// Snapshot de los resultados oficiales (partidos cerrados por el Admin) desde
// Supabase a un JSON commiteado: src/data/official-results.json.
//
// El GRÁFICO de /estadisticas siembra de este archivo para dibujar la carrera al
// instante (sin depender del handshake en vivo); el realtime solo actualiza
// encima. Refrescar cuando el Admin cierre mas partidos:
//   npm run results:snapshot
//
// Lee PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY de .env.local (o .env).
// Solo lectura (REST GET con anon key, RLS publica). No escribe en Supabase.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outPath = path.join(siteRoot, "src", "data", "official-results.json");

const loadEnv = async () => {
  const env = {};
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = await fs.readFile(path.join(siteRoot, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && env[match[1]] === undefined) {
          env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
      }
    } catch {
      // archivo ausente: seguimos con lo que haya
    }
  }
  return env;
};

const env = await loadEnv();
const url = (env.PUBLIC_SUPABASE_URL ?? "").trim();
const key = (env.PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

if (!url || !key) {
  throw new Error(
    "Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY en .env.local; no se puede snapshot."
  );
}

const response = await fetch(
  `${url}/rest/v1/polla_official_results?select=match_number,payload&order=match_number.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);

if (!response.ok) {
  throw new Error(`Supabase respondio ${response.status}: ${await response.text()}`);
}

const rows = await response.json();

// Normalizamos a la forma del payload que ya consume el cliente
// (homeTeamScore/awayTeamScore), conservando solo resultados con marcador entero.
const results = rows
  .map((row) => row.payload)
  .filter(
    (p) =>
      p &&
      p.matchId &&
      Number.isInteger(Number(p.homeTeamScore)) &&
      Number.isInteger(Number(p.awayTeamScore))
  )
  .map((p) => ({
    matchId: p.matchId,
    matchNumber: Number(p.matchNumber ?? 0),
    homeTeamScore: Number(p.homeTeamScore),
    awayTeamScore: Number(p.awayTeamScore),
    status: "finished",
  }))
  .sort((a, b) => a.matchNumber - b.matchNumber);

const snapshot = {
  source: "polla_official_results (Supabase)",
  snapshotAt: new Date().toISOString(),
  count: results.length,
  results,
};

await fs.writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log(
  `Snapshot OK: ${results.length} resultados oficiales -> ${path.relative(siteRoot, outPath)}`
);
for (const r of results) {
  console.log(`  #${r.matchNumber} ${r.matchId} ${r.homeTeamScore}-${r.awayTeamScore}`);
}
