# 09_estadisticas — Mapa técnico

## Estado
dashboard-coral-implemented + data-arena-cards + data-arena-base-13

## Pulso live con tri-estado - 2026-06-12

- `renderResultPulse` (explorador de partidos) usa
  `lib/liveMatch/liveMatchPhase.js`: un partido preparado por Admin (pending)
  ya no se muestra como "En vivo 0-0"; el pulso live solo aparece en fase
  `live` (la hora viene de `pulse.dateChile`). Los finales oficiales no cambian.

## Base Data Arena 13 jugadores - 2026-06-12

- Corte canonico de 13 jugadores: `src/data/stat-cards/data-arena-13.json`
  (players, playerStats, rankings, matches, classificationConsensus,
  pairwiseInteractions, globalHighlights), generado externamente y consumido
  YA RESUELTO — los componentes no recalculan nada.
- Las 13 fichas `players/card_jugable_jugador_*.json` incluyen a Felipe (03) e
  Italo (13); el rerank en memoria normaliza todos los ranks visibles a `de 13`.
- Accessor: `src/lib/statistics/dataArenaBase.ts` expone `getArenaHighlights()`
  (6 tops: lone wolf, consenso, anti-oficina, over, under, rebeldes),
  `getArenaDuels()` (mostSimilar + biggestRivalries) y `getArenaUniverseSize()`,
  resolviendo identidad/avatar desde `players.json`.
- Piezas nuevas: `ArenaHighlightsPanel.astro` (mini-leaderboards top 3 con lider
  destacado) y `ArenaDuelsPanel.astro` (gemelos de pronostico + rivalidades, top 3
  con score 0-100). Montadas dentro de `.data-arena` despues del `CardDeck`,
  heredan el gate `data-unlock-reveal`. SSR estatico, sin client JS nuevo.
- Counters vigentes: 13 jugadores, 72 partidos y 936 predicciones (dinamicos
  desde `predictions.json`); HTML construido = 14 flip-cards (13 mazo + 1 del dia).

## Universo Data Arena de 11 jugadores - 2026-06-10 (superseded 2026-06-12)

- El registry carga 11 fichas, incluyendo Isaias y Jaime, ordenadas por numero
  oficial y con avatar resuelto desde `players.json`.
- `statCardsRerank.ts` clona las fichas y normaliza en memoria `rank`, `of` y
  el texto `#R de 11` usando los valores reales de `summaryStats`.
- El helper respeta rankings ascendentes/descendentes y empates; falla ante
  metricas incompletas o una direccion editorial ambigua.
- Los JSON fuente, sus valores, textos, rarezas, arquetipos y badges no se
  reescriben. Los componentes siguen consumiendo el mismo contrato.
- Counters vigentes: 11 jugadores, 72 partidos y 792 predicciones.

## Data Arena de cartas jugables - 2026-06-10

- Al desbloquear (mismo gate `isStatisticsUnlocked`), antes del dashboard tabular
  se monta una **capa Data Arena** de cartas jugables; el dashboard de 4 tabs
  queda como "Explorador detallado" debajo (no se elimina).
- Cartas = contrato editorial YA RESUELTO en `src/data/stat-cards/players/*.json`,
  cargado por `src/lib/statistics/statCards.ts` (indexa por player.id, resuelve
  avatar real desde players.json, descarta `avatarSuggestedPath`).
- Piezas: `DataArenaHero.astro` (counters dinámicos N/72/N*72), `FeaturedCard.astro`
  (carta del día legendaria con rotación por fecha + pulso de oficina), `CardDeck.astro`
  (Mazo Jugadores), `PlayableStatCard.astro` (flip 3D `<button>`, reverso/frente,
  rareza→color). Flip por `data-arena.client.js` (toggle `aria-pressed`, teclado nativo).
- "Pulso de oficina" (partido caliente + marcador de oficina) se DERIVA de
  `buildCommunityAnalysis()` (matchPulses/exactScores) en el SSR; nada inventado.
- Reveal: los bloques `[data-unlock-reveal]` se muestran en `applySnapshot` cuando
  `state==="unlocked"`. Cartas renderizadas en SSR (sin innerHTML → CSS scoped aplica).
- Respeta `prefers-reduced-motion` (flip sin animación). JS scoped a la sección.

## Data Center coral - 2026-06-09

- El bloqueo visual se conserva hasta completar 72/72 predicciones locales o
  seleccionar un jugador con entrega canónica confirmada.
- Al desbloquear, se carga `/data/community-predictions.json` y se monta un
  dashboard con Mi perfil, Comunidad, Partidos, Clasificados y comparador.
- `src/lib/statistics/communityStatistics.js` calcula perfiles, consensos,
  afinidades, marcadores frecuentes, comparaciones y clasificados.
- Deep links: `?tab=partidos&match=match-004`,
  `?tab=clasificados&team=mexico` y `?tab=comparar&player=pancho`.
- Un jugador importado usa su carton canonico. Un jugador nuevo con carton local
  completo se incorpora temporalmente solo en su navegador.
- La misma regla desbloquea Próximo Partido, Fixture y Equipos desde cualquier
  dispositivo.
- Marcador vivo y resultados oficiales reutilizan el pipeline Supabase y la
  regla de puntaje 5/3/1/0.

## Fase 10 - Simplificacion arcade
Pantalla bloqueada reducida a hero/progreso/CTA y 3 beneficios. Se retiraron previews bloqueadas y aviso anti-copia.

