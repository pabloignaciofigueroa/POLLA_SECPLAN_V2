#!/usr/bin/env node
// ============================================================================
// Sincroniza la base de Supabase (ELIMINATORIAS) con: jugadores (players.json),
// resultados oficiales (knockout-results.json) y los CARTONES que mandan los
// jugadores (carpeta de JSON descargados desde /predicciones).
//
// Escribe DIRECTO vía la service_role key (bypassa RLS). 100% idempotente
// (UPSERT por PK), se puede re-correr cuando lleguen cartones nuevos.
//
// Uso:
//   node scripts/sync-supabase.mjs --check        # READ-ONLY: verifica conexión + tablas, no escribe
//   node scripts/sync-supabase.mjs                # sincroniza todo
//   node scripts/sync-supabase.mjs --dry-run      # no escribe, solo muestra
//   node scripts/sync-supabase.mjs --dir=../cartones
//   node scripts/sync-supabase.mjs --no-players --no-results   # solo cartones
//
// Env (en site/.env.local o el shell):
//   PUBLIC_SUPABASE_URL          https://xxxx.supabase.co  (o SUPABASE_URL)
//   SUPABASE_SECRET_KEY          (Settings > API) — SECRETO (acepta SUPABASE_SERVICE_ROLE_KEY)
//   CARTONES_DIR                 carpeta con los .json (default: ../cartones)
// ============================================================================
import { readFile, readdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, "..");

// ---------- env (.env.local / .env / process.env) ----------
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(SITE_DIR, file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnvFiles();

// ---------- flags ----------
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const DRY = has("--dry-run");
const CHECK = has("--check");
const SKIP_PLAYERS = has("--no-players");
const SKIP_RESULTS = has("--no-results");
const SKIP_DATASET = has("--no-dataset");
const SKIP_CARTONES = has("--no-cartones");
const CARTONES_DIR = path.resolve(
  SITE_DIR,
  valOf("dir", process.env.CARTONES_DIR || "../cartones"),
);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE_KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
const KNOCKOUT_TABLES = ["players", "knockout_predictions", "knockout_podium", "knockout_results"];

const log = (...a) => console.log(...a);
const slugify = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "jugador";

// ---------- supabase client (service role) ----------
async function getClient() {
  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new Error("Falta PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY (en site/.env.local o el shell).");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });
}

