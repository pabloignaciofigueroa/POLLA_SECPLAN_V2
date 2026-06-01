# 06_proximo_partido — Mapa técnico

## Estado
wireframe-implemented

## Fase 10 - Simplificacion arcade
La previa queda en hero, equipos/VS, lectura de 3 claves y panel de comunidad. Se retiraron contexto tecnico, deadline y CTA de prediccion.

## Iteracion visual (2026-05-30)
- Hero: sin badge pill, titulo más heroico con marcas decorativas SVG laterales.
- MetaStrip: barra horizontal plana con íconos SVG, sin pills de color. Se eliminó el pill MODE.
- TeamMatchCard: border lateral por side (home=verde, away=naranja), íconos en stats (goles/escudo/trofeo), padding compacto.
- VersusCenter: VS con gradiente amarillo/naranja/azul y rayo SVG decorativo.
- HistoricalMatchupCard: home wins en verde, away wins en naranja.
- NextActionPanel: reemplazado por CommunityStatsPanel — muestra % de votos (local/empate/visitante) + goles esperados + link a /estadisticas.
- Layout: gaps reducidos para que todo entre en primera vista a 1280x900 sin scroll.
- Storage: eliminado el write de polla:activePredictionGroup / polla:activePredictionGroupIntent desde esta sección (predicciones cierran todas juntas 1 día antes).
- Build OK: 11 páginas generadas.

## Función
Mostrar el partido relevante según el fixture: próximo, en curso, terminado reciente, simultáneo u off day.

## Zonas implementadas
- section-shell
- background-energy-layer
- match-hero-header
- match-meta-strip
- featured-match-layout
- team-card-home (border verde izquierdo)
- versus-center (VS gradiente + rayo)
- historical-matchup-card (colores por ganador)
- team-card-away (border naranja derecho)
- match-reading-panel
- community-stats-panel (nuevo — reemplaza next-action-panel)

## Zonas retiradas
- match-context-panel (retirado en Fase 10)
- next-action-panel / prediction-deadline-notice (reemplazados por community-stats-panel)

## Sub-componentes Astro
```txt
06_proximo_partido/
├── ProximoPartidoSection.astro
├── ProximoPartidoSection.module.css
├── MatchHeroHeader.astro
├── MatchMetaStrip.astro
├── FeaturedMatchLayout.astro
├── TeamMatchCard.astro
├── VersusCenter.astro
├── HistoricalMatchupCard.astro
├── MatchReadingPanel.astro
├── NextActionPanel.astro          ← ahora es CommunityStatsPanel internamente
├── MatchContextPanel.astro        ← archivo existente, no en uso
├── PredictionDeadlineNotice.astro ← archivo existente, no en uso
├── proximo-partido.logic.ts
└── proximo-partido.client.js
```

## Data
- src/data/fixture.json — fuente de verdad para partidos.
- src/data/teams.json — confederación y metadata base de selecciones.
- src/data/match-preview.mock.json — contrato editable. Ahora incluye `communityStats: { homePercent, drawPercent, awayPercent, avgGoals }` por partido.

## Lógica
- `getRelevantMatches()` devuelve `upcoming`, `live`, `finished_recent`, `multi_live` u `off_day`.
- SSR entrega un fallback calculado desde fixture.
- El cliente recalcula con la hora real del navegador dentro de `[data-section="proximo-partido"]`.
- El cliente actualiza el CommunityStatsPanel con los datos del partido activo (nombres de equipos + porcentajes).
- Ya NO escribe storage: las predicciones cierran todas juntas antes del torneo.

## Assets pendientes
- public/assets/flags/* — banderas reales.
- public/assets/backgrounds/bg-06-proximo-partido-clean.webp — fondo estadio final.

## Notas
- El título visual es `PARTIDO DE LA FECHA`; el nombre técnico sigue siendo `06_proximo_partido`.
- Fase 2 wireframe: sin resultados oficiales, clima real, backend ni arte final.
- CommunityStats son mock hasta que haya backend real.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- PredictionDeadlineNotice: glifo `INFO` -> `01-stopwatch-countdown-gold-blue`.
- VersusCenter: rayo SVG -> `asset-ball-energy-swoosh` (energia decorativa centrada tras el VS, holder `.vs-block`).
