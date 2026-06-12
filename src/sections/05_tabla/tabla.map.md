# 05_tabla — Mapa técnico

## Estado
supabase-realtime-active + tri-estado-formalizado

## Tri-estado del marcador: official / live / pending - 2026-06-12

- Fuente unica de fase: `lib/liveMatch/liveMatchPhase.js` →
  `resolveLiveMatchPhase({ liveMatch, fixtureMatch, officialResults, now })`.
  Formaliza los dos parches de emergencia previos (bloqueo de puntaje antes
  del inicio + partido pendiente visible sin puntuar).
- Tabla de decision: (1) sin payload/matchId → null; (2) matchId oficializado
  → `official` (gana siempre); (3) scores no enteros → `pending`; (4) goles > 0
  → `live` (acto explicito del Admin, inmune a relojes desfasados; un
  preparado siempre nace 0-0); (5) 0-0 con hora de fixture → `live` desde el
  kickoff (`dateUtc`/`dateChile`), antes `pending`; (6) 0-0 sin hora confiable
  → `pending` (fail-safe: nunca regalar puntos).
- En `tabla.client.js`: `liveToResult` volvio a ser conversion pura; el gating
  vive en la fase. Solo `live` puntua, recalcula provisional, mueve flechas y
  muestra el banner. `pending` re-apunta la hero card (estado `waiting`
  amarillo, "EN ESPERA", "Sin goles aun", scores "-"), la NextMatchCard
  (muestra el MISMO partido pendiente) y el panel derecho (filas EN ESPERA /
  0 puntos via `calculateAccuracy` sin resultado).
- La fase live termina solo con FINALIZAR (sin expiracion automatica por
  tiempo); el recompute provisional cubre la espera hasta oficializar.
- Admin escribe `status` explicito en el payload (`live` al actualizar,
  `pending` al preparar el siguiente); compatible con filas viejas de Supabase
  (la fase no depende del status para decidir).
- Tests: `tests/live-match-phase.test.mjs` (10 casos, incluye el caso real
  Mexico 2-0 oficial + Corea-Chequia 0-0 preparado antes del kickoff).

## Universo oficial de 13 cartones - 2026-06-12

- Tabla consume dinamicamente los 13 cartones de `predictions.json`, incluyendo
  a Felipe e Italo, sin filas manuales ni cambios en `lib/tabla`.
- El snapshot vigente contiene 936 marcadores y 312 posiciones clasificatorias.
- Se conserva el orden funcional: Ranking a la izquierda, predicciones a la
  derecha; mobile mantiene Tabla, Predicciones y Leyenda.

## Predicciones oficiales corales - 2026-06-09

- `src/data/predictions.json` contiene los cartones oficiales importados.
- Antes del primer resultado aparece un pulso de pretemporada con cartones y
  marcadores cargados; el ranking permanece en cero.
- Desde el primer resultado, SSR y Realtime puntuan las predicciones con 5/3/1/0.

## Refresco arcade aditivo (2026-06-10)
- Nuevo `PodiumStrip.astro`: franja top-3 sobre la tabla (medalla por puesto, avatar, puntos y brecha con el lider). Se monta en `rankingArea`, no reemplaza la tabla.
- `tabla.client.js` gana `renderPodium(rows)` (sincroniza el podio en cada recompute en vivo, nunca queda obsoleto) y `wireCrossHighlight()` (al pasar/enfocar fila, prediccion o podio, resalta al mismo jugador en las tres zonas via `.is-cross-highlight`).
- `RankingRow.astro`: shimmer dorado suave del lider (`leaderGlow`, solo `prefers-reduced-motion: no-preference`) + estilo cross-highlight.
- `PlayerPredictionRow.astro`: badge **LONE WOLF** (no "BONUS") controlado por `[data-hit-type="lone_wolf"]`, que el cliente actualiza en vivo; + estilo cross-highlight.
- Sin cambios en `lib/tabla/*`, orden funcional, JSON de data, rutas ni navbar. JS sigue scoped a `[data-section="tabla"]`.

## COMANDA_10 - Iteracion visual hacia referencia arcade (2026-05-30)
- Se recuperaron `PlayerPredictionsPanel` y `NextMatchCard` en la columna derecha (fueron retirados en Fase 10).
- Se calculan `accuracyRows` via `calculateCurrentMatchAccuracy` y `nextMatch` via `resultsData.nextMatchId`.
- Se compactaron verticalmente todos los componentes para lograr first view sin scroll en 1440x900 y 1280x900 con los 15 jugadores visibles.
- Archivos tocados: TablaSection.astro, TablaSection.module.css, TablaHero.astro, RankingTable.astro, RankingRow.astro, MovementIndicator.astro, StreakDot.astro, LiveMatchCard.astro, PlayerPredictionsPanel.astro, PlayerPredictionRow.astro, NextMatchCard.astro.
- Sin cambios en: tabla.client.js, JSON de data, storage keys, rutas, navbar.

