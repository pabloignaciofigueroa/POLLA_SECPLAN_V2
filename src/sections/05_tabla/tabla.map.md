# 05_tabla — Mapa técnico

## Estado
wireframe-implemented

## COMANDA_10 - Iteracion visual hacia referencia arcade (2026-05-30)
- Se recuperaron `PlayerPredictionsPanel` y `NextMatchCard` en la columna derecha (fueron retirados en Fase 10).
- Se calculan `accuracyRows` via `calculateCurrentMatchAccuracy` y `nextMatch` via `resultsData.nextMatchId`.
- Se compactaron verticalmente todos los componentes para lograr first view sin scroll en 1440x900 y 1280x900 con los 15 jugadores visibles.
- Archivos tocados: TablaSection.astro, TablaSection.module.css, TablaHero.astro, RankingTable.astro, RankingRow.astro, MovementIndicator.astro, StreakPill.astro, LiveMatchCard.astro, PlayerPredictionsPanel.astro, PlayerPredictionRow.astro, NextMatchCard.astro.
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
- streak-pill
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
├── StreakPill.astro
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
- src/data/results.mock.json — resultados demo y partido en curso para wireframe.
- src/data/scoring-rules.json — reglas de puntaje exacto/tendencia/Lone Wolf.
- src/data/table-predictions.mock.json — predicciones demo para ranking calculado.

## Lógica
- src/lib/tabla/calculatePlayerStandings.ts — calcula puntos, posiciones, rendimiento y racha.
- src/lib/tabla/calculatePlayerMovement.ts — calcula sube/baja/mantiene/nuevo.
- src/lib/tabla/calculateCurrentMatchAccuracy.ts — compara predicciones contra partido en curso.
- src/lib/tabla/getLiveOrRelevantMatch.ts — selecciona partido actual y próximo.
- src/lib/tabla/formatRankingRows.ts — normaliza filas de ranking.

## Comportamiento
- Render SSR con mock calculado.
- JS local encapsulado en `[data-section="tabla"]`.
- Si existe `polla:predictions`, mezcla predicciones guardadas desde `/predicciones` y recalcula ranking/panel.
- Categorías compartidas: `EXCELENTE`, `CERCA`, `REGULAR`, `LEJOS`, `MUY LEJOS`.

## Assets pendientes
- public/assets/players/* — avatares reales.
- public/assets/flags/* — banderas reales.
- public/assets/backgrounds/bg-05-tabla-clean.webp — background final.

## Notas
- Fase 2 wireframe: sin backend, sin resultados oficiales y sin arte final.
- No confundir con Estadísticas: Tabla = ranking competitivo directo.

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- MovementIndicator (up/down/same/new): `icon-trend-up-green` / `icon-trend-down-red` / `icon-trend-neutral-gray` / `icon-star-blue`; tabla.client.js actualiza `img.src` (no textContent) + `:global([data-section=tabla] [data-movement] img)`.
- Ranking sigue saliendo de data/logica; los assets solo decoran el movimiento.

## Fase 12 - Pipeline marcador en vivo -> tabla dinamica (2026-06-08)

La tabla ahora reacciona al marcador que el admin edita en `/admin`.

- Fuente viva: `tabla.client.js` se suscribe con `subscribeLiveData(callback)` del seam `src/lib/liveMatch/liveMatchState.js` (hoy localStorage + eventos `polla:live-score-updated` / `polla:official-results-updated` + `storage` para otra pestaña; manana Supabase realtime reimplementando solo esa funcion).
- Recompute por snapshot `{ liveMatch, officialResults }`:
  - `officialResults` (key `polla:officialResults`) se folden como resultados `finished`.
  - el `liveMatch` (key `polla:liveMatchState`) se sobrepone como provisional contado.
  - se recalculan standings (`calculateStandings(preds, resultsArg)`) y accuracy (`calculateAccuracy(preds, matchId, resultsArg)`) — ambas refactorizadas para recibir resultados por parametro.
  - flechas de movimiento = posicion provisional vs ranking oficial (sin live).
  - se re-apunta `LiveMatchCard` (hooks `data-live-*`, banderas `data-live-home/away-flag`) y `NextMatchCard` (`data-next-*`).
  - se revela el banner `data-tabla-provisional` y `section[data-provisional]`.
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
