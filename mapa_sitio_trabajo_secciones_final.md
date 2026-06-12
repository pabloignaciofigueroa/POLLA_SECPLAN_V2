# Mapa operativo de arquitectura del sitio - Polla Mundialera SECPLAN 2026

Fecha de actualizacion: 2026-06-12
Estado del documento: mapa vivo principal del proyecto
Stack: Astro estatico, CSS Modules, JS cliente por seccion, JSON versionado y Supabase Realtime

Este archivo sirve para ubicar rapido donde cambiar cada cosa. Los `*.map.md`
dentro de cada seccion quedan como mapas secundarios mas especificos.

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
- Piezas principales: `TablaHero`, `RankingTable`, `RankingRow`, `MovementIndicator`, `LiveMatchCard`, `NextMatchCard`, `LastUpdateCard`.
- Data: resultados mock, reglas de puntaje y predicciones mock.
- Logica compartida: `src/lib/tabla/` calcula standings, movimientos, accuracy y partido relevante.
- Client: `tabla.client.js` hidrata estados visibles y no mezcla drafts locales como fuente oficial en el SSR.
- Marcador en vivo: `tabla.client.js` se suscribe a Supabase Realtime mediante `subscribeLiveData` del seam `lib/liveMatch/liveMatchState.js`. Cada cambio remoto recalcula standings/accuracy con oficiales + partido vivo, re-apunta las cards y revela el banner provisional. `localStorage` es solo cache/fallback.
- Tri-estado (2026-06-12): `lib/liveMatch/liveMatchPhase.js` resuelve official/live/pending como fuente unica. Solo `live` puntua y activa el banner; `pending` (partido preparado por Admin) se muestra EN ESPERA en hero card, NextMatchCard y panel derecho con 0 puntos, sin mover ranking. Un 0-0 preparado nunca puntua antes de la hora del fixture; goles > 0 son acto explicito del Admin. Admin escribe `status` "live"/"pending" en el payload (compat con filas viejas).
- Calculo (fuente unica): SSR y vivo usan `lib/liveMatch/liveScoring.js`. PUNTOS = ranking (Lone Wolf 5 / exacto compartido 3 / tendencia 1 / nada 0, no aditivo). PRECISION % = solo visual (exacto alcanzable vs imposible: con 5-2, 6-3 tiene mas % que 4-1); nunca afecta el orden. El panel "Predicciones de los jugadores" muestra Puntos y Precision en columnas separadas.
- Refresco arcade aditivo (2026-06-10): `PodiumStrip.astro` (top-3 con medalla/brecha, sincronizado por `renderPodium` en cada recompute), shimmer del lider, badge LONE WOLF (CSS sobre `data-hit-type`) y cruce de resaltado fila/prediccion/podio (`wireCrossHighlight`). Sin cambios en `lib/tabla/*` ni en el orden funcional.
- Cuando cambiar: formula de puntaje en `scoring-rules.json`/helpers de `lib/tabla`; filas/visual en componentes de `05_tabla`; pipeline en vivo en `tabla.client.js` + `lib/liveMatch/liveMatchState.js`.

### `06_proximo_partido`

- Orquestador: `ProximoPartidoSection.astro`.
- Piezas principales: `MatchHeroHeader`, `FeaturedMatchLayout`, `TeamMatchCard`, `VersusCenter`, `MatchReadingPanel`, `MatchContextPanel`, `NextActionPanel`, `PredictionDeadlineNotice`.
- Data: `fixture.json`, `teams.json`, `match-preview.mock.json`.
- Client: recalcula estado temporal con hora real del navegador y puede enviar intencion de grupo hacia predicciones.
- Gotcha local: algunas banderas/escudos se inyectan con `innerHTML`; el estilo debe ir inline o en reglas globales acotadas.
- Cuando cambiar: partido destacado y lectura editorial en data/mock y logica de seccion.

### `07_fixture`

- Orquestador: `FixtureSection.astro`.
- Piezas principales: `FixtureHero`, `FixtureSummaryCards`, `FixtureFilters`, `FixtureListPanel`, `FixtureDayGroup`, `FixtureMatchRow`, `SelectedMatchPanel`, `SelectedMatchHero`, `MatchInfoPanel`, `DayAgendaPanel`, `TimezoneNotice`.
- Data: `fixture.json`, `groups.json`, `match-info.mock.json`, assets de estadios.
- Client: `fixture.client.js` controla filtros, seleccion de partido, paneles y agenda.
- Storage: no escribe estado permanente.
- Cuando cambiar: calendario en `fixture.json`, info extendida en `match-info.mock.json`, visual/lista en componentes de `07_fixture`.

### `08_equipos`

