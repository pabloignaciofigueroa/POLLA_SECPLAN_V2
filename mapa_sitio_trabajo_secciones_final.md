# Mapa operativo de arquitectura del sitio - Polla Mundialera SECPLAN 2026

Fecha de actualizacion: 2026-06-23
Estado del documento: mapa vivo principal del proyecto
Stack: Astro estatico, CSS Modules, JS cliente por seccion, JSON versionado y Supabase Realtime

Este archivo sirve para ubicar rapido donde cambiar cada cosa. Los `*.map.md`
dentro de cada seccion quedan como mapas secundarios mas especificos. Las
jornadas grandes de cambios quedan registradas en `workflow_*.md`. Ultimas (ambas en el
commit `44846b1`, en `main`, SIN push):

- `workflow_2026-06-22_desempate_grupos_fifa_2026.md` = desempate de grupos al criterio
  FIFA 2026 (head-to-head primero); fuente unica `compareRows`/`rankGroupRows`.
- `workflow_2026-06-22_definicion_simultanea.md` = fundacion F0-F5 de DEFINICION
  SIMULTANEA (logica pura + seam + migraciones). El plan de lo que falta (consumidores
  Stage 1/2 + UI F6-F13) esta en `workflow_2026-06-23_definicion_simultanea_continuacion.md`.
- Anterior: `workflow_2026-06-13_grafico_carrera_de_puntaje.md`.

Estado de commits (2026-06-22): fundacion F0-F5 + desempate 2026 = commiteados en
`44846b1` (sin push). PENDIENTE de aplicar en remoto: migraciones
`polla_live_match_multi` + `group_closure` (ventana SIN partido vivo; ver
`supabase/remote/apply_*.sql`). El multi-write sigue bloqueado por
`MULTI_LIVE_WRITE_ENABLED=false` hasta migrar consumidores.

## Indice rapido: quiero cambiar X

| Cambio buscado | Ir a |
| --- | --- |
| Navbar desktop/mobile, orden de links, candado Admin | `src/components/layout/Header.astro`, `MobileMenu.astro` |
| Modal de acceso Admin, clave, duracion de sesion | `src/components/layout/AdminAccessModal.astro`, `admin-access.client.js` |
| Layout comun, fuentes, fondo precargado, scripts globales | `src/layouts/BaseLayout.astro` |
| Tokens, colores, radios, sombras, tipografias | `src/styles/tokens.css`, `fonts.css`, `reset.css`, `accessibility.css`, `animations.css` |
| Portada, copa, hero, CTA JUGAR, banderas marquee | `src/sections/01_inicio/` |
| Reglas y puntajes | `src/sections/02_reglas/` |
| Seleccion de jugador y reset local | `src/sections/03_jugador/` |
| Predicciones, marcadores, tabla de clasificados, descarga JSON | `src/sections/04_predicciones/` |
| Ranking / tabla de posiciones | `src/sections/05_tabla/` y `src/lib/tabla/` |
| Proximo partido destacado | `src/sections/06_proximo_partido/` |
| Fixture completo, filtros y detalle de partido | `src/sections/07_fixture/` |
| Album de equipos, favoritos, modal de equipo | `src/sections/08_equipos/` |
| Estadisticas corales, comparador y consenso | `src/sections/09_estadisticas/`, `src/lib/statistics/` |
| Dashboard Admin, gate y marcador global | `src/sections/10_admin/` |
| Mini marcador en vivo del Admin, contrato y guardado | `src/sections/10_admin/MiniLiveScoreControl.astro`, `src/lib/liveMatch/liveMatchState.js` |
| Pipeline marcador vivo -> tabla, recompute provisional, banner | `src/sections/05_tabla/tabla.client.js`, `src/lib/liveMatch/liveMatchState.js`, `src/lib/liveMatch/liveMatchPhase.js` |
| DEFINICION SIMULTANEA: ventana activa 1..N, motor de grupo, libro contable, bonos (logica pura) | `src/lib/liveMatch/activeWindow.js`, `src/lib/fixture/{groupStandings,groupTiebreakers,groupState}.js`, `src/lib/scoring/{buildPointLedger,groupBonuses}.js` |
| Cierre/reapertura de grupo + marcador vivo multi-fila (Supabase) | `supabase/migrations/20260622120000_polla_live_match_multi.sql`, `supabase/migrations/20260622120100_group_closure.sql`, `supabase/remote/apply_*`, `src/lib/liveMatch/liveMatchState.js` |
| Data editable de jugadores/equipos/fixture/resultados | `src/data/` |
| Reset/version de storage local | `src/lib/storage/resetPollaState.js` |
| Identidad compartida de jugador | `src/lib/playerIdentity.js` |
| Acceso oficial y borradores de correccion | `src/lib/predictions/` |
| Codigos temporales para cartones oficiales | `src/sections/10_admin/PredictionsLoadedPanel.astro`, `supabase/migrations/20260609193000_prediction_edit_access.sql` |
| Assets publicos: fondos, copa, banderas, escudos, jugadores | `public/assets/` |

## Arquitectura general

- Proyecto Astro estatico. Las rutas viven en `src/pages/`.
- Cada pagina importa `BaseLayout.astro` y monta una seccion principal.
- `BaseLayout.astro` importa estilos globales mudos, renderiza `Header`, `main`, `Footer` y carga `scripts/motion.js`.
- La capa global de navegacion esta en `components/layout/`: `Header`, `MobileMenu`, `Footer`, `AdminAccessModal`.
- Cada carpeta `sections/NN_nombre/` es soberana: orquestador Astro, CSS Module, subcomponentes, mapa local y client JS si aplica.
- Los scripts cliente se encapsulan con `document.querySelector('[data-section="..."]')` y no deben tocar otras secciones.
- CSS global solo define base/tokens/accesibilidad/animaciones. El estilo real de vistas vive en CSS Module local o `<style>` scoped.
- `astro.config.mjs` usa `inlineStylesheets: "always"` y prefetch global con estrategia `hover`.

## Rutas y secciones

| Ruta | Seccion | Pagina | Orquestador | CSS principal | Client JS | Data principal | Storage | Funcion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `01_inicio` | `pages/index.astro` | `InicioSection.astro` | `InicioSection.module.css` | `scripts/moments/inicio.js` | `teams.json` | No | Portada, copa, CTA de entrada |
| `/reglas` | `02_reglas` | `pages/reglas.astro` | `ReglasSection.astro` | `ReglasSection.module.css` | No | Arrays locales | No | Explica reglas y puntajes |
| `/jugador` | `03_jugador` | `pages/jugador.astro` | `JugadorSection.astro` | `JugadorSection.module.css` | Inline en seccion | `players.json` | Identidad, reset | Seleccion y confirmacion de jugador |
| `/predicciones` | `04_predicciones` | `pages/predicciones.astro` | `PrediccionesSection.astro` | `PrediccionesSection.module.css` | `predicciones.client.js` | `fixture.json`, `groups.json`, `players.json`, `predictions.json` | Predicciones, clasificados, descarga final, correccion temporal | Carton nuevo editable u oficial protegido |
| `/tabla` | `05_tabla` | `pages/tabla.astro` | `TablaSection.astro` | `TablaSection.module.css` | `tabla.client.js` | `players.json`, `fixture.json`, `results.mock.json`, `scoring-rules.json`, `table-predictions.mock.json` | Lee predicciones locales solo para UI | Ranking competitivo |
| `/proximo-partido` | `06_proximo_partido` | `pages/proximo-partido.astro` | `ProximoPartidoSection.astro` | `ProximoPartidoSection.module.css` | `proximo-partido.client.js` | `fixture.json`, `teams.json`, `match-preview.mock.json` | Intencion de grupo | Partido relevante |
| `/fixture` | `07_fixture` | `pages/fixture.astro` | `FixtureSection.astro` | `FixtureSection.module.css` | `fixture.client.js` | `fixture.json`, `groups.json`, `match-info.mock.json`, `stadiums-assets.json` | No | Calendario y detalle tecnico |
| `/equipos` | `08_equipos` | `pages/equipos.astro` | `EquiposSection.astro` | `EquiposSection.module.css` | `equipos.client.js` | `teams.json`, `equipos-info.json` | Favoritos | Album de selecciones |
| `/estadisticas` | `09_estadisticas` | `pages/estadisticas.astro` | `EstadisticasSection.astro` | `EstadisticasSection.module.css` | `estadisticas.client.js` | `predictions.json`, detalle publico, fixture, grupos, equipos, jugadores | Lee identidad/predicciones, escribe intencion | Data center coral bloqueado hasta 72/72 |
| `/admin` | `10_admin` | `pages/admin.astro` | `AdminSection.astro` | `AdminSection.module.css` | `admin.client.js` | `players.json`, `fixture.json`, `admin-dashboard.json/mock` | Sesion Admin temporal | Dashboard administrativo con gate |
| `/wireframe` | Tecnica | `pages/wireframe.astro` | Pagina directa | Inline/local | No | Metadata local | No | Vista tecnica heredada |