## COMANDA_10 iteración 2 (2026-05-30)
- LiveMatchCard movido desde liveArea al interior de TablaHero (reemplaza LastUpdateCard y JornadaCard que se eliminaron).
- TablaHero recibe ahora match/result en vez de lastUpdatedLabel/matchday.
- Columna derecha (liveArea) queda solo con PlayerPredictionsPanel + NextMatchCard → las predicciones suben al tope de la columna.

## Función
Mostrar el centro competitivo vivo de la Polla: ranking, movimiento, puntos, partido en curso y predicciones comparadas.

## Zonas implementadas
- section-shell
- background-energy-layer
- tabla-hero
- last-update-card
- jornada-card
- ranking-table
- ranking-row
- movement-indicator
- streak-dot (data-hit-type: lone_wolf morado / exact azul / tendency verde / miss gris)
- live-match-card
- player-predictions-panel
- player-prediction-row
- accuracy-bar
- next-match-card
- accuracy-legend
- update-note

## Sub-componentes Astro
```txt
05_tabla/
├── TablaSection.astro
├── TablaSection.module.css
├── TablaHero.astro
├── LastUpdateCard.astro
├── JornadaCard.astro
├── RankingTable.astro
├── RankingRow.astro
├── MovementIndicator.astro
├── StreakDot.astro
├── LiveMatchCard.astro
├── PlayerPredictionsPanel.astro
├── PlayerPredictionRow.astro
├── AccuracyBar.astro
├── NextMatchCard.astro
├── AccuracyLegend.astro
├── UpdateNote.astro
└── tabla.client.js
```

## Data
- src/data/players.json — 15 jugadores oficiales.
- src/data/fixture.json — fixture base de 72 partidos.
- src/data/results.json — resultados oficiales base del build.
- src/data/scoring-rules.json — reglas de puntaje exacto/tendencia/Lone Wolf.
- src/data/predictions.json — predicciones oficiales usadas por el ranking.

## Lógica
- src/lib/tabla/calculatePlayerStandings.ts — calcula puntos, posiciones, rendimiento y racha (streak = hitType de los ultimos 5 partidos oficiales, render via StreakDot; tabla.client.js re-renderiza los dots en vivo con renderStreakDots).
- src/lib/tabla/calculatePlayerMovement.ts — calcula sube/baja/mantiene/nuevo.
- src/lib/tabla/calculateCurrentMatchAccuracy.ts — compara predicciones contra partido en curso.
- src/lib/tabla/getLiveOrRelevantMatch.ts — selecciona partido actual y próximo.
- src/lib/tabla/formatRankingRows.ts — normaliza filas de ranking.

## Comportamiento
- Render SSR con la base versionada y recompute cliente sobre el snapshot remoto.
- JS local encapsulado en `[data-section="tabla"]`.
- Supabase REST carga el snapshot inicial y Realtime aplica cambios globales.
- Si existe `polla:predictions`, se mezcla solo como estado local del jugador.
- Categorías compartidas: `EXCELENTE`, `CERCA`, `REGULAR`, `LEJOS`, `MUY LEJOS`.