- Orquestador: `EquiposSection.astro`.
- Piezas principales: `EquiposHero`, `TeamsSummaryStrip`, `GroupFilterChips`, `GroupSection`, `TeamCard`, `TeamDetailModal`, `TeamsAlbum`.
- Data: `teams.json`, `equipos-info.json`, manifests de portadas/confederaciones.
- Client: `equipos.client.js` maneja filtros, favoritos y modal con `dialog.showModal()`.
- Storage: `polla:favoriteTeams` como array JSON de ids.
- Cuando cambiar: datos base/imagenes en `teams.json` y assets; ficha editorial en `equipos-info.json`; modal/favoritos en client.

### `09_estadisticas`

- Orquestador: `EstadisticasSection.astro`.
- Piezas principales: `StatsHeroLocked`, `StatsProgressCard`, `StatsDashboard`, `LockedPreviewPanel`, `UnlockedBanner`.
- Funcion: antes de 72/72 muestra la promesa anti-copia; despues monta perfil, comunidad, explorador de partidos, clasificados y comparador.
- Client: carga `/data/community-predictions.json` solo al desbloquear, admite deep links y se suscribe al marcador/resultados Supabase.
- Logica coral compartida: `lib/statistics/communityStatistics.js`; contratos en `lib/statistics/types.ts`.
- Importacion: `npm run predictions:build` valida los JSON de la raiz y regenera la fuente canonica.
- Storage: lee `polla:selectedPlayerId`, `polla:predictions`; escribe `polla:activePredictionGroup` y `polla:activePredictionGroupIntent`.
- Pulsos compartidos: Proximo Partido, Fixture y Equipos revelan agregados si
  el carton local esta completo o el jugador tiene una entrega oficial.
- Data Arena (2026-06-12, corte 13): al desbloquear se monta una capa de cartas jugables (flip 3D) antes del dashboard; el dashboard tabular queda como "Explorador detallado". Fichas resueltas en `data/stat-cards/players/*.json` (13, incluye Felipe e Italo) via `lib/statistics/statCards.ts`; `statCardsRerank.ts` normaliza en memoria los rankings visibles al universo de 13 sin reescribir los JSON editoriales. Base agregada canonica `data/stat-cards/data-arena-13.json` consumida ya resuelta por `lib/statistics/dataArenaBase.ts` (highlights globales + duelos). Carta del dia + pulso de oficina derivados de `buildCommunityAnalysis`. Piezas: `DataArenaHero`, `FeaturedCard`, `CardDeck`, `PlayableStatCard`, `ArenaHighlightsPanel`, `ArenaDuelsPanel`, `data-arena.client.js`.
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
- Version actual: `production-reset-2026-06-12-felipe-italo`.
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
| `polla:liveMatchState` | localStorage | `lib/liveMatch/liveMatchState.js` | Cache | Ultimo marcador remoto conocido |
| `polla:officialResults` | localStorage | `lib/liveMatch/liveMatchState.js` | Cache | Ultimos resultados remotos conocidos |

## Inventario de data

| Archivo | Uso |
| --- | --- |
| `players.json` | Jugadores oficiales y avatars |
| `teams.json` | 48 selecciones, banderas, escudos, portadas |
| `groups.json` | Grupos A-L |
| `fixture.json` | 72 partidos de fase de grupos |
| `predicciones_*.json` | Fuentes versionadas de cada carton oficial; viven en la raiz del proyecto y alimentan `predictions:build` |
| `predictions.json` | Dataset canonico de cartones oficiales: metadata, marcadores y clasificados (13/15 cartones, 936 marcadores, 312 posiciones) |
| `stat-cards/players/*.json` | Fichas estadisticas jugables ya resueltas por jugador (Data Arena), 1 por cartonista (13) |
| `stat-cards/data-arena-13.json` | Base agregada canonica del corte 13: rankings, duelos (pairwise) y highlights globales ya resueltos |
| `predictions.mock.json` | Mock inicial o contrato de predicciones |
| `results.json` | Resultados reales/futuros |
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
| `lib/stadiums/getStadiumAsset.ts` | Resuelve assets de estadios por fixture |
| `lib/ui-assets/uiAssets.ts` | Referencias compartidas de assets UI |
| `lib/tabla/calculatePlayerStandings.ts` | Ranking de jugadores |
| `lib/tabla/calculatePlayerMovement.ts` | Movimiento de posiciones |
| `lib/tabla/calculateCurrentMatchAccuracy.ts` | Accuracy del partido actual/relevante |
| `lib/tabla/getLiveOrRelevantMatch.ts` | Partido vivo o relevante |
| `lib/tabla/formatRankingRows.ts` | View model de filas de ranking |
| `lib/tabla/types.ts` | Tipos compartidos de tabla |
| `lib/statistics/communityStatistics.js` | Perfiles, consensos, comparaciones, clasificados y pulsos compartidos |
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