## Iteracion arcade por referencia - Data Center bloqueado
Se recupera la espectacularidad de data center bloqueado sin implementar estadisticas reales nuevas. Vuelven `LockOrbVisual`, `LockedPreviewPanel` y `AntiCopyNotice` como promesa visual liviana: candado central, progreso premium, beneficios en franja horizontal, previews bloqueadas y cierre anti-copia.

La seccion sigue en estado locked en SSR y el client mantiene la hidratacion desde `polla:predictions`. Las previews son placeholders bloqueados, no dashboard real desbloqueado.

## Ruta
/estadisticas

## Función
Data Center bloqueado: promesa visual de inteligencia colectiva.
Renderiza siempre en estado locked en SSR; client hidrata con el
progreso real del jugador (lectura de `polla:predictions`) y, si
completedPredictions === 72, muestra banner "ESTADÍSTICAS DESBLOQUEADAS"
y cambia el CTA. El dashboard real con datos agregados queda para Fase 5.

## Componente principal
EstadisticasSection.astro

## CSS local
EstadisticasSection.module.css

## Subcomponentes Astro
- StatsHeroLocked.astro — hero 3-col (copy + lockOrb + progressCard).
- LockOrbVisual.astro — SVG inline arcade (candado central + anillos radar luminosos).
- StatsProgressCard.astro — TU PROGRESO + N/72 + barra + helper + CTA primario.
- UnlockBenefitsPanel.astro — franja horizontal "DESBLOQUEA ESTADISTICAS PODEROSAS" + 3 UnlockBenefitCard.
- UnlockBenefitCard.astro — item premium con icono grande + titulo + descripcion (Comparar / Ranking / Tendencias).
- LockedPreviewPanel.astro — "VISTA PREVIA: LO QUE PODRAS VER" + 3 LockedPreviewCard.
- LockedPreviewCard.astro — variants: comparison / ranking / trends con placeholders bloqueados y mini-chart.
- AntiCopyNotice.astro — barra inferior liviana con texto anti-copia.
- UnlockedBanner.astro — banner oculto por defecto; client lo muestra si state === "unlocked".

## Lógica
- estadisticas.logic.ts
  - StatsState type (locked | unlocked)
  - ProgressSnapshot interface
  - TOTAL_PREDICTIONS = 72
  - calculateProgress(store, playerId, total) — puro, sin side effects.
- estadisticas.client.js — hidratación scoped [data-section="estadisticas"]:
  - lee `polla:selectedPlayerId` + `polla:predictions` con try/catch
  - calcula snapshot y actualiza progressCompleted / total / percent / barra / state / CTA / helper / banner
  - CTA: guarda `polla:activePredictionGroup = "A"` y `polla:activePredictionGroupIntent = "A"` antes de navegar a `/predicciones`

## Data
- src/data/fixture.json no se consume (la base es 72 fijo desde TOTAL_PREDICTIONS).
- localStorage (sólo lectura):
  - polla:selectedPlayerId
  - polla:predictions (shape `{ [playerId]: { [matchId]: { status: "empty"|"partial"|"complete" } } }`)
- localStorage (única escritura): polla:activePredictionGroup (al usar el CTA, coherente con 06_proximo_partido).
- sessionStorage (única escritura): polla:activePredictionGroupIntent para navegación dirigida sin reflow en entradas desde navbar.

## Comportamiento
- SSR siempre renderiza locked 0/72.
- Client hidrata:
  - Sin jugador → mantiene 0/72.
  - Jugador con N<72 → N/72, percent, barra a percent%, CTA "IR A PREDICCIONES".
  - Jugador con N===72 → unlocked, banner visible, CTA "VER ESTADÍSTICAS COMPLETAS".
- Click CTA → guarda activePredictionGroup + activePredictionGroupIntent y navega con href real a "/predicciones".

## Assets pendientes
- public/assets/backgrounds/09_estadisticas_background.png (Fase 3, opcional)
- LockOrb final (PNG/WebP arcade luminoso) en Fase 4 — actualmente SVG inline blueprint.
- Dashboard unlocked real (charts agregados) en Fase 5.

## Restricciones
- No usar CSS global.
- No usar imagen como fondo total.
- 72 predicciones (no 64) — fase de grupos del Mundial 2026.
- Navbar activo: Estadísticas.
- JS scoped con [data-section="estadisticas"].
- Sin `!important`.
- Sin librerías (charts y orb son SVG/CSS inline).
- Texto editorial respeta la comanda (DATA CENTER BLOQUEADO, antifraude, etc.).

## Checklist
- [x] ruta /estadisticas renderiza solo esta sección
- [x] LockOrbVisual es componente separado (SVG inline)
- [x] ProgressCard lee desde localStorage en client
- [x] CTA navega a /predicciones con activePredictionGroup + activePredictionGroupIntent
- [x] LockedPreviewPanel muestra placeholders explícitos (--%, --- pts, barras dashed)
- [x] Banner unlocked oculto por defecto, visible cuando state="unlocked"
- [x] CSS local + style scoped en subcomponentes
- [x] responsive base (1080 + 720 + 600 breakpoints)
- [x] prefers-reduced-motion respetado en transición de barra
- [x] .map.md actualizado

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- LockOrbVisual: orbe SVG -> `15-lock-data-center-purple` (hero central bloqueado, holder 1:1, no tapa copy/progreso).
- UnlockBenefitCard: iconos SVG -> `07-icon-card-players-blue` / `icon-circle-ranking-podium-blue` / `icon-circle-trend-up-green`; chips a tinte claro.
