# 06_proximo_partido — Mapa técnico

## Estado
wireframe-implemented

## F10 - Barra personal fija en vivo (2026-06-23, SOLO mobile, SOLO LECTURA)

Pieza nueva `LivePersonalCard.astro`: una barra FIJA al fondo del viewport que aparece
SOLO en mobile (<=720px) y SOLO cuando hay un grupo EN DEFINICION (mismo gate que el Centro
de F6). Es la version "siempre a la vista en el celular" de la tarjeta "Tu impacto" de F6:
muestra TU proyectado + "N oficiales + M en juego" mientras scrolleas, sin buscar tu fila.

- Markup SSR estatico (contenedor `[data-live-personal-card]`, `data-active="false"` por
  defecto -> oculto, cero regresion). El client solo setea `textContent`/`data-*` sobre nodos
  ya renderizados (no inyecta DOM por innerHTML), asi que el CSS scoped de Astro aplica
  (no hace falta `<style is:global>` aqui).
- Capa 1 (colapsada): "TU PUNTAJE EN VIVO" + proyectado protagonista (`[data-lpc-projected]`)
  + subtexto "N oficiales + M en juego" (`[data-lpc-subtext]`, gris si delta 0) + sello
  EN VIVO (rojo, pulso) si hay un final del grupo activo en vivo. La barra ES el control.
- Capa 2 (un toque, `[data-lpc-detail]`, cerrada por defecto): resumen por origen
  (Partidos +X de `me.match.projected` / Clasificacion +Y de `me.group.projected`) + matriz
  corta de 4 variables (Final 1 / Final 2 / 1o / 2o) leida de `me.lines` igual que F6, +
  link "ver cronologia" que scrollea al feed F8 si esta activo.
- Estados: sin `polla:selectedPlayerId` valido -> CTA "Elige tu jugador" (`[data-lpc-cta]`)
  -> /jugador. Sin vivo -> oculta. Bono de grupo bloqueado: heredado del gate de la fundacion
  (aporta 0 al ledger); el desglose nunca pinta 1o/2o provisional de grupos bloqueados.

Wiring (MISMO dueno del dataset, sin canal nuevo):
- `proximo-partido.client.js` alimenta la barra desde el UNICO `subscribeLiveData` ya
  existente (F6/F8). En `recomputeCenter` se llama `updateLivePersonalCard(...)` en TODOS los
  caminos: sin `activeGroupId` -> `{hasLive:false}` (oculta); con grupo en definicion ->
  `{hasLive:true, me, pid, sit, effByMatch, finals}` con `me = ledger.byPlayer[pid]`. CERO
  formula de puntaje en la UI (solo mapea `regla`/origen -> etiqueta/color, como F6). Releer
  `polla:selectedPlayerId` en cada recompute.
- No tapar contenido: `.proximoPartidoSection[data-lpc-active="true"] .contentShell` reserva
  `padding-bottom: calc(5.5rem + env(safe-area-inset-bottom))` en <=720px. La barra respeta
  `env(safe-area-inset-bottom)`. a11y: `aria-expanded` en el toggle, `aria-hidden` cuando
  inactiva, `aria-live="polite"` en el subtexto, `:focus-visible`. Animacion <300ms con
  `prefers-reduced-motion` -> sin desplazamiento/pulso.
- Extension a /tabla y /estadisticas: DIFERIDA (ver
  `comandas_F10_tarjeta_personal/22_pasoC_pulido_extension.md`, NOTA EJECUCION 2026-06-23):
  el desglose esta acoplado al grupo unico en definicion de F6 y /estadisticas no calcula
  `buildPointLedger.byPlayer` en su owner; no era reuso limpio sin regresion. El core
  (/proximo-partido) es obligatorio y queda hecho.

## F8 - Cronologia "Que cambio" (2026-06-23, SOLO LECTURA)

Feed cronologico que vive DENTRO del Centro de definicion (F6), DEBAJO de la tabla viva:
narra las DIFERENCIAS entre snapshots consecutivos (gol -> reordenamiento -> impacto por
jugador -> "sin cambios"), mas nuevo arriba. No es una vista de estado (eso es F6/F7/F9):
es la pelicula de los cambios. NO recalcula puntaje ni re-gatea: LEE lo que el recompute
ya produjo.

Pieza nueva:
- `WhatChangedFeed.astro`: shell SSR oculto por defecto (`data-active="false"`); cabecera +
  filtros Todos/Mi jugador (`[data-wcf-filter]`, `aria-pressed`) + lista (`[data-wcf-list]`,
  `aria-live="polite"`) + pildora de cola "N cambios nuevos" (`[data-wcf-queue]`). Los items
  se crean en runtime por innerHTML, asi que su CSS va en `<style is:global>` anclado a
  `[data-what-changed-feed]` (gotcha de scope). Montado dentro de `GroupDefinitionCenter`
  (`[data-gdc-feed]`), por lo que solo es visible cuando el centro esta activo (cero regresion).