async function clientWith(key) {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

// CHECK read-only: verifica conexión + que las 4 tablas existan/lean. NO escribe nada.
// Usa `head:true` (cuenta filas sin traerlas). No imprime URL ni keys.
async function runCheck() {
  if (!SUPABASE_URL || !SECRET_KEY) {
    throw new Error("Falta PUBLIC_SUPABASE_URL y/o SUPABASE_SECRET_KEY en site/.env.local.");
  }
  log("Check read-only (no escribe nada).");
  let ok = true;

  // 1) Tablas alcanzables con la secret key (GET real: limit 1, surface el error si no existe).
  const admin = await clientWith(SECRET_KEY);
  log("\nTablas (secret key):");
  for (const t of KNOCKOUT_TABLES) {
    const { data, error } = await admin.from(t).select("*").limit(1);
    if (error) { ok = false; console.error(`  ✗ ${t}: ${error.message}`); }
    else log(`  ✓ ${t} — accesible (${data.length} fila de muestra)`);
  }

  // 2) Lectura PÚBLICA con la publishable key (lo que usará el browser vía RLS).
  if (PUBLISHABLE_KEY) {
    const anon = await clientWith(PUBLISHABLE_KEY);
    const { error } = await anon.from("players").select("*").limit(1);
    if (error) { ok = false; console.error(`  ✗ lectura pública (publishable): ${error.message}`); }
    else log("\n  ✓ lectura pública (publishable key) OK — RLS de SELECT funciona para el browser");
  } else {
    log("\n  • Sin PUBLIC_SUPABASE_PUBLISHABLE_KEY: omito el check de lectura pública.");
  }

  log(ok
    ? "\n✅ Check OK: conexión y tablas verificadas. No se escribió nada."
    : "\n✗ Hay problemas (ver arriba). Tip: ¿corriste la migración 0001_knockout_polla.sql? No se escribió nada.");
  process.exitCode = ok ? 0 : 1;
}

async function upsert(supabase, table, rows, onConflict) {
  if (!rows.length) return { count: 0 };
  if (DRY) { log(`  [dry-run] ${table}: ${rows.length} filas (onConflict=${onConflict})`); return { count: rows.length }; }
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  return { count: rows.length };
}

// ---------- builders ----------
async function loadJson(rel) {
  return JSON.parse(await readFile(path.join(SITE_DIR, rel), "utf8"));
}

function playerRows(players) {
  return players.map((p) => ({
    id: p.id, name: p.name, avatar: p.avatar ?? null,
    avatar_thumb: p.avatarThumb ?? null, status: p.status ?? "available",
  }));
}

function resultRows(seed) {
  return (seed.results ?? []).map((r) => ({
    match_id: r.matchId,
    home_score: r.homeScore ?? null,
    away_score: r.awayScore ?? null,
    winner: r.winner ?? null,
    status: r.status ?? "final",
  }));
}

// Una submission del dataset commiteado (knockout-predictions.json) -> filas de predicción + podio.
function submissionToRows(sub) {
  const playerId = sub?.playerId;
  if (!playerId) return null;
  const preds = Object.entries(sub.predictions ?? {}).map(([matchId, p]) => ({
    player_id: playerId,
    match_id: matchId,
    home_score: p.homeScore ?? null,
    away_score: p.awayScore ?? null,
    advances: p.advances ?? null,
    qualified_team: null,
    locked: false,
    points: null,
  }));
  const pod = sub.podium ?? {};
  const hasPod = pod.champion || pod.runnerUp || pod.third || pod.fourth;
  const podiumRow = hasPod
    ? { player_id: playerId, champion: pod.champion ?? null, runner_up: pod.runnerUp ?? null, third: pod.third ?? null, fourth: pod.fourth ?? null }
    : null;
  return { playerId, preds, podiumRow };
}

// Un cartón (JSON descargado por el jugador) -> filas de predicción + fila de podio.
function cartonToRows(carton) {
  const playerId = carton?.player?.id || slugify(carton?.player?.displayName);
  if (!playerId) return null;

  // Preferimos el array estructurado `predictions`; si no, el bucket crudo.
  let preds = [];
  if (Array.isArray(carton.predictions) && carton.predictions.length) {
    preds = carton.predictions.map((p) => ({
      player_id: playerId,
      match_id: p.matchId,
      home_score: p.homeScore ?? null,
      away_score: p.awayScore ?? null,
      advances: p.advances ?? null,
      qualified_team: p.qualifiedTeam ?? null,
      locked: Boolean(p.locked),
      points: p.points ?? null,
    }));
  } else {
    const raw = carton?.raw?.knockoutPredictions ?? {};
    preds = Object.entries(raw).map(([matchId, p]) => ({
      player_id: playerId,
      match_id: matchId,
      home_score: p.homeScore ?? null,
      away_score: p.awayScore ?? null,
      advances: p.advances ?? null,
      qualified_team: null,
      locked: Boolean(p.locked),
      points: null,
    }));
  }

  const pod = carton.podium ?? carton?.raw?.podium ?? {};
  const podiumRow = {
    player_id: playerId,
    champion: pod.champion ?? null,
    runner_up: pod.runnerUp ?? null,
    third: pod.third ?? null,
    fourth: pod.fourth ?? null,
  };

  return { playerId, preds, podiumRow };
}

// ---------- main ----------
(async () => {
  if (CHECK) { await runCheck(); return; }
  // No imprimimos la URL ni las keys en consola (seguridad).
  log(`Supabase sync ${DRY ? "(DRY-RUN)" : ""} → ${SUPABASE_URL ? "destino configurado" : "(sin destino)"}`);
  // En dry-run no se escribe nada, así que no requiere credenciales (preview local).
  const supabase = DRY ? null : await getClient();

  // 1) Jugadores
  if (!SKIP_PLAYERS) {
    const players = await loadJson("src/data/players.json");
    const { count } = await upsert(supabase, "players", playerRows(players), "id");
    log(`✓ players: ${count}`);
    // Prune: jugadores en la base que ya NO están en players.json se borran (FK cascade
    // elimina sus predicciones/podio). Así, dar de baja a alguien en players.json lo limpia.
    if (!DRY) {
      const wanted = new Set(players.map((p) => p.id));
      const { data: existing } = await supabase.from("players").select("id");
      const toDelete = (existing ?? []).map((r) => r.id).filter((id) => !wanted.has(id));
      if (toDelete.length) {
        const { error } = await supabase.from("players").delete().in("id", toDelete);
        if (error) throw new Error(`prune players: ${error.message}`);
        log(`✓ prune: borrados ${toDelete.length} (${toDelete.join(", ")})`);
      }
    }
  }

  // 2) Resultados oficiales (seed commiteado)
  if (!SKIP_RESULTS) {
    const seed = await loadJson("src/data/knockout-results.json");
    const rows = resultRows(seed);
    const { count } = await upsert(supabase, "knockout_results", rows, "match_id");
    log(`✓ knockout_results: ${count}`);
  }

  // 3) Dataset commiteado de cartones (knockout-predictions.json) — la fuente canónica actual.
  if (!SKIP_DATASET) {
    const ds = await loadJson("src/data/knockout-predictions.json");
    const preds = [];
    const podium = [];
    for (const sub of (ds.submissions ?? [])) {
      const out = submissionToRows(sub);
      if (!out) continue;
      preds.push(...out.preds);
      if (out.podiumRow) podium.push(out.podiumRow);
    }
    const p = await upsert(supabase, "knockout_predictions", preds, "player_id,match_id");
    log(`✓ knockout_predictions (dataset): ${p.count}`);
    if (podium.length) {
      const pd = await upsert(supabase, "knockout_podium", podium, "player_id");
      log(`✓ knockout_podium (dataset): ${pd.count}`);
    }
  }

  // 4) Cartones de los jugadores (carpeta de JSON sueltos, additivo)
  if (!SKIP_CARTONES) {
    if (!existsSync(CARTONES_DIR)) {
      log(`• Sin carpeta de cartones (${CARTONES_DIR}); omito. Creala y dejá ahí los .json de los jugadores.`);
    } else {
      const files = (await readdir(CARTONES_DIR)).filter((f) => f.toLowerCase().endsWith(".json"));
      log(`• ${files.length} cartón(es) en ${CARTONES_DIR}`);
      const allPreds = [];
      const allPodium = [];
      const seenPlayers = new Set();
      for (const f of files) {
        let carton;
        try { carton = JSON.parse(await readFile(path.join(CARTONES_DIR, f), "utf8")); }
        catch (e) { console.error(`  ✗ ${f}: JSON inválido (${e.message})`); continue; }
        const out = cartonToRows(carton);
        if (!out) { console.error(`  ✗ ${f}: sin player.id`); continue; }
        if (seenPlayers.has(out.playerId)) {
          log(`  ! ${f}: cartón duplicado de ${out.playerId} (gana el último archivo)`);
        }
        seenPlayers.add(out.playerId);
        allPreds.push(...out.preds);
        allPodium.push(out.podiumRow);
        log(`  ↳ ${out.playerId}: ${out.preds.length} cruces${out.podiumRow.champion ? " + podio" : ""}`);
      }
      const p = await upsert(supabase, "knockout_predictions", allPreds, "player_id,match_id");
      log(`✓ knockout_predictions: ${p.count}`);
      const pd = await upsert(supabase, "knockout_podium", allPodium, "player_id");
      log(`✓ knockout_podium: ${pd.count}`);
    }
  }

  log(DRY ? "\nDRY-RUN ok (no se escribió nada)." : "\n✅ Sincronización completa.");
})().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