## Mapas compactos por subsistema

### `01_inicio`

- Orquestador: `InicioSection.astro`.
- Piezas principales: `HeroCopy`, `TrophyStage`, `PrimaryCTA`, `StepCards`, `FlagMarquee`, `TeamChip`.
- Copa: imagen WebP actual, entrada y flotacion idle suave. No sigue el mouse y no gira 360 al click.
- Glow superior: wrapper permite desborde vertical y recorta horizontal para evitar scroll lateral.
- JS de momento: `src/scripts/moments/inicio.js`, solo animaciones decorativas idle y soporte reduced motion.
- Cuando cambiar: hero/copy en `HeroCopy`, copa/glow en `TrophyStage`, CTA en `PrimaryCTA`, pasos en `StepCards`.

### `02_reglas`

- Orquestador: `ReglasSection.astro`.
- Piezas principales: `RulesHeroHeader`, `RulesCardsGrid`, `RuleCard`, `ScoringPanel`, `ScoringRow`, `RulesActionPanel`.
- Data: arrays locales dentro de la seccion, sin JSON global.
- Funcion: explicar reglas, puntajes exacto/tendencia/lone wolf y llevar al flujo de jugador/predicciones.
- Cuando cambiar: texto/reglas en el orquestador y componentes de reglas; visual grande en `ReglasSection.module.css`.

### `03_jugador`

- Orquestador: `JugadorSection.astro`.
- Piezas principales: `PlayerHeroPanel`, `PlayersGrid`, `PlayerCard`, `SelectedPlayerCard`, `PlayerSelectionCTA`, `PlayerResetAction`, `PlayerWarningNote`.
- Data: `players.json`.
- Storage: confirma identidad en localStorage y sessionStorage con `polla:selectedPlayerId`, `polla:playerConfirmed`, `polla:selectedPlayerSnapshot`.
- Reset: usa `resetPollaLocalState({ preserveIdentity: false })` y limpia llaves espejo de sessionStorage.
- Entrega oficial: abre `OfficialPlayerModal` y ofrece Estadisticas, Tabla y
  carton protegido sin depender del dispositivo original.
- Cuando cambiar: altas/bajas de jugadores en `players.json` y assets en `public/assets/players/`; UI de seleccion en componentes de la carpeta.

### `04_predicciones`

- Orquestador: `PrediccionesSection.astro`.
- Piezas principales: `PredictionHeroHeader`, `ProgressSummaryGrid`, `GroupTabs`, `MatchesPanel`, `MatchPredictionRow`, `ScoreInput`, `QualifiedPanel`, `SaveAndContinueCTA`, `PredictionBottomBar`.
- Regla madre: no existe prediccion oficial incompleta. Deben estar completos 72 partidos, 12 grupos y 24 clasificados automaticos.
- Client: `predicciones.client.js` guarda marcadores, recalcula tabla/clasificados, valida progreso, maneja tabs y dispara descarga final.
- Modulos: `predicciones.validation.js` valida completitud; `predicciones.export.js` arma payload, filename y descarga via `Blob`; `predicciones.standings.js` calcula posiciones y random ponderado.
- Salida oficial: archivo `predicciones_<jugador>_<YYYY-MM-DD_HH-mm>.json`.
- Post descarga: guarda `polla:finalDownloaded*`, guarda `polla:finalSubmissionPayload` y bloquea inputs/selects/random.
- Carton importado: reconstruye 72/24 desde `predictions.json`; queda en lectura
  hasta canjear una sesion valida. La correccion vive en storage separado.
- Cuando cambiar: validaciones en `predicciones.validation.js`, tabla/random en `predicciones.standings.js`, formato JSON en `predicciones.export.js`, experiencia de captura en `predicciones.client.js` y componentes.

### `05_tabla`

- Orquestador: `TablaSection.astro`.
- Piezas principales: `TablaHero`, `RankingTable`, `RankingRow`, `MovementIndicator`, `StreakDot`, `LiveMatchCard`, `NextMatchCard`, `LastUpdateCard`.
- Limpieza editorial (2026-06-12, comanda 02): se eliminaron el bloque Pretemporada (`PreseasonPulse`, componente borrado) y el banner "Tabla provisional"; la columna izquierda va Podio -> Ranking sin intermedios.
- Tipografia por rol (comanda 01): headers `--font-display` 700, nombres de jugadores `--font-ui` 700 (incluye los nombres del podio en `PodiumStrip`, mismo rol que el ranking), numeros (pos/pts/rend/predicciones/precision) `--font-score` 700 tabular-nums (Rajdhani activado: `fonts.css` ahora pone Rajdhani primero en `--font-score`), estados secundarios `--font-ui` 600.
- Racha (comanda 05): `streak` guarda el hitType de los ultimos 5 partidos oficiales y se pinta con `StreakDot` (morado +5 lone_wolf, azul +3 exact, verde +1 tendency, gris 0). `tabla.client.js` re-renderiza los dots en vivo (`renderStreakDots`, sin innerHTML). Mismo mapeo de color en el panel derecho y en Estadisticas/Partidos.
- Mobile (comanda 03): ranking = lista compacta de una linea por jugador (pos | jugador | pts | rend | racha), header unico en el thead, sin labels repetidos por fila.
- Data: resultados mock, reglas de puntaje y predicciones mock.
- Logica compartida: `src/lib/tabla/` calcula standings, movimientos, accuracy y partido relevante.
- Client: `tabla.client.js` hidrata estados visibles y no mezcla drafts locales como fuente oficial en el SSR.
- Marcador en vivo: `tabla.client.js` se suscribe a Supabase Realtime mediante `subscribeLiveData` del seam `lib/liveMatch/liveMatchState.js`. Cada cambio remoto recalcula standings/accuracy con oficiales + partido vivo, re-apunta las cards y revela el banner provisional. `localStorage` es solo cache/fallback.
- Tri-estado (2026-06-12): `lib/liveMatch/liveMatchPhase.js` resuelve official/live/pending como fuente unica. Solo `live` puntua y activa el banner; `pending` (partido preparado por Admin) se muestra EN ESPERA en hero card, NextMatchCard y panel derecho con 0 puntos, sin mover ranking. Un 0-0 preparado nunca puntua antes de la hora del fixture; goles > 0 son acto explicito del Admin. Admin escribe `status` "live"/"pending" en el payload (compat con filas viejas).
- Calculo (fuente unica): SSR y vivo usan `lib/liveMatch/liveScoring.js`. PUNTOS = ranking (Lone Wolf 5 / exacto compartido 3 / tendencia 1 / nada 0, no aditivo). PRECISION % = solo visual (exacto alcanzable vs imposible: con 5-2, 6-3 tiene mas % que 4-1); nunca afecta el orden. El panel "Predicciones de los jugadores" muestra Puntos y Precision en columnas separadas.
- Refresco arcade aditivo (2026-06-10): `PodiumStrip.astro` (top-3 con medalla/brecha, sincronizado por `renderPodium` en cada recompute), shimmer del lider, badge LONE WOLF (CSS sobre `data-hit-type`) y cruce de resaltado fila/prediccion/podio (`wireCrossHighlight`). Sin cambios en `lib/tabla/*` ni en el orden funcional.
- DEFINICION SIMULTANEA F7 (2026-06-23, ranking vivo explicable, SOLO LECTURA): `recompute(snapshot)` lee `liveMatches[]` (todos los vivos) via `resolveActiveWindow`/`resolveEffectiveResults`; el total PROYECTADO + delta `+N EN VIVO` + la formula expandible por jugador salen de `buildPointLedger` (el bono 1o/2o ya viene gateado por la fundacion F6 paso A; grupos bloqueados aportan 0). Filas ordenadas por `projected` (sin bono == orden de hoy); fila-detalle Nivel 2 en `<style is:global>` anclado a `[data-rank-detail]`; flechas = proyectado vs oficial. NO se toca `calculatePlayerStandings.ts` (SSR). Detalle en `tabla.map.md`.
- Cuando cambiar: formula de puntaje en `scoring-rules.json`/helpers de `lib/tabla`; filas/visual en componentes de `05_tabla`; pipeline en vivo en `tabla.client.js` + `lib/liveMatch/liveMatchState.js`; proyectado/delta/formula en vivo desde `buildPointLedger` (no reimplementar puntaje en la UI).

### `06_proximo_partido`