Motor de diff (PURO, testeable con node):
- `src/lib/statistics/buildChangeEvents.js` + `deriveRanking`. Firma:
  `buildChangeEvents({ prev, curr, players, fixture, teamLabels, playerLabels, forPlayerId })`
  donde `prev`/`curr` = `{ effectiveByMatch:Map, situations:{gid->GroupSituation}, byPlayer, ranking }`.
  - GOAL: el marcador efectivo de un partido cambio (antes->ahora). Cualquier partido vivo.
  - REORDER: cambio de `first`/`second`/orden de standings en un grupo EN DEFINICION. Gate
    heredado: `situations` SOLO trae grupos con `definitionStarted` true (o `state==='final'`);
    los BLOQUEADOS no entran -> nunca eventos de 1o/2o de fechas 1-2.
  - IMPACT: por jugador, cambio de `projected` (descompuesto en `+N por marcador` /
    `+N por 1o/2o` leyendo `ledger.lines`, anulado=0) y/o de puesto de ranking, con signo.
  - NONE: el "0 se explica" (jugador estable). Opt-in via `forPlayerId` (filtro Mi jugador).
  - Orden dentro de un snapshot: goles -> reordenamientos -> impactos -> none. Entre snapshots,
    orden de LLEGADA. NO se usa el `ts` del libro (best-effort).
  - CERO formula nueva: toda cifra sale de `resolveEffectiveResults` / `computeGroupSituation`
    / `buildPointLedger().byPlayer` que el recompute ya calculo.

Wiring (mismo dueno del dataset):
- `proximo-partido.client.js` reusa el UNICO `subscribeLiveData(recompute)` de F6 (NO abre un
  segundo canal). En `recomputeCenter`: `buildChangeSnapshot` arma el snapshot derivado,
  `updateFeed` corre `buildChangeEvents(prev, curr)`, mantiene `prevChangeSnapshot`, acumula
  los eventos (cap 200, mas nuevo arriba), filtra Todos/Mi jugador, lleva la cola de no leidos.
- Anti-saturacion: los impactos de un MISMO lote (snapshot) cuando son >=4 se colapsan en un
  resumen "N jugadores afectados" expandible (`[data-wcf-more]` / `[data-wcf-sublist]`).
- Animacion de entrada del item: fade/slide <300ms (transform/opacity), `prefers-reduced-motion`
  -> sin desplazamiento. Timer de limpieza unico (no acumula).
- Cero regresion: sin grupo en definicion el centro (y el feed) queda oculto; el diff avanza
  igual sin mostrar nada -> /proximo-partido identico a hoy.
- NO usa la tabla persistida `polla_match_event` (fuera de alcance): cronologia por diff en cliente.

Tests: `tests/change-events.test.mjs` (gol entre snapshots, reorder solo en definicion, grupo
bloqueado sin 1o/2o, impacto descompuesto con signo, "sin cambios", orden deterministico,
deriveRanking).

## F6 - Centro de definicion de grupo (2026-06-22, SOLO LECTURA)

Capa nueva que aparece en /proximo-partido SOLO cuando un grupo entra a su ventana final
(>=1 de sus DOS finales de 3a fecha EN VIVO). En modo normal NO se ve (cero regresion).
Piezas nuevas (SSR esqueleto + el client las rellena por data-attributes):

- `GroupDefinitionCenter.astro`: shell oculto por defecto (`data-active="false"`), 4 slots
  (`data-gdc-header/boards/standings/impact`). El client lo activa.
- `LiveMatchMini.astro` (x2): los dos finales del grupo; marcador + estado por `data-phase`
  (EN VIVO rojo / OFICIAL morado / POR INICIAR gris).
- `LiveGroupStandings.astro`: tabla viva (4 filas) con 1o/2o (insignia) + chip
  `provisional`; NUNCA "oficial" mientras esta en vivo.
- `YourImpactCard.astro`: Capa 1 (cifra proyectada protagonista + delta `+N EN VIVO`) y
  Capa 2 plegable (matriz de 4 variables Final 1 / Final 2 / 1o / 2o), cerrada por defecto.

Las 3 capas: Capa 1 (un vistazo) visible en definicion; Capa 2 (un toque) detras del boton
"Ver como lo sumo"; Capa 3 (los 13 jugadores) es F7, no va aqui.

Gatillo (regla clave): el bono de grupo (1o +1 / 2o +3) esta BLOQUEADO hasta que >=1 final
de 3a fecha esta live/oficial; entonces el grupo (y solo ese) pasa a EN DEFINICION
(provisional). Fuente unica de la fundacion: `isGroupDefinitionStarted` en
`lib/fixture/groupState.js`. El client reusa el UNICO `subscribeLiveData` y todo el calculo
sale de las libs F0-F5 (`resolveActiveWindow`, `computeGroupSituation`, `buildPointLedger`):
CERO formula de puntaje en la UI (solo mapea `regla` -> etiqueta/color). Payload SSR
ampliado con `groups`/`players`/`predictions`/`qualifiedPredictions`. Detalle de testeo y
casos (BLOQUEADO vs EN DEFINICION) en `comandas_F6_centro_definicion_modif/12_testeo_simulacion.md`;
test del gatillo en `tests/group-definition-started.test.mjs`.

## Pulso coral - REMOVIDO 2026-06-13

- El `CommunityMatchPulse` ("Pronóstico coral") que incorporaba el partido
  relevante se ELIMINÓ (concepto coral retirado de toda la app). Se borró el
  mount, `renderCommunityPulse` y el payload `communityPulses` de la sección.
  `communityStatistics.js`/JSON intactos.

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
