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
