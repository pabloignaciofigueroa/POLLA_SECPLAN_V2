# 07_fixture — Mapa técnico

## Estado
wireframe-implemented

## DISEÑO HARD — LLAVE arcade (2026-06-28)

Rediseño **solo visual** de la LLAVE a pantalla de torneo arcade (videojuego deportivo). NO toca
lógica, topología, `winnerTo`, `bracketSlot`, datos ni hooks; `/predicciones` y `/podio` intactos.

- **Stage** (`FixtureSection.astro` + `.module.css`): clase `fixtureArcadeStage` con atmósfera 100% CSS
  — `arcadeAtmosphere` > `stadiumGlow` (reflectores), `speedLines` (energía lateral enmascarada),
  `confettiLayer` (~18 puntos en bordes/arriba, centro despejado), `fieldGlow` (piso cian/verde).
  Fondo = gradiente luminoso (sin negro dominante, sin imagen-screenshot). Tokens locales `--llave-*`.
  Franja `bottomHud` inferior (microcopy "Vive la pasión · SECPLAN 2026 · Tu pronóstico hace historia").
- **Round labels** (`BracketTree.astro`): tabs **HUD hexagonales** (`clip-path`), azul neón; R32 dorada.
- **Centro ceremonial**: halo grande tras la copa (`ko-trophy-stage::before`), copa con `ko-trophy-pulse`
  (leve, off en reduced-motion), placa **GRAN FINAL** dorada 3D, **¡CAMPEÓN!** (degradé oro grande),
  placa **TERCER PUESTO** morada.
- **Conectores**: cian neón con `drop-shadow` glow; camino del campeón dorado (`ko-conn--win`),
  perdedor morado punteado (`ko-conn--lose`). NO cambia el algoritmo de medición (solo color/clase CSS).
- **Cards cromo/sticker** (`BracketMatchCard.astro`, scoped a `[data-ko-variant="node"]` — captura intacta):
  sombra dura `0 5-7px 0` + glow + `::before` sheen + hover físico. **Números de slot 1-16** por lado
  (prop `seedNum`: home=seedNum+1, away=seedNum+2; chip neón; grid R32 `auto auto 1fr`).
- **fit()** (`bracket-tree.client.js`): reserva el alto de `[data-bottom-hud]` en `availH` para que el
  bracket completo quepa sin tapar el HUD (sigue HEIGHT-bound; márgenes laterales ~0 en desktop).
- Hooks preservados: `data-ko-match/flag/name/score/advance/status-pill/locknote`, `data-knockout-readonly`,
  `data-ko-node/side/winnerto/loserto`, `.ko-row[data-slot]`, `data-concrete`. Estado-cero R16+ intacto.

## Rediseño LLAVE — árbol espejo (2026-06-27)
`/fixture` ahora renderiza un **bracket espejo** (R32 izq + R32 der → Final central + 3er puesto)
en desktop, que **colapsa a columnas** en móvil (<1080px).
- `lib/knockout/bracketTree.js` (`buildBracketTree`) deriva la topología LEFT/CENTER/RIGHT
  SOLO desde `winnerTo` (post-orden por `bracketSlot`). Test: `tests/bracket-tree.test.mjs`.
- `BracketTree.astro` arma el layout (flex anidado) + capa SVG de conectores; `bracket-tree.client.js`
  mide los nodos (offsetLeft/Top), dibuja los elbows y **ajusta el árbol al ancho** (transform scale).
- Los nodos son `BracketMatchCard variant="node"` (compacto, solo lectura) — **conserva todos los
  hooks** (`data-ko-match/flag/name/score/advance/status-pill`), así `fixture.bracket.client.js`
  sigue hidratando equipos/ganadores/desbloqueo sin cambios.
- Centro: Final (P104) con trofeo `assets/copa/trophy-worldcup-main.webp` + glow dorado; 3er puesto (P103).
- Estado-cero respetado: R16+ como "Ganador P##"; nunca se pre-hornean ganadores.

## Consenso en la lista - 2026-06-09 (coral removido 2026-06-13)

- La lista de partidos muestra el nivel de CONSENSO (Unánime/Consenso fuerte/
  Dividido) por fila, desde `lib/statistics/communityStatistics.js`
  (`communityPulseByMatch` en `fixture.client.js`).
- La card "Pronóstico coral" (`CommunityMatchPulse`) del panel seleccionado se
  ELIMINÓ el 2026-06-13 (concepto coral retirado de toda la app). El consenso de
  la lista se mantiene; el `favoriteScore` sigue en la librería sin mostrarse.

## Fase 10 - Simplificacion arcade
Fixture reducido a hero, 3 KPIs, filtros, lista, partido seleccionado y horario Chile. Se retiraron agenda duplicada, info tecnica y notificaciones.

## Ajuste referencia arcade - fixture
La seccion recupera densidad util para parecerse a la referencia sin volver a dashboard pesado. Hero, banda KPI y filtros se compactan en vertical; la lista izquierda elimina `VER CALENDARIO COMPLETO` y muestra mas partidos visibles; el panel derecho vuelve a integrar `DayAgendaPanel` y `MatchInfoPanel` en formato liviano junto al partido seleccionado. `NotificationCTA` no vuelve en esta iteracion.