- Orquestador: `ProximoPartidoSection.astro`.
- Piezas principales: `MatchHeroHeader`, `FeaturedMatchLayout`, `TeamMatchCard`, `VersusCenter`, `MatchReadingPanel`, `MatchContextPanel`, `NextActionPanel`, `PredictionDeadlineNotice`.
- Data: `fixture.json`, `teams.json`, `match-preview.mock.json`.
- Client: recalcula estado temporal con hora real del navegador y puede enviar intencion de grupo hacia predicciones. Desde 2026-06-12 tambien se suscribe a `subscribeLiveData`: los partidos con resultado en `polla_official_results` quedan fuera del "proximo" y el destacado avanza apenas Admin oficializa (countdown con interval unico, sin acumulacion).
- DEFINICION SIMULTANEA F6 (2026-06-22): centro de definicion de grupo SOLO LECTURA (`GroupDefinitionCenter` + `LiveMatchMini` x2 + `LiveGroupStandings` + `YourImpactCard`) que aparece cuando un grupo tiene >=1 de sus DOS finales de 3a fecha EN VIVO; en modo normal queda oculto (cero regresion). Gatillo del bono de grupo = `isGroupDefinitionStarted` (fundacion, `lib/fixture/groupState.js`): BLOQUEADO hasta el primer final live/oficial, provisional en vivo, definitivo al cerrar. Reusa el UNICO `subscribeLiveData` y las libs F0-F5 (`resolveActiveWindow`/`computeGroupSituation`/`buildPointLedger`): cero formula de puntaje en la UI. Payload SSR ampliado con `groups`/`players`/`predictions`/`qualifiedPredictions`. Detalle en `proximo-partido.map.md`.
- Gotcha local: algunas banderas/escudos se inyectan con `innerHTML`; el estilo debe ir inline o en reglas globales acotadas.
- Cuando cambiar: partido destacado y lectura editorial en data/mock y logica de seccion.

### `07_fixture`

- Orquestador: `FixtureSection.astro`.
- Piezas principales: `FixtureHero`, `FixtureSummaryCards`, `FixtureFilters`, `FixtureListPanel`, `FixtureDayGroup`, `FixtureMatchRow`, `SelectedMatchPanel`, `SelectedMatchHero`, `MatchInfoPanel`, `GroupStandingsPanel`, `TimezoneNotice`. (`DayAgendaPanel` quedo legacy sin montar, comanda 08.)
- Data: `fixture.json`, `groups.json`, `match-info.mock.json`, assets de estadios.
- Resultados oficiales (2026-06-12, comanda 07): `fixture.client.js` se suscribe a `subscribeLiveData` y fusiona `polla_official_results` sobre el calendario en el cliente: la fila reemplaza "VS" por el marcador (`separator.score`, `data-finished`), el status oficial manda sobre la hora, el hero seleccionado muestra marcador + badge "Resultado final" (`data-result="official"`) y `MatchInfoPanel` agrega la fila "Resultado oficial". `fixture.json` sigue intacto; `fixture.logic.ts` (SSR) no toca Supabase.
- Tabla de grupo (comanda 08): `GroupStandingsPanel` reemplaza a la agenda. Calcula en memoria con `lib/fixture/groupStandings.js` (adaptador sobre `calculateGroupStandings` de predicciones: 3/1/0, criterio FIFA 2026 = PTS > head-to-head(pts,DG,GF) > DG total > GF total > fair play N/A > fallback) usando solo resultados oficiales. Header "Tabla Grupo X · N/6 finalizados", footer "Top 2 actual" o "Grupo aun sin resultados oficiales". Se recalcula al seleccionar partido y con cada snapshot remoto.
- Client: `fixture.client.js` controla filtros, seleccion de partido, paneles y la tabla de grupo.
- Storage: no escribe estado permanente.
- Cuando cambiar: calendario en `fixture.json`, info extendida en `match-info.mock.json`, visual/lista en componentes de `07_fixture`, tabla de grupo en `GroupStandingsPanel` + `lib/fixture/groupStandings.js`.

### `08_equipos`

- Orquestador: `EquiposSection.astro`.
- Piezas principales: `EquiposHero`, `TeamsSummaryStrip`, `GroupFilterChips`, `GroupSection`, `TeamCard`, `TeamDetailModal`, `TeamsAlbum`.
- Data: `teams.json`, `equipos-info.json`, manifests de portadas/confederaciones.
- Client: `equipos.client.js` maneja filtros, favoritos y modal con `dialog.showModal()`.
- Storage: `polla:favoriteTeams` como array JSON de ids.
- Cuando cambiar: datos base/imagenes en `teams.json` y assets; ficha editorial en `equipos-info.json`; modal/favoritos en client.

### `09_estadisticas`

- Orquestador: `EstadisticasSection.astro`.
- Piezas principales: `StatsHeroLocked`, `StatsProgressCard`, `StatsDashboard`, `LockedPreviewPanel`, `UnlockedBanner`, `MissingPlayerIdentityModal`, `StatsGraphTab` (+ `ScoreRaceGraph`/`ScoreRaceLegend`/`ScoreRaceNarrative`/`ScoreRacePopup`).
- Funcion: antes de 72/72 muestra la promesa anti-copia; despues monta el dashboard de pestañas (orden de tabs 2026-06-23: GRÁFICO, PARTIDOS, COMUNIDAD, MI PERFIL, COMPARAR, CLASIFICACIÓN; GRÁFICO activa por defecto). CLASIFICADOS (matriz de consenso) vive dentro de COMPARAR; el deep link viejo `?tab=clasificados` se aliasa a `comparar` en `activateTab`.
- Clasificacion de grupos (CLASIFICACIÓN, F9, 2026-06-23): pestaña `data-stats-tab="grupos"` / panel `data-stats-panel="grupos"` (deep link `?tab=grupos`). Vista POR JUGADOR de sus 12 grupos (A..L) con selector propio del panel: por grupo muestra el pick 1o/2o vs el equipo que va ahora, +1/+3/0 por linea y total, segun el ESTADO del grupo: BLOQUEADO (gris/candado, sin puntos ni 1o/2o provisional — estado por defecto de casi todos los grupos), EN DEFINICION (naranja, provisional, >=1 final de 3a fecha en vivo) o DEFINITIVO (verde, closure final, congelado). SOLO LECTURA y CERO formula nueva en la UI: los +1/+3/0 salen de `buildGroupBonuses.byGroup` (solo grupos en definicion/cerrados; los bloqueados se pintan desde el pick directo), el estado/1o-2o de `computeGroupSituation` y el gatillo de `isGroupDefinitionStarted` (heredado de la fundacion, NO se re-gatea). Mismo pipeline que /tabla: F1 `resolveActiveWindow` gatea fase y mapea `*TeamScore`→`*Score` (cuenta TODOS los marcadores en vivo a la vez). Reusa el UNICO `subscribeLiveData` de `estadisticas.client.js` (no abre un segundo); re-render por firma de oficiales+live+closures+jugador. CSS via `<style is:global>` anclado a `[data-stats-panel="grupos"]` (nodos innerHTML en runtime). Tests `tests/estadisticas-grupos-matrix.test.mjs`.
- Carrera de Puntaje (GRÁFICO, 2026-06-13): grafico de lineas de puntaje acumulado por jugador (nodos agrupados por `matchId+cumulativePoints` con badge de empate + pop-up, columna posicion actual, narrativa "Lo que paso en la oficina", timeline, leyenda). Datos = `buildScoreRaceTimeline`/`buildScoreRaceNarrative` (puros; reusan `liveScoring` y `liveMatchPhase`). `score-race.client.js` exporta `createScoreRace({section})` y NO se suscribe solo: `estadisticas.client.js` (dueño unico del dataset + `subscribeLiveData`) lo alimenta con `{dataset, liveSnapshot}` en la carga y en cada snapshot. Los resultados oficiales se SIEMBRAN de `src/data/official-results.json` (snapshot commiteado de `polla_official_results`, generado con `npm run results:snapshot`) y el snapshot en vivo se fusiona encima por `matchId` (el vivo gana / agrega partidos nuevos): el grafico dibuja la carrera al instante sin depender del handshake y nunca queda vacio (se elimino el estado "AÚN NO HAY CARRERA"). GSAP se importa lazy (chunk aparte) solo aqui y se omite con `prefers-reduced-motion`. Estilo en `<style is:global>` anclado a `[data-score-race]` (nodos pintados en runtime).
- Identidad requerida (comanda 06): sin `polla:selectedPlayerId` valido la seccion entra en estado `no-identity` (distinto de `locked`): no muestra 0/72 falso (la progress card dice "Jugador no seleccionado"), abre `MissingPlayerIdentityModal` (CTA "ELEGIR MI JUGADOR" -> `/jugador`, sin acceso a estadisticas generales) y guarda `polla:returnAfterPlayerSelect="/estadisticas"`; `/jugador` redirige de vuelta tras confirmar. Si el id guardado no existe en `players.json` (nomina cerrada), se limpia la identidad local.
- Partidos como auditoria (comanda 09): con resultado en `polla_official_results`, el listado izquierdo muestra "EQUIPO X-Y EQUIPO · Finalizado" en gris palido (`data-finished`), el detalle titula con el marcador + badge RESULTADO FINAL, el resumen reusa `renderResultPulse` y la tabla agrega columna SUMA con `score-dot` + puntos por jugador via `calculatePointsForPrediction` (universo completo del partido, orden por puntos desc) + leyenda compacta. Partidos sin oficializar conservan la vista de consenso sin puntos.
- Orden del listado PARTIDOS (2026-06-13): `renderMatches` ordena `visible` por hora de juego (`dateChile` cronologico, desempate `matchNumber`), NO por grupo — sigue el ritmo del fixture igual que `/fixture`. Los filtros GRUPO/LECTURA se mantienen.
- Client: carga `/data/community-predictions.json` solo al desbloquear, admite deep links y se suscribe al marcador/resultados Supabase.
- Logica coral compartida: `lib/statistics/communityStatistics.js`; contratos en `lib/statistics/types.ts`.
- Importacion: `npm run predictions:build` valida los JSON de la raiz y regenera la fuente canonica.
- Storage: lee `polla:selectedPlayerId`, `polla:predictions`; escribe `polla:activePredictionGroup` y `polla:activePredictionGroupIntent`.
- Concepto "coral" eliminado de la UI (2026-06-13): el "marcador/pronostico coral" (marcador favorito de la oficina como pronostico) se quito de TODAS las secciones: Estadisticas (linea "Marcador coral" del detalle, `favoriteScore` del listado, bloque "El marcador de la oficina" de COMUNIDAD), `CommunityMatchPulse` borrado (ya no se monta en Fixture ni Proximo Partido), y el bloque "Pronostico coral" del modal de Equipos. Se MANTIENE el dato `favoriteScore`/`favoriteScores` en `communityStatistics.js` (sin mostrarse) y el consenso (Unanime/Dividido + barras local/empate/visita). Los JSON/datasets no se tocaron.
- Data Arena (2026-06-12, corte 13): al desbloquear el orden de bloques es dashboard tabular ("Explorador detallado") arriba (lo más importante), luego `arena-universe` (Highlights + Duelos del universo) en el medio y la capa de cartas jugables (flip 3D) al fondo. La capa de cartas conserva `data-data-arena` (único en la sección) para el flip. Fichas resueltas en `data/stat-cards/players/*.json` (13, incluye Felipe e Italo) via `lib/statistics/statCards.ts`; `statCardsRerank.ts` normaliza en memoria los rankings visibles al universo de 13 sin reescribir los JSON editoriales. Base agregada canonica `data/stat-cards/data-arena-13.json` consumida ya resuelta por `lib/statistics/dataArenaBase.ts` (highlights globales + duelos). Carta del dia + pulso de oficina derivados de `buildCommunityAnalysis`. Piezas: `DataArenaHero`, `FeaturedCard`, `CardDeck`, `PlayableStatCard`, `ArenaHighlightsPanel`, `ArenaDuelsPanel`, `data-arena.client.js`.
- Cuando cambiar: metricas en `lib/statistics`; experiencia y filtros en `09_estadisticas`; ingesta en `scripts/predictions-importer.mjs`; cartas/mazos en los componentes Data Arena + `statCards.ts`.

