# Runbook — Sumar predicciones de una nueva fase (aditivo, NUNCA borrar)

Guía para **agregar** las predicciones de cada fase nueva al dataset, sin tocar nada de lo
anterior. Se usa igual en **octavos → cuartos → semis → 3er puesto → final**. El JSON solo
**crece**; los puntos siempre se **suman** a lo que ya había.

---

## 🥇 Regla de oro

> **Solo se SUMA. Nunca se borra ni se reemplaza nada viejo.**
> El merge es **por `matchId`**: se agregan/actualizan únicamente las keys de la fase nueva.
> El **podio** (campeón/2º/3º/4º) es un one‑time de 16avos: **no se toca** en los merges de fase.

---

## Archivos involucrados (rutas exactas)

| Qué | Dónde | Rol |
|---|---|---|
| Cartones que baja cada jugador | `../cartones/predicciones_<jugador>_<fecha>.json` (carpeta hermana de `site/`) | **Origen** de cada fase. Pueden convivir todos (el merge filtra por ronda). |
| Dataset compilado (el que CRECE) | `site/src/data/knockout-predictions.json` | **Fuente canónica**. Lo lee la web (SSR) y de acá sube a Supabase. |
| Resultados oficiales (seed) | `site/src/data/knockout-results.json` | **NO se toca** en este flujo (los resultados los cargas por /admin → Supabase). |
| Base en vivo | Supabase (tablas `players`, `knockout_predictions`, `knockout_podium`, `knockout_results`) | Lo que ve la web en cualquier dispositivo. |

**Forma de un cartón** (lo que interesa): `raw.knockoutPredictions = { "P89": { homeScore, awayScore, advances }, … }` y `podium = { champion, runnerUp, third, fourth }`.

**Forma del dataset**: `submissions: [ { playerId, predictions: { [matchId]: { homeScore, awayScore, advances } }, podium: {…} } ]`.

---

## Qué `matchId` es cada fase (NO editar ids)

| Fase | `round` | Partidos |
|---|---|---|
| Dieciseisavos | `R32` | **P73–P88** (ya en el dataset) |
| **Octavos** | `R16` | **P89–P96** |
| Cuartos | `QF` | **P97–P100** |
| Semifinal | `SF` | **P101–P102** |
| Tercer puesto | `3P` | **P103** |
| Final | `F` | **P104** |

---

## Procedimiento por fase (paso a paso)

1. **Junta los cartones nuevos** de la fase en `../cartones/` (pueden estar los viejos también; no molestan).
2. **Merge aditivo al dataset** con el script de abajo, indicando la ronda. Primero en seco:
   ```bash
   cd site
   node scripts/merge-fase.mjs --round=R16 --dir=../cartones --dry-run   # muestra, no escribe
   node scripts/merge-fase.mjs --round=R16 --dir=../cartones             # escribe el dataset
   ```
   (Para cuartos usa `--round=QF`, semis `--round=SF`, 3er puesto `--round=3P`, final `--round=F`.)
3. **Revisa el diff** (debe ser SOLO agregados de esa fase, nunca borrados):
   ```bash
   git diff -- src/data/knockout-predictions.json
   ```
4. **Sube a Supabase** (seguro, sin tocar resultados ni pisar podios):
   ```bash
   npm run supabase:sync -- --check                       # solo lectura
   npm run supabase:sync -- --dry-run --no-results --no-cartones
   npm run supabase:sync -- --no-results --no-cartones    # escribe
   ```
   > **Por qué `--no-cartones`:** el sync tiene un paso que carga la carpeta de cartones y, si un
   > cartón trae `podium: null`, **pisaría** el podio ya guardado. Sincronizando **solo el dataset**
   > (que es canónico) eso no pasa. **Por qué `--no-results`:** los resultados en vivo se manejan por
   > /admin; el seed solo tiene P73 y no queremos re‑escribirlo.
5. **Commit + push** (a `v2/main`, NUNCA a `origin`):
   ```bash
   git add src/data/knockout-predictions.json
   git commit -m "data(<fase>): suma predicciones de <fase> (aditivo)"
   git push v2 main
   ```

---

## Script de merge (crear en `site/scripts/merge-fase.mjs`)

Toma **solo** las picks de la ronda indicada de cada cartón y las **fusiona por `matchId`** en el
dataset. No borra nada, no reemplaza rondas viejas, y **no toca el podio**.

```js
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
  // El podium NO se toca acá (one-time de 16avos). Cambios de podio = paso manual aparte (ver abajo).
  console.log(`  ↳ ${pid}: +${Object.keys(nuevas).length} de ${ROUND}`);
}

console.log(`\n${ROUND}: ${added} nuevas, ${updated} actualizadas, ${nuevosJugadores} jugador(es) nuevo(s).`);
if (DRY) { console.log("DRY-RUN: no se escribió nada."); process.exit(0); }
writeFileSync(DATASET, JSON.stringify(ds, null, 2) + "\n");
console.log("✅ dataset actualizado (aditivo, nada borrado).");
```

---

## Caso aparte: corregir/agregar un PODIO manual

Si a alguien le faltó el podio (como pasó con italo/martin), es un cambio **manual y separado**,
nunca dentro del merge de fase. Editar solo el campo `podium` de esa submission en el dataset y
subir con `--no-results --no-cartones`. Ejemplo del script puntual usado:

```js
const data = JSON.parse(fs.readFileSync("src/data/knockout-predictions.json", "utf8"));
const sub = data.submissions.find(s => s.playerId === "italo");
sub.podium = { champion: "FRA", runnerUp: "BRA", third: "ARG", fourth: "ESP" }; // solo agrega/actualiza podium
fs.writeFileSync("src/data/knockout-predictions.json", JSON.stringify(data, null, 2) + "\n");
```

---

## 🚨 Prohibiciones (nunca hacer)

1. **Nunca borrar** cartones viejos ni entradas del dataset. Todo suma, nada se elimina.
2. **Nunca reemplazar** el objeto `predictions` completo de un jugador — solo **merge por `matchId`** de la fase nueva.
3. **Nunca pisar** un `podium` existente con `null` (por eso `--no-cartones` en el sync).
4. **Nunca tocar** `knockout-results.json` en el sync (usar `--no-results`; los resultados van por /admin → Supabase).
5. **Nunca pushear a `origin`** — solo a **`v2/main`** (POLLA_SECPLAN_V2).
6. **Nunca commitear** `.env.local` ni `dist/` (están gitignored; mantenerlo así).
7. **Operar solo** dentro de `…\clean_v2_alpha_01 - copia (41) LOCAL_AISLADA\site` (+ leer `..\cartones`). Ninguna otra copia.

---

## ✅ Checklist por fase

- [ ] Cartones de la fase en `../cartones/`.
- [ ] `node scripts/merge-fase.mjs --round=<R16|QF|SF|3P|F> --dry-run` → revisar conteos.
- [ ] Correr el merge real → `git diff` muestra **solo agregados** de esa fase.
- [ ] (si aplica) podios manuales pendientes.
- [ ] `npm run supabase:sync -- --check` → OK.
- [ ] Verificar prune = NINGUNO (roster de `players.json` == Supabase).
- [ ] `npm run supabase:sync -- --no-results --no-cartones`.
- [ ] Verificar en Supabase que las picks nuevas quedaron.
- [ ] `git commit` del dataset + `git push v2 main`.