## Assets pendientes
- public/assets/players/* — avatares reales.
- public/assets/flags/* — banderas reales.
- public/assets/backgrounds/bg-05-tabla-clean.webp — background final.

## Notas
- Supabase es la fuente compartida del marcador y resultados oficiales.
- `localStorage` es cache/fallback, no autoridad global.
- No confundir con Estadísticas: Tabla = ranking competitivo directo.

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- MovementIndicator (up/down/same/new): `icon-trend-up-green` / `icon-trend-down-red` / `icon-trend-neutral-gray` / `icon-star-blue`; tabla.client.js actualiza `img.src` (no textContent) + `:global([data-section=tabla] [data-movement] img)`.
- Ranking sigue saliendo de data/logica; los assets solo decoran el movimiento.

## Fase 12 - Pipeline marcador en vivo -> tabla dinamica (2026-06-08)

La tabla ahora reacciona al marcador que el admin edita en `/admin`.

- Implementacion inicial historica: `tabla.client.js` se suscribia con
  `subscribeLiveData(callback)` usando localStorage y eventos entre pestañas.
  La Fase 14 reemplaza ese transporte por Supabase REST + Realtime.
- Recompute por snapshot `{ liveMatch, officialResults }`:
  - `officialResults` (key `polla:officialResults`) se folden como resultados `finished`.
  - el `liveMatch` (key `polla:liveMatchState`) se sobrepone como provisional contado.
  - se recalculan standings (`calculateStandings(preds, resultsArg)`) y accuracy (`calculateAccuracy(preds, matchId, resultsArg)`) — ambas refactorizadas para recibir resultados por parametro.
  - flechas de movimiento = posicion provisional vs ranking oficial (sin live).
  - se re-apunta `LiveMatchCard` (hooks `data-live-*`, banderas `data-live-home/away-flag`) y `NextMatchCard` (`data-next-*`).
  - (2026-06-12) el banner provisional y PreseasonPulse fueron eliminados de la seccion (comanda 02): el ranking va directo del podio a la tabla.
- Anti-flash: solo recalcula si hay live u oficiales que sobreponer; si no, respeta el SSR.
- Predicciones: la tabla publica puntua contra oficiales (`predictions.json`); el recompute mergea `polla:predictions` solo para uso local (ver nota de testing del plan).
- No se modifica `fixture.json` (calendario fijo).

## Fase 13 - Puntaje correcto + precision visual separada (2026-06-08)

Fuente UNICA de calculo: `src/lib/liveMatch/liveScoring.js` (la usan el SSR
`lib/tabla/calculatePlayerStandings.ts` + `calculateCurrentMatchAccuracy.ts` y el
recompute en vivo `tabla.client.js`). Sin logica duplicada.

- PUNTOS (ordena el ranking), modelo NO aditivo:
  - exacto unico (Lone Wolf) = 5; exacto compartido = 3; tendencia = 1; nada = 0.
  - `calculatePointsForPrediction(pred, result, allPredsForMatch)` -> `{ points, hitType, label }`.
  - Bug corregido: el modelo aditivo daba 8 a un exacto unico; ademas `Number()` en
    los cruces evita que un exacto `"2"` vs `2` quedara en 0.
- PRECISION % (solo visual, NO da puntos): `calculateLiveAccuracy(pred, liveResult)`.
  - Distingue exacto alcanzable (`pred>=live` en ambos) vs imposible (los goles no bajan):
    con 5-2, la prediccion 6-3 tiene mas % que 4-1 aunque ambas esten a 2 goles.
- UI `PlayerPredictionRow.astro`: columna "Dif." -> "Puntos" (`data-prediction-points`
  + `data-prediction-type`, coloreado por `data-hit-type`); precision aparte
  (`data-prediction-percent` + barra + `data-prediction-acc-label`).
- Tests: `node` sobre `liveScoring.js` cubre los 8 casos del spec + coercion (15 asserts).

## Fase 14 - Supabase Realtime compartido (2026-06-08)

Esta fase reemplaza como estado vigente el transporte local descrito en Fase 12.

- `subscribeLiveData()` carga REST y escucha `postgres_changes` sobre
  `polla_live_match` y `polla_official_results`.
- Todos los navegadores consumen el mismo marcador y resultados.
- RLS permite lectura publica; no existen policies publicas de escritura.
- `polla:liveMatchState` y `polla:officialResults` son solo cache/fallback.
- Configuracion: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`.
- DDL/RPC/publicacion: `supabase/migrations/20260608170000_polla_live_realtime.sql`.

## Refresco 2026-06-12 (comandas 01/02/03/05)

- Tipografia por rol: headers en --font-display 700 (tracking 0.06em), nombres
  de jugadores en --font-ui 700, numeros (pos/pts/rend/predicciones/precision)
  en --font-score 700 tabular-nums (Rajdhani; fonts.css corregido para que
  Rajdhani gane sobre Barlow), estados secundarios (EN ESPERA / SIN INFO) en
  --font-ui 600.
- Racha: dots por hitType (slice -5), mismo mapeo de color que el panel
  derecho y Estadisticas/Partidos: morado +5, azul +3, verde +1, gris 0.
  StreakDot.astro usa <style is:global> anclado a [data-rank-streak] porque
  tabla.client.js recrea los dots en runtime (renderStreakDots, sin innerHTML).
- Barras eliminadas: PreseasonPulse (componente borrado) y banner provisional
  (markup + CSS + toggleProvisional fuera). Podio -> ranking sin intermedios.
- Mobile (<=720px): ranking = lista compacta de una linea por jugador
  (38px | 1fr | 48px | 52px | 44px), header unico en el thead de RankingTable,
  sin labels por fila (td::before eliminado), min-height 3.5rem por fila.