### `10_admin`

- Orquestador: `AdminSection.astro`.
- Piezas principales: `AdminHeroHeader`, `MiniLiveScoreControl`, `AdminSidebar`, `AdminKpiGrid`, `SystemStatusPanel`, `AdminActionButton`, paneles admin disponibles.
- Hero superior derecho: `MiniLiveScoreControl` (control remoto de goles) reemplaza la antigua card de sesion. `SessionStatusCard` queda legacy sin montar.
- Marcador en vivo: el control resuelve el partido desde el fixture slim y guarda globalmente por RPC Supabase. `ACTUALIZAR MARCADOR` actualiza `polla_live_match`; `FINALIZAR PARTIDO` escribe `polla_official_results` y el siguiente marcador en una operacion atomica.
- Gate: `/admin` renderiza bloqueo por defecto. El dashboard se habilita solo con una sesion admin remota valida.
- Acceso global: navbar muestra Admin con candado; click abre `AdminAccessModal`.
- Sesion: RPC `polla_admin_login` entrega token temporal; `sessionStorage` usa `polla:adminSessionToken` y `polla:adminSessionExpiresAt`. Duracion 2 horas.
- Logout: eliminado del hero. La sesion admin solo expira por tiempo (2h) o limpiando `sessionStorage`.
- Client: `admin.client.js` valida sesion antes de inicializar acciones, monta el mini marcador (`initLiveScoreControl`) y usa confirmacion inline de doble paso.
- KPI Resultados oficiales (2026-06-12, comanda 05): `initOfficialResultsKpi` se suscribe a `subscribeLiveData` y pinta `X / 72` + "% cargados" (y el panel `data-results-loaded`/`data-results-pending`) contando filas reales de `polla_official_results`; el mock solo es el valor SSR inicial.
- RPCs de edicion de predicciones: la migracion `20260609193000_prediction_edit_access.sql` fue aplicada al Supabase remoto el 2026-06-12 via `supabase/remote/apply_prediction_edit_access.sql` (SQL Editor) y verificada: las RPC responden (`invalid_or_expired_admin_session` ante token invalido, ya no PGRST202). Si alguna vez vuelve el error de schema cache, ese archivo es re-ejecutable. El panel degrada con `data-remote-unavailable` + "Modulo no disponible" ante cualquier caida remota.
- Correcciones: Admin crea/revoca codigos de un solo uso; la sesion canjeada se
  vincula al jugador y vence a las dos horas.
- Cuando cambiar: barrera/modal en `components/layout`; dashboard, mini marcador y acciones en `10_admin`; contrato de marcador vivo en `lib/liveMatch/liveMatchState.js`.

## Flujos compartidos

### Identidad de jugador

- Llaves: `polla:selectedPlayerId`, `polla:playerConfirmed`, `polla:selectedPlayerSnapshot`.
- Escritura principal: `/jugador`, tambien helper `lib/playerIdentity.js`.
- Lectura: `/predicciones`, `/estadisticas` y cualquier UI que necesite mostrar jugador activo.
- Regla: si se cambia el contrato de identidad, actualizar `playerIdentity.js`, `JugadorSection.astro`, `resetPollaState.js` y este mapa.

### Reset y version de storage

- Archivo central: `src/lib/storage/resetPollaState.js`.
- Version actual: `production-reset-2026-06-12-roster-13`.
- Identidad invalida (nomina cerrada): `/jugador` y `/estadisticas` validan el id guardado contra `players.json` y limpian las llaves de identidad si apunta a un jugador eliminado (el versionado preserva identidad, asi que esta limpieza es explicita).
- `ensurePollaStorageVersion()` limpia drafts al detectar version distinta, preservando identidad cuando corresponde.
- El hard reset desde jugador limpia identidad, predicciones, clasificados, favoritos y descarga final local.

### Predicciones y JSON oficial

- Draft de marcadores: `polla:predictions`.
- Clasificados calculados automaticamente: `polla:qualifiedPredictions`.
- Grupo activo: `polla:activePredictionGroup`.
- Intencion transitoria: `polla:activePredictionGroupIntent`.
- Bloqueo final: `polla:finalDownloaded`, `polla:finalDownloadedAt`, `polla:finalDownloadedFilename`.
- Payload final guardado: `polla:finalSubmissionPayload`.
- Borradores de correccion: `polla:predictionCorrectionDrafts`.
- Sesion temporal: `sessionStorage[polla:predictionEditSession]`.
- El panel de clasificados muestra una mini tabla POS/EQUIPO/PTS/DG/GF y guarda 1°/2° solo cuando los 6 partidos del grupo estan completos.
- El JSON oficial se descarga localmente desde browser. No hay endpoint de escritura en el flujo actual.
- Una correccion no reemplaza el dataset por si sola: Admin sustituye el archivo
  fuente, ejecuta `npm run predictions:build` y redespliega.

### Carton oficial entre dispositivos

- Fuente de verdad: `src/data/predictions.json`.
- Selector compartido: `lib/predictions/predictionAccess.js`.
- Estado oficial sin permiso: lectura y Estadisticas habilitadas, edicion
  bloqueada.
