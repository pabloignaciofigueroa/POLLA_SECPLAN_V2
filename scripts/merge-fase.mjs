// scripts/merge-fase.mjs — suma las picks de UNA fase al dataset, aditivo. NUNCA borra.
// Uso: node scripts/merge-fase.mjs --round=R16 --dir=../cartones [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const val = (n, d) => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const DRY = args.includes("--dry-run");
const ROUND = val("round");                                  // R16 | QF | SF | 3P | F
const DIR = path.resolve(val("dir", "../cartones"));
if (!ROUND) { console.error("Falta --round=R16|QF|SF|3P|F"); process.exit(1); }

const DATASET = "src/data/knockout-predictions.json";
const MATCHES = JSON.parse(readFileSync("src/data/knockout-matches.json", "utf8")).matches;
const phaseIds = new Set(MATCHES.filter(m => m.round === ROUND).map(m => m.id));
if (!phaseIds.size) { console.error(`Ronda ${ROUND} sin partidos`); process.exit(1); }

const ds = JSON.parse(readFileSync(DATASET, "utf8"));
const byId = new Map(ds.submissions.map(s => [s.playerId, s]));
const slug = s => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

let added = 0, updated = 0, nuevosJugadores = 0;
for (const f of readdirSync(DIR).filter(f => f.toLowerCase().endsWith(".json"))) {
  let c; try { c = JSON.parse(readFileSync(path.join(DIR, f), "utf8")); }
  catch (e) { console.warn(`  ! ${f}: JSON inválido (${e.message})`); continue; }
  const pid = c?.player?.id || slug(c?.player?.displayName);
  if (!pid) { console.warn(`  ! ${f}: sin player.id`); continue; }

  const raw = c?.raw?.knockoutPredictions ?? {};
  const nuevas = {};                                          // SOLO las de esta fase
  for (const [mid, p] of Object.entries(raw)) {
    if (!phaseIds.has(mid)) continue;                         // ignora otras rondas
    if (p.homeScore == null || p.awayScore == null) continue; // incompleta: se ignora
    nuevas[mid] = { homeScore: p.homeScore, awayScore: p.awayScore, advances: p.advances ?? null };
  }
  if (!Object.keys(nuevas).length) continue;

  let sub = byId.get(pid);
  if (!sub) { sub = { playerId: pid, predictions: {} }; ds.submissions.push(sub); byId.set(pid, sub); nuevosJugadores++; }
  sub.predictions = sub.predictions || {};
  for (const [mid, p] of Object.entries(nuevas)) {
    if (mid in sub.predictions) updated++; else added++;
    sub.predictions[mid] = p;                                 // merge por matchId (agrega/actualiza SOLO esta fase)
  }
  // El podium NO se toca acá (one-time de 16avos). Cambios de podio = paso manual aparte (ver runbook).
  console.log(`  ↳ ${pid}: +${Object.keys(nuevas).length} de ${ROUND}`);
}

console.log(`\n${ROUND}: ${added} nuevas, ${updated} actualizadas, ${nuevosJugadores} jugador(es) nuevo(s).`);
if (DRY) { console.log("DRY-RUN: no se escribió nada."); process.exit(0); }
writeFileSync(DATASET, JSON.stringify(ds, null, 2) + "\n");
console.log("✅ dataset actualizado (aditivo, nada borrado).");