## Reparacion compactacion vertical
Se corrigen barreras CSS que rompian el first view: la banda KPI permanece horizontal en desktop/tablet, los escudos inyectados por `fixture.client.js` quedan contenidos por reglas locales globales, la agenda pasa a filas compactas de 3 columnas, y la foto de estadio se limita a thumbnail cuadrado 1:1 pequeno para no empujar la pagina hacia abajo.

## Ruta
/fixture

## Función
Centro consultivo del Mundial 2026 dentro de la Polla. Permite ver,
filtrar, seleccionar y entender los partidos de fase de grupos usando
datos reales del fixture (72 partidos · 12 grupos · 16 sedes), sin
mezclarse con la UI de Predicciones.

## Componente principal
FixtureSection.astro

## CSS local
FixtureSection.module.css

## Subcomponentes Astro
- FixtureHero.astro — eyebrow + título FIXTURE + subtítulo horario Chile.
- FixtureSummaryCards.astro — grid 4 cards (total / hoy / jornada / sedes).
- FixtureFilters.astro — stage tabs + group select.
- FixtureListPanel.astro — wrapper con DayGroups + empty state + CTA placeholder.
- FixtureDayGroup.astro — header de fecha + lista de filas.
- FixtureMatchRow.astro — fila clickeable con status badge.
- SelectedMatchPanel.astro — wrapper derecho (hero + bottom grid).
- SelectedMatchHero.astro — versus local/VS/visita + meta-grid del seleccionado.
- DayAgendaPanel.astro — mini agenda del día (hasta 6 partidos).
- MatchInfoPanel.astro — árbitro/asistentes/clima/aforo/transmisión + stadium-preview placeholder.
- TimezoneNotice.astro — aviso GMT-4.

## Lógica
- fixture.logic.ts
  - getRelevantMatches (réplica local de proximo-partido.logic.ts)
  - getMatchStatusVisual (live/finished/today/upcoming)
  - getTodayMatches / isSameChileDay (zona horaria America/Santiago)
  - groupMatchesByDate
  - filterByGroup / filterByStage
  - getCurrentRound (1 / 2 / 3)
  - uniqueLocationCount
  - getStageLabel / getStatusLabel
  - formatChileDateLong / formatChileDateHeader / formatChileTime
- fixture.client.js — hidratación scoped [data-section="fixture"]:
  filtros stage + group, selección de fila, repintado de SelectedMatchPanel,
  scroll suave al panel (respeta prefers-reduced-motion).

## Data
- src/data/fixture.json — 72 partidos fase de grupos (consumido).
- src/data/groups.json — labels A–L para group select.
- src/data/match-info.mock.json — defaultInfo + overrides 4 partidos
  (referee/assistants/weather/capacity/broadcast/stadium).

## Comportamiento
- Tabs de etapa: Hoy / Todos / Fase de grupos (activos) · Octavos /
  Cuartos / Semis / Final (placeholder, dashed; al activarlos muestran
  empty state hasta cerrar fase de grupos).
- Selector de grupo: "Todos los grupos" + A–L.
- Click en fila → SelectedMatchPanel se actualiza + scroll al panel.
- Selección inicial: getRelevantMatches() — primaryMatch con fallback a matches[0].
- LocalStorage: no escribe nada (sección consultiva).
- CTAs "Ver calendario completo", "Ver agenda completa", "Activar
  notificaciones": placeholders deshabilitados (Fase 2).

## Assets pendientes
- public/assets/flags/ (banderas reales — Fase 4)
- public/assets/backgrounds/07_fixture_background.png (Fase 3, opcional)
- mapa/estadio real (Fase 4)

## Restricciones
- No usar CSS global.
- No usar imagen como fondo total.
- No mezclar con Predicciones.
- Navbar activo: Fixture.
- JS scoped con [data-section="fixture"].
- Sin !important.

## Checklist
- [x] ruta /fixture renderiza solo esta sección
- [x] responsive base (1080 + 720 breakpoints)
- [x] prefers-reduced-motion respetado en scroll y transiciones
- [x] .map.md actualizado
- [x] sin clases globales de componente
- [x] data derivada de JSON (no hardcodeada)
- [x] 16 sedes calculadas dinámicamente

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- DayAgendaPanel: chip `DIA` -> `icon-circle-calendar-blue`.
- Filas/flags/escudos reales (render dinamico) NO se tocan; lista sigue de fixture.json.

## Fase 3 (DEFINICION SIMULTANEA) - F13 simulacion integral (2026-06-23)

La tabla de grupo de `/fixture` usa el mismo motor de standings/desempate 2026 que el resto
(`calculateGroupStandings` -> `rankGroupRows`). `scripts/simulate-group-definition.mjs`
(`npm run sim:group`) verifica que el orden cronologico de partidos (`buildMatchSequence`:
`dateUtc -> matchNumber -> matchId`) y los standings son ESTABLES ante distinto orden de llegada
de resultados (borde "dos goles casi simultaneos"). Los dos finales de 3a fecha del grupo se
derivan de `getGroupFinalMatches` (los 2 de mayor `dateUtc`). No toca produccion ni Supabase.