- Permiso: codigo de ocho caracteres, canje unico en 30 minutos y sesion de dos
  horas validada contra Supabase.
- Falla segura: codigo invalido, sesion vencida/revocada o caida remota vuelven
  a `official-locked`.

### Acceso Admin

- Modal y script global: `AdminAccessModal.astro`, `admin-access.client.js`.
- Trigger global: links con `data-admin-access-trigger`.
- Keys de sesion: `polla:adminSessionToken`, `polla:adminSessionExpiresAt`.
- Duracion: 2 horas.
- Proteccion: la UI sigue siendo estatica, pero las escrituras pasan por RPC `security definer`; no hay policies publicas de INSERT/UPDATE.

### Navegacion dirigida a predicciones

- Key local persistente: `polla:activePredictionGroup`.
- Key transitoria: `polla:activePredictionGroupIntent`.
- Usada por `/predicciones`, `/proximo-partido` y `/estadisticas`.
- Objetivo: abrir predicciones en el grupo correcto sin reflow visual innecesario.

### Marcador en vivo (admin) -> Tabla dinamica

- Archivo central (seam): `lib/liveMatch/liveMatchState.js`.
- Fuente remota: tablas Supabase `polla_live_match` y `polla_official_results`; migracion en `supabase/migrations/20260608170000_polla_live_realtime.sql`.
- Escritura (admin): `saveLiveMatchState()` llama RPC protegida; `finalizeOfficialResult()` oficializa y avanza atomicamente.
- Lectura (tabla): `subscribeLiveData(callback)` carga el snapshot REST y escucha `postgres_changes` sobre ambas tablas. Todos los navegadores reciben el mismo marcador.
- Cache local: `polla:liveMatchState` y `polla:officialResults` solo toleran cortes breves; ya no son fuente compartida.
- Movimiento: las flechas comparan la posicion provisional vs el ranking oficial (sin live) para mostrar el efecto del gol.
- Regla: `fixture.json` es calendario fijo y no se modifica. La tabla publica puntua contra predicciones oficiales (`predictions.json`); el recompute mergea `polla:predictions` solo para uso local. Si cambia algun contrato, actualizar `liveMatchState.js`, `MiniLiveScoreControl.astro`, `admin.client.js`, `tabla.client.js` y este mapa.

### Favoritos de equipos

- Key: `polla:favoriteTeams`.
- Dueño: `08_equipos/equipos.client.js`.
- Formato: array JSON de ids de equipo.
- No debe usarse como fuente oficial de ranking ni predicciones.

## Inventario de storage

| Key | Storage | Dueño principal | Lee/escribe | Uso |
| --- | --- | --- | --- | --- |
| `polla:storageVersion` | localStorage | `resetPollaState.js` | Lee/escribe | Versiona limpieza local |
| `polla:selectedPlayerId` | localStorage/sessionStorage | Jugador / `playerIdentity.js` | Lee/escribe | Jugador activo |
| `polla:playerConfirmed` | localStorage/sessionStorage | Jugador / `playerIdentity.js` | Lee/escribe | Confirmacion de identidad |
| `polla:selectedPlayerSnapshot` | localStorage/sessionStorage | Jugador / `playerIdentity.js` | Lee/escribe | Snapshot de avatar/nombre |
| `polla:predictions` | localStorage | Predicciones | Lee/escribe | Marcadores por jugador/partido |
| `polla:qualifiedPredictions` | localStorage | Predicciones | Lee/escribe | Clasificados por jugador/grupo |
| `polla:activePredictionGroup` | localStorage | Predicciones | Lee/escribe | Grupo activo persistido |
| `polla:activePredictionGroupIntent` | sessionStorage | Proximo/Estadisticas/Predicciones | Lee/escribe | Entrada dirigida temporal |
| `polla:favoriteTeams` | localStorage | Equipos | Lee/escribe | Favoritos del album |
| `polla:finalDownloaded` | localStorage | Predicciones | Lee/escribe | Bloqueo post descarga |
| `polla:finalDownloadedAt` | localStorage | Predicciones | Lee/escribe | Fecha ISO de descarga |
| `polla:finalDownloadedFilename` | localStorage | Predicciones | Lee/escribe | Nombre del JSON generado |
| `polla:finalSubmissionPayload` | localStorage | Predicciones | Lee/escribe | Payload oficial guardado |
| `polla:adminSessionToken` | sessionStorage | Admin access | Lee/escribe | Token remoto temporal para RPC admin |
| `polla:adminSessionExpiresAt` | sessionStorage | Admin access | Lee/escribe | Expiracion ISO de sesion admin |
| `polla:playerResetFeedback` | sessionStorage | Jugador | Lee/escribe | Mensaje post reset |
| `polla:returnAfterPlayerSelect` | sessionStorage | Estadisticas / Jugador | Lee/escribe | Retorno dirigido tras elegir jugador (modal identidad) |
| `polla:liveMatchState` | localStorage | `lib/liveMatch/liveMatchState.js` | Cache | Ultimo marcador remoto conocido |
| `polla:officialResults` | localStorage | `lib/liveMatch/liveMatchState.js` | Cache | Ultimos resultados remotos conocidos |

## Inventario de data

| Archivo | Uso |
| --- | --- |
| `players.json` | Jugadores oficiales y avatars (nomina cerrada: 13) |
| `teams.json` | 48 selecciones, banderas, escudos, portadas |
| `groups.json` | Grupos A-L |
| `fixture.json` | 72 partidos de fase de grupos |
| `predicciones_*.json` | Fuentes versionadas de cada carton oficial; viven en la raiz del proyecto y alimentan `predictions:build` |
| `predictions.json` | Dataset canonico de cartones oficiales: metadata, marcadores y clasificados (13/13 cartones, 936 marcadores, 312 posiciones, cero pendientes) |
| `stat-cards/players/*.json` | Fichas estadisticas jugables ya resueltas por jugador (Data Arena), 1 por cartonista (13) |
| `stat-cards/data-arena-13.json` | Base agregada canonica del corte 13: rankings, duelos (pairwise) y highlights globales ya resueltos |
| `predictions.mock.json` | Mock inicial o contrato de predicciones |
| `results.json` | Resultados reales/futuros |
| `official-results.json` | Snapshot commiteado de `polla_official_results` (Supabase) que SIEMBRA el GRÁFICO de Estadisticas; refrescar con `npm run results:snapshot` |
| `results.mock.json` | Resultados demo para tabla |
| `scoring-rules.json` | Puntaje exacto/tendencia/lone wolf |
| `table-predictions.mock.json` | Predicciones mock para ranking |
| `match-preview.mock.json` | Contenido editorial de proximo partido |
| `match-info.mock.json` | Info extendida para fixture |
| `equipos-info.json` | Fichas editoriales por equipo |
| `admin-dashboard.json` | Estado admin real/futuro |
| `admin-dashboard.mock.json` | Estado admin mock |
| `stadiums-assets.json` | Metadata de estadios |
| `confederations-assets.json` | Metadata de confederaciones |
| `team-covers.assets.manifest.json` | Manifest de portadas de equipos |

## Inventario de helpers

| Archivo | Uso |
| --- | --- |
| `lib/playerIdentity.js` | Normaliza, guarda y lee identidad de jugador |
| `lib/storage/resetPollaState.js` | Resetea/versiona storage local |
| `lib/liveMatch/liveMatchState.js` | Seam Supabase: login/sesion admin RPC, guardado atomico, lecturas REST, cache y suscripcion Realtime |
| `lib/liveMatch/liveMatchPhase.js` | Fuente unica del tri-estado official/live/pending del marcador remoto (gating de puntaje por hora de fixture y goles explicitos) |
| `lib/supabase/supabaseClient.js` | Cliente unico `@supabase/supabase-js` desde `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` |
| `lib/liveMatch/liveScoring.js` | Fuente UNICA de calculo (SSR + vivo): puntaje 5/3/1/0 (`calculatePointsForPrediction`) y precision visual alcanzable/imposible (`calculateLiveAccuracy`). Puntos != precision. |
| `lib/fixture/groupStandings.js` | Tabla real de grupo (fixture + resultados oficiales); adaptador sobre `calculateGroupStandings` de predicciones |
| `lib/stadiums/getStadiumAsset.ts` | Resuelve assets de estadios por fixture |
| `lib/ui-assets/uiAssets.ts` | Referencias compartidas de assets UI |
| `lib/tabla/calculatePlayerStandings.ts` | Ranking de jugadores |
| `lib/tabla/calculatePlayerMovement.ts` | Movimiento de posiciones |
| `lib/tabla/calculateCurrentMatchAccuracy.ts` | Accuracy del partido actual/relevante |
| `lib/tabla/getLiveOrRelevantMatch.ts` | Partido vivo o relevante |
| `lib/tabla/formatRankingRows.ts` | View model de filas de ranking |
| `lib/tabla/types.ts` | Tipos compartidos de tabla |
| `lib/statistics/communityStatistics.js` | Perfiles, consensos, comparaciones, clasificados y pulsos compartidos |
| `lib/statistics/buildScoreRaceTimeline.js` | Carrera de Puntaje: timeline acumulado por jugador + clusters de empate (puro; reusa `liveScoring`) |
| `lib/statistics/buildScoreRaceNarrative.js` | Carrera de Puntaje: relato automatico por partido y por jugador (puro, solo datos reales) |
| `lib/statistics/statCards.ts` | Registry de fichas jugables (Data Arena): indexa `data/stat-cards/players/*.json` por player.id y resuelve avatar desde players.json |
| `lib/statistics/statCardsRerank.ts` | Helper puro: clona fichas y normaliza rankings asc/desc al universo cargado; falla ante datos incompletos o ambiguos |
| `lib/statistics/dataArenaBase.ts` | Accessor de la base Data Arena 13: highlights globales y duelos ya resueltos, identidad/avatar desde players.json |
| `lib/statistics/types.ts` | Contratos del dataset y view models estadisticos |

## Inventario de assets publicos

| Carpeta | Uso |
| --- | --- |
| `public/assets/backgrounds/avif` | Fondos principales por seccion, precargados por pagina |
| `public/assets/backgrounds/webp` | Fallback/variantes WebP de fondos |
| `public/assets/backgrounds/preview` | Previews livianos de fondos |
| `public/assets/copa` | Copa principal legacy |
| `public/assets/flags` | Banderas SVG por id de equipo |
| `public/assets/crests` | Escudos WebP y thumbs |
| `public/assets/players` | Avatares WebP y thumbs |
| `public/assets/stadiums` | Estadios WebP |
| `public/assets/confederations` | Logos de confederaciones |
| `public/assets/teams/covers` | Portadas de equipos |
| `public/assets/polla-mundialera` | Assets WebP master por seccion y compartidos |
| `public/fonts` | Fuentes self-hosted WOFF2/TTF |

## Gotchas y reglas de mantenimiento

- Contenido inyectado por `client.js` via `innerHTML` no recibe el atributo scoped de Astro. Estilar con inline style en el string o `:global([data-section="..."] ...)`.
- Medir performance con `npm run build && npm run preview`. El dev server compila bajo demanda y no representa produccion.
- Mantener cada client JS scoped a su seccion. Si un script necesita estado compartido, mover contrato a `lib/`.
- No agregar CSS global de componentes. Usar CSS Module de seccion o componente scoped.
- Si cambia una ruta, storage key, JSON de data, flujo de navegacion o contrato compartido, actualizar este mapa en el mismo cambio.
- Si se agrega un asset nuevo, registrar su carpeta publica y el data/manifest que lo referencia.
- Si se agrega una accion critica en Admin, usar confirmacion inline, no `alert`, `prompt` ni `confirm`.
- Si se cambia el flujo final de predicciones, mantener sincronizados `predicciones.validation.js`, `predicciones.export.js`, `predicciones.client.js`, `resetPollaState.js` y este mapa.

## Comandos utiles

```powershell
npm run dev
npm run predictions:build
npm run results:snapshot
npm test
npm run build
npm run preview
```

Chequeos rapidos de mapa:

```powershell
rg -n "termino-obsoleto-1|termino-obsoleto-2" .\mapa_sitio_trabajo_secciones_final.md .\site\src
rg -n "polla:finalDownloaded|polla:adminSessionToken|data-admin-access-trigger" .\mapa_sitio_trabajo_secciones_final.md .\site\src
```

## Historial compacto de decisiones vigentes

- 2026-06-23 (comanda F9 "Clasificacion de grupos", arbol `comandas_F9_clasificacion_grupos_modif`): /estadisticas estrena la pestaña CLASIFICACIÓN (al final del tablist; `.stats-tabs` paso de 5 a 6 columnas, 3 en tablet, 2 en mobile). SOLO LECTURA; hereda el gatillo del bono de grupo de la fundacion (no re-gatea ni reimplementa puntaje). Vista POR JUGADOR de sus 12 grupos (A..L) con selector propio del panel (`[data-grupos-player-select]`, arranca en `polla:selectedPlayerId`): por grupo, pick 1o/2o vs equipo que va ahora, +1/+3/0 por linea, total y ESTADO. Estados: BLOQUEADO (gris/candado, sin puntos ni 1o/2o provisional de fechas 1-2 — estado por defecto de casi todos los grupos en un dia normal), EN DEFINICION (naranja, provisional, >=1 final de 3a fecha en vivo), DEFINITIVO (verde, closure `state==='final'`, congelado). Fuente unica (CERO formula nueva en la UI): `buildGroupBonuses.byGroup` da los +1/+3/0 solo de grupos en definicion/cerrados (los bloqueados NO aparecen en `byGroup` y se pintan desde el pick directo de `qualifiedPredictions`); `computeGroupSituation` da estado/1o/2o; `isGroupDefinitionStarted` es el gatillo. Pipeline identico a F7: F1 `resolveActiveWindow` es el UNICO que gatea fase y mapea `*TeamScore`→`*Score`; de ahi sale `gatedLive` (TODOS los marcadores en vivo a la vez, no solo el ultimo) que consumen las libs de grupo. Dueño unico: `estadisticas.client.js` reusa el `subscribeLiveData` que YA existe (NO abre un segundo); `renderGrupos` re-pinta cuando la pestaña grupos esta activa (memo por firma oficiales+live+closures+jugador). `closuresByGroup` derivado de `liveSnapshot.groupClosures`. CSS via `<style is:global>` anclado a `[data-stats-panel="grupos"]` (panel llenado por innerHTML en runtime; gotcha de scope); estados con color + texto/candado, sin animaciones nuevas, mobile 1 columna, tabs accesibles. 4 tests nuevos (`tests/estadisticas-grupos-matrix.test.mjs`): caso BLOQUEADO total, un final abre solo su grupo, +1/+3/0 por linea, DEFINITIVO solo con closure. Suite 94/94, build 11 paginas. Las demas pestañas quedan identicas; sin actividad en vivo, todos los grupos salen BLOQUEADOS (cero regresion). Pendiente: F8 cronologia, F10 movil, F11 admin de cierre, Stage 0/2.
- 2026-06-23 (comanda F7 "Ranking vivo explicable", arbol `comandas_F7_ranking_vivo_modif`): /tabla pasa a contar TODOS los marcadores en vivo y a explicar como el vivo mueve el ranking. SOLO LECTURA; hereda el gatillo del bono de grupo de la fundacion (F6 paso A), no re-gatea ni reimplementa puntaje. (a) `tabla.client.js` `recompute(snapshot)` lee `snapshot.liveMatches[]` y arma los resultados efectivos via `resolveActiveWindow`/`resolveEffectiveResults` (F1 gatea fase + mapea) -> `calculateStandings` da las stats de partido (PJ/exactos/racha/rendimiento/DG) para N vivos. (b) Proyectado/oficial/delta + lineas salen de `buildPointLedger` (`ledger.byPlayer[id]`): `projected = official + provisional`, bono 1o/2o solo de grupos en definicion/cerrados; filas ordenadas por `projected` (desempates de hoy; sin bono == orden actual, "sin vivo identica a hoy"). (c) `RankingRow.astro`: celda de puntos con `[data-rank-projected]` (protagonista) + `[data-rank-delta]` (`+N EN VIVO`, `[data-rank-delta-num]` para mobile) + `[data-rank-official]` (subtitulo); fila `role=button`/`aria-expanded` que abre la fila-detalle. (d) Fila-detalle Nivel 2 (`[data-rank-detail]`, innerHTML) desde `ledger...lines`: reconcilia `oficial + variacion = proyectado` + frase "por que cambia"; CSS `<style is:global>` en `RankingTable.astro`, anim <300ms, reduced-motion. (e) Flechas = posicion proyectada vs oficial (`ledger.official`) con delta; sin delta, vs `previousPositions`. (f) Payload SSR + `qualifiedPredictions`/`groups`. Un solo `subscribeLiveData`; NO se toca `calculatePlayerStandings.ts` (SSR); el hero card/precision/proximo siguen con el `liveMatch` legado. `results.json` esta vacio (pre-torneo), asi que proyectado==oficial==0 hoy y la pagina se ve igual que antes. Suite 90/90, build 11 paginas. Pendiente: F9 (/estadisticas), F8, F10, F11, Stage 0/2.
- 2026-06-22 (comanda F6 "Centro de definicion de grupo", arbol `comandas_F6_centro_definicion_modif`): /proximo-partido estrena el Centro de definicion (SOLO LECTURA) que aparece cuando un grupo entra a su ventana final (>=1 de sus DOS finales de 3a fecha EN VIVO); en modo normal no se ve (cero regresion). El nucleo es la correccion y blindaje del GATILLO del bono de grupo (1o +1 / 2o +3) en la FUNDACION: nuevo `isGroupDefinitionStarted` + `getGroupFinalMatches` en `lib/fixture/groupState.js` (fuente unica; `computeGroupSituation` expone `definitionStarted`), y `buildGroupBonuses` ahora gatea por ese helper en lugar de `finishedCount+liveCount>0` (antes activaba bonos con fechas 1-2). Antes del gatillo el grupo va BLOQUEADO (sin bonos), no provisional; F7/F9 lo heredan. Fix de forma: `isGroupDefinitionStarted` normaliza `*Score`/`*TeamScore` antes de `resolveLiveMatchPhase` (el `gatedLive` del ledger viaja como *Score; sin normalizar, el bono quedaria en 0 con un final EN VIVO). UI nueva en `06_proximo_partido`: `GroupDefinitionCenter` (shell oculto, 4 slots), `LiveMatchMini` x2 (los dos finales, estado por `data-phase`), `LiveGroupStandings` (tabla viva 1o/2o, chip provisional), `YourImpactCard` (Capa 1 cifra+delta `+N EN VIVO`, Capa 2 matriz de 4 variables plegable cerrada por defecto). El client reusa el UNICO `subscribeLiveData` y todo sale de las libs F0-F5 (`resolveActiveWindow`/`computeGroupSituation`/`buildPointLedger`): CERO formula de puntaje en la UI (solo mapea `regla` -> etiqueta/color). Payload SSR ampliado con `groups`/`players`/`predictions`/`qualifiedPredictions`. Tests +8 (`tests/group-definition-started.test.mjs` + caso BLOQUEADO y fixture con `dateUtc` en `tests/group-bonuses.test.mjs`); suite 90/90, build 11 paginas limpio. Solo lectura (`MULTI_LIVE_WRITE_ENABLED=false`). Pendiente: F7 (/tabla), F9 (/estadisticas), F8 cronologia, F10 movil, F11 admin de cierre, Stage 0/2 (SQL + multi-write).
- 2026-06-22 (comanda "desempate_grupos_2026"): se corrige el desempate de grupos al criterio OFICIAL FIFA Copa 2026. Antes el codigo usaba el criterio viejo (2018/2022: DG global ANTES del head-to-head); 2026 sube el head-to-head de prioridad. Orden nuevo: PTS > head-to-head(pts, DG, GF entre los empatados) > DG total > GF total > fair play (NO DISPONIBLE: no hay datos de tarjetas en la polla) > fallback declarado (indice original estable, nunca azar). Fuente unica en `predicciones.standings.js`: `compareRows` reordenado (Paso A, 2 equipos) + NUEVO `rankGroupRows` (Paso B, mini-tabla TRANSITIVA por clusters para empates de 3+; el `.sort` par-a-par no es transitivo); `calculateGroupStandings` ahora usa `rankGroupRows`. Se propaga solo (fuente unica) a la tabla de grupo de `/fixture`, a la tabla de `/predicciones`, al 1o/2o en vivo (`computeGroupSituation`/`resolveFirstSecond`) y a los bonos +1/+3. Consecuencia de datos: el clasificado del carton se DERIVA de los marcadores bajo 2026 (no del declarado); `predictions-importer.mjs` usa `getAutomaticQualified` como fuente de verdad y avisa (`derivationWarnings`) cuando difiere del declarado (cartones llenados con el criterio viejo). Caso real: Humberto Grupo D paso de 2o paraguay (viejo) a 2o usa (2026, usa gano el head-to-head); `predictions.json` regenerado. Borde FIFA conocido NO implementado: la recursion del PASO 1 tras el PASO 2 (la version cluster + fallback resuelve los casos practicos). Fuente del criterio: FIFA Copa 2026. 7 casos de test (`tests/group-tiebreakers.test.mjs` 1-6 + propagacion en `group-merged-standings`); suite 82/82, build limpio. Supersede la cadena de desempate descrita en `comanda_definicion_simultanea.md` 6.1 (que listaba el orden viejo).
- 2026-06-22 (comanda FABLE 6.0 "DEFINICION SIMULTANEA", fundacion F0-F5, SIN UI todavia): se construye la capa de logica pura + seam + migraciones para la jornada final (2 partidos del mismo grupo en vivo a la vez). Decision de fondo: `polla_live_match` era SINGLETON (`check id='current'`), no podia sostener 2 vivos; se generaliza a MULTI-FILA por `match_id` (Opcion A, backward-compatible: 1 vivo = N=1). Libs nuevas (todas puras, con tests): `lib/liveMatch/activeWindow.js` (`resolveActiveWindow` 1..N por grupo con estado REAL + `resolveEffectiveResults`, UNICO lugar que gatea fase y mapea *TeamScore->*Score), `lib/fixture/groupTiebreakers.js` (facade que reexporta `compareRows`/`directStats` de `predicciones.standings.js` + `resolveFirstSecond`), `lib/fixture/groupStandings.js` (+`buildMergedGroupStandings` oficial+live), `lib/fixture/groupState.js` (`deriveGroupState` maquina pending->in_definition->pending_close->final->reopened, `computeGroupSituation`, `isClosureStale`), `lib/scoring/buildPointLedger.js` (libro contable: oficial=Σfinal, proyectado=Σ(final+prov), anulado=0; reusa `calculatePointsForPrediction`), `lib/scoring/groupBonuses.js` (1o +1 / 2o +3, idempotente por clave `group:G:player:first|second`, lleva `groupState` en cada linea). Seam `lib/liveMatch/liveMatchState.js` extendido ADITIVO: `subscribeLiveData` ahora emite `{ liveMatch (legado=mas nuevo), liveMatches[], officialResults, groupClosures }`; lectura schema-agnostica (funciona pre y post migracion); nuevas `setLiveScore`/`clearLiveScore` (GUARDRAIL `MULTI_LIVE_WRITE_ENABLED=false`: no usar en prod hasta migrar consumidores) + `closeGroup`/`reopenGroup`. Persistencia nueva: tabla `polla_group_closure` (1 fila por grupo, version++ en cada cierre/reapertura) + RPC `polla_close_group`/`polla_reopen_group` (mismo patron security definer + `polla_assert_admin`). Migraciones `20260622120000_polla_live_match_multi.sql` (PELIGROSA: backup + backfill que ABORTA si huerfano + swap de PK idempotente + REPLICA IDENTITY FULL) y `20260622120100_group_closure.sql`, ambas con `remote/apply_*.sql` re-ejecutables; APLICAR MANUAL en SQL Editor en ventana SIN partido vivo (verificar P0001, no PGRST202). `supabaseClient.js` ahora node-safe (try/catch sobre `import.meta.env`, sin cambiar el reemplazo estatico de Vite). Pendiente (incrementos siguientes): migrar consumidores a `liveMatches[]` (Stage 1/2) y UI F6-F13. Suite 77/77 verde, build 11 paginas limpio. Sin tocar `fixture.json` ni el modelo de puntaje (fuente unica `liveScoring.js`).
- 2026-06-13: Eliminado el concepto "resultado/pronostico coral" de la UI en todas las secciones (Estadisticas, Fixture, Proximo Partido, Equipos) por pedido del usuario ("feo, confunde, no ayuda"). Se borro `CommunityMatchPulse.astro` + sus hidrataciones (`renderCommunityPulse` en fixture/proximo, bloque del modal de equipos) + payloads/CSS muertos. `communityStatistics.js` (`favoriteScore`) y todos los JSON quedan intactos (solo deja de mostrarse); el consenso se conserva. Build limpio, 42/42 tests.
- 2026-06-13 (comanda FABLE 5.0 "GRÁFICO"): Estadisticas estrena la pestaña GRÁFICO ("Carrera de Puntaje") como primera vista por defecto. Nuevo orden de tabs GRÁFICO/PARTIDOS/COMUNIDAD/MI PERFIL/COMPARAR; CLASIFICADOS deja de ser pestaña (su matriz pasa dentro de COMPARAR, junto al comparador) y `?tab=clasificados` se aliasa a `comparar`. Grafico = lineas de puntaje acumulado por jugador, nodos agrupados por empate (badge + pop-up), columna posicion actual, narrativa derivada de datos, timeline y leyenda. Logica pura nueva: `lib/statistics/buildScoreRaceTimeline.js` + `buildScoreRaceNarrative.js` (reusan `liveScoring` 5/3/1/0 y `liveMatchPhase` para el punto live provisional); piezas `StatsGraphTab`/`ScoreRaceGraph`/`ScoreRaceLegend`/`ScoreRaceNarrative`/`ScoreRacePopup` + `score-race.client.js` (`createScoreRace`, alimentado por `estadisticas.client.js`, dueño unico del dataset/realtime). GSAP lazy (chunk aparte, solo esta vista, respeta reduced-motion). 9 tests nuevos (`tests/score-race-timeline.test.mjs`); suite 42/42, build limpio.
- 2026-06-12 (comandas 01-09): La app pasa a modo competencia oficial. (a) Nomina cerrada a 13: Gonzalo y Ratinha fuera de `players.json`, assets y mock; rebuild 13/13 cartones / 936 / 312, cero pendientes; storage `production-reset-2026-06-12-roster-13`; `/jugador` y `/estadisticas` limpian identidad invalida. (b) Resultados oficiales mandan en todas las secciones: Fixture fusiona `polla_official_results` client-side (marcador en fila/hero/info, status finished), Proximo Partido salta oficializados, KPI Admin cuenta filas reales via `subscribeLiveData`. (c) Fixture: `GroupStandingsPanel` (tabla real del grupo via `lib/fixture/groupStandings.js`) reemplaza a `DayAgendaPanel` (legacy sin montar). (d) Racha de tabla = dots por hitType (slice -5) con mapeo unico morado +5 / azul +3 / verde +1 / gris 0, alineado en panel derecho y Estadisticas/Partidos; fix: la racha ahora se re-renderiza en vivo. (e) Tabla: tipografia por rol (display/ui/score; Rajdhani activado en fonts.css), barras Pretemporada y Tabla provisional eliminadas, ranking mobile compacto de una linea. (f) Estadisticas: tabs MI PERFIL > PARTIDOS > COMUNIDAD > CLASIFICADOS; pestana PARTIDOS como auditoria (columna SUMA + score-dots + leyenda); modal de identidad faltante con retorno dirigido (`polla:returnAfterPlayerSelect`). (g) Migracion prediction_edit_access detectada SIN aplicar en remoto; se aplico el mismo dia via `supabase/remote/apply_prediction_edit_access.sql` en el SQL Editor (verificado: RPC responden). El panel admin degrada con mensaje claro ante caidas remotas.
- 2026-06-12: Tri-estado del marcador formalizado. Los dos parches de emergencia (bloqueo de puntaje antes del inicio y partido pendiente visible sin puntuar) se consolidan en `lib/liveMatch/liveMatchPhase.js`, fuente unica de official/live/pending para tabla y estadisticas. Admin escribe `status` explicito ("live" al actualizar, "pending" al preparar el siguiente tras FINALIZAR), sin migracion SQL y compatible con filas viejas. La hero card en espera usa el estado `waiting` estilizado del SSR; la fase live termina solo al oficializar (sin expiracion automatica). Caso vigente: Mexico 2-0 Sudafrica oficial puntuado; Corea-Chequia preparado EN ESPERA con 0 puntos. 10 tests nuevos en `tests/live-match-phase.test.mjs`.
- 2026-06-12: Base Data Arena 13 integrada como corte canonico. `data/stat-cards/data-arena-13.json` + 13 fichas (entran Felipe 03 e Italo 13); el rerank en memoria deja todos los ranks visibles en `de 13`. Estadisticas suma dos paneles SSR nuevos dentro de la capa Data Arena: `ArenaHighlightsPanel` (6 tops globales) y `ArenaDuelsPanel` (gemelos de pronostico + rivalidades), alimentados por `lib/statistics/dataArenaBase.ts` que consume la base ya resuelta sin recalcular. Counters dinamicos quedan en 13/72/936. Tests de rerank migrados a universo dinamico con anclas a 13.
- 2026-06-12: Felipe e Italo reemplazan a Daniel y Martin (identidad completa, mismas posiciones del array en `players.json`). Ambos entregaron carton oficial: el rebuild queda en 13/15 cartones, 936 marcadores y 312 posiciones; pendientes solo Gonzalo y Ratinha. Assets nuevos `{felipe,italo}.webp` + thumbs; los de daniel/martin se eliminaron sin referencias activas. `table-predictions.mock.json` y tests migrados (el test de carton local usa `gonzalo`, que sigue pendiente). Storage local sube a `production-reset-2026-06-12-felipe-italo`.
- 2026-06-10: Isaias y Jaime quedan integrados al nucleo oficial. Los 11 `predicciones_*.json` quedan versionados en la raiz para que `npm run predictions:build` sea reproducible en un clon limpio y regenere ambos datasets a 11/15 cartones, 792 marcadores y 264 posiciones clasificatorias con cero errores. Data Arena carga 11 fichas; `statCardsRerank.ts` normaliza en memoria todos los rankings visibles a `de 11`, conservando intactos los JSON y el contenido editorial. Jugador, Predicciones, Tabla y Admin crecen desde las fuentes compartidas, sin filas ni contadores manuales.
- 2026-06-10: Integracion de Carlos y Luis Renato al nucleo. `npm run predictions:build` regenera `predictions.json` + `community-predictions.json` a 9/15 cartones (648 marcadores, 216 posiciones) leyendo los `predicciones_*.json` del root. Estadisticas suma una capa Data Arena de cartas jugables (flip 3D) sobre el dashboard tabular, alimentada por `data/stat-cards/players/*.json` via `lib/statistics/statCards.ts`; carta del dia + pulso de oficina derivados de `buildCommunityAnalysis`. Tabla 05 recibe refresco arcade aditivo: podio top-3 sincronizado, shimmer del lider, badge LONE WOLF y cruce de resaltado fila/prediccion. Counters de Admin/Estadisticas ya eran dinamicos. Tests del importer/estadisticas migrados a aserciones dinamicas (no congelan el conteo de cartones).
- 2026-06-09: Estadisticas se convierte en Data Center coral. Siete JSON oficiales producen 504 marcadores y 168 posiciones clasificatorias. Se agrega importador versionado, validacion de tablas, dashboard de cuatro pestañas, deep links y pulsos bloqueados en Proximo partido, Fixture y Equipos. Tabla consume las predicciones reales y Admin muestra 7/15.
- 2026-06-09: Jugador Marcos reemplazado por Jaime en la misma posicion del array (`players.json`), assets `jaime.webp` + `thumbs/jaime.webp`, mock `table-predictions.mock.json` migrado de `marcos` a `jaime`. Storage local sube a `production-reset-2026-06-09-jaime` para purgar drafts viejos. Cero apariciones productivas de Marcos.
- 2026-06-08: Supabase pasa a ser fuente compartida del marcador y resultados. Lectura publica con RLS + Realtime; escritura solo por RPC con sesion admin temporal. `localStorage` queda como cache. Migracion versionada bajo `supabase/migrations/`.
- 2026-06-08: Puntaje correcto + precision separada. Fuente unica `lib/liveMatch/liveScoring.js` (SSR + vivo). Modelo NO aditivo: Lone Wolf 5, exacto compartido 3, tendencia 1, nada 0 (antes daba 8 a un exacto unico). Coercion `Number()` corrige exacto que quedaba en 0. Precision visual = lectura aparte (alcanzable/imposible), no entrega puntos. Panel separa Puntos de Precision.
- 2026-06-08: Pipeline marcador en vivo -> tabla. `tabla.client.js` consume `subscribeLiveData` y mueve el ranking provisional con el snapshot remoto. Admin gana `FINALIZAR PARTIDO`, que persiste oficiales en Supabase y actualiza la cache local.
- 2026-06-08: Hero Admin reemplaza la card de sesion + logout por `MiniLiveScoreControl`. Marcador vivo manual en `polla:liveMatchState`, contrato/seam en `lib/liveMatch/liveMatchState.js`, evento `polla:live-score-updated`. Logout eliminado (sesion solo expira a 2h). `fixture.json` sigue intacto.
- 2026-06-01: Predicciones termina en descarga JSON local, con bloqueo `polla:finalDownloaded*`.
- 2026-06-01: Admin tiene candado en navbar, modal de clave, gate visual en `/admin` y sesion temporal de 2 horas.
- 2026-06-01: Copa de inicio conserva animacion idle, sin tilt de mouse ni giro 360 al click.
- 2026-05-31: Storage local versionado con `production-reset-2026-05-31`.
- 2026-05-30: Proyecto paso a identidad arcade luminosa con assets WebP por seccion.
- 2026-05-30: Medicion de rendimiento oficial queda en build/preview, no dev server.
