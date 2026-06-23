# 10_admin — Mapa técnico

## Estado
supabase-admin-active

## F11 - Cierre de grupo + reversion (2026-06-23, PRIMER consumidor que ESCRIBE)

Panel `GroupClosePanel.astro` (montado en `AdminSection.astro` despues de
`MatchProgressPanel`, dentro de `[data-admin-protected]`). Para cada grupo en
PENDING_CLOSE / FINAL / REOPENED el admin ve la tabla final, el 1o/2o, el preview
de bonos y los botones de cierre/reapertura. Sin grupos por cerrar el panel queda
oculto (cero regresion: /admin identico a hoy).

- Shell SSR oculto; el cuerpo lo pinta el client por innerHTML, por eso el CSS va
  `<style is:global>` anclado a `[data-group-close]` (gotcha 1: el scope de Astro no
  aplica al DOM creado en runtime). Misma forma que `MatchProgressPanel`.
- Logica de UI en `admin.client.js` -> `initGroupClosePanel(section, payload)`: devuelve
  un `render(snapshot)` que el dueno del snapshot invoca en cada emit. NO abre un
  `subscribeLiveData` propio: `initOfficialResultsKpi` (el UNICO subscribe del KPI) ahora
  reenvia el snapshot al panel (`onSnapshot`). Un solo dueno del dataset.
- Datos SOLO LECTURA (biblia) via payload SSR `clientPayload.groupClose`: `groups`,
  `fixtureMatches` (slim), `players` (id/name), `qualifiedPredictions`.
- CERO formula nueva en la UI: estado/1o/2o/standings/closureStale de
  `computeGroupSituation`; bonos de `buildGroupBonuses.byGroup`. La logica pura de
  deteccion (que grupos mostrar), preview de bonos e idempotencia-UI (cuando ofrecer
  cerrar/reabrir) vive en `src/lib/admin/groupClosePreview.js` (testeable offline).

### Acciones (RPC; escritura solo por RPC security definer con sesion admin)
- "VALIDAR Y CERRAR" -> `confirmDialog` (doble paso inline, nunca alert/confirm/prompt)
  -> `closeGroup(groupId, first, second, standings)` (RPC `polla_close_group`). Upsert
  por group_id, version++: dos clics NO duplican. En FINAL coherente el boton NO se ofrece
  (idempotencia UI); en FINAL stale se ofrece "Recerrar (corregido)".
- "REABRIR" (destructivo, solo en FINAL) -> campo de texto de MOTIVO en el markup (NO
  `prompt`) + `confirmDialog` -> `reopenGroup(groupId, reason)` (RPC `polla_reopen_group`).
  state reopened, version++; los bonos vuelven a provisional sin doble conteo.
- `closureStale`: en cada snapshot, para FINAL, si `situation.closureStale` es true (1o/2o
  congelado != recomputado, o un partido del grupo dejo de ser oficial) -> banner rojo
  "Grupo cerrado desactualizado: reabrir y recalcular" + se resalta REABRIR. No pasa en
  silencio.
- Errores inline (`closeErrorMessage`): P0001/sesion vencida -> "reingresa la clave";
  PGRST202 -> "falta aplicar el SQL de cierre (operador)".

### Backend (NO se toca en esta comanda)
- Tabla `polla_group_closure` + RPC `polla_close_group`/`polla_reopen_group` ya en el
  repo: `supabase/migrations/20260622120100_group_closure.sql` y
  `supabase/remote/apply_group_closure.sql` (en paridad; NO editados, estaban correctos).
- `MULTI_LIVE_WRITE_ENABLED` NO se toca (es Stage 2; F11 usa RPC de cierre aparte).
- PASO MANUAL PENDIENTE del operador humano: aplicar `apply_group_closure.sql` en
  Supabase remoto en ventana SIN partido vivo, con backup (no hay service key en el repo).
  Verificar por REST con anon key: RPC con token dummy -> P0001 (no PGRST202);
  `polla_group_closure?select=*` responde array.

### Tests
- `tests/group-close-preview.test.mjs` (offline, sin RPC real): deteccion de estados,
  preview de bonos, cierre idempotente (version++ sin duplicar), canOfferClose/Reopen,
  closureStale fuerza recerrar/reabrir, reapertura sin doble conteo. La verificacion de
  que la RPC valida sesion (P0001) es chequeo MANUAL del operador (requiere remoto).

## Status explicito del marcador vivo - 2026-06-12

- `buildState(targetMatch, home, away, targetStatus = "live")` en
  `admin.client.js`: ACTUALIZAR MARCADOR guarda `status: "live"` (es la
  promocion explicita pending→live) y FINALIZAR prepara el siguiente partido
  con `buildState(nextMatch, 0, 0, "pending")`.
- La tabla y estadisticas resuelven la fase con
  `lib/liveMatch/liveMatchPhase.js`; un 0-0 preparado nunca puntua antes de la
  hora del fixture. Compatible con filas viejas sin status confiable.
- Sin migracion SQL: el payload JSONB de `polla_live_match` ya acepta `status`.

## Estado vigente de cartones - 2026-06-12 (nomina cerrada)

- Nomina cerrada a 13 jugadores: Admin deriva de `predictions.json` 13/13
  cartones confirmados, 936 marcadores y cero pendientes.
- El KPI "Resultados oficiales" y el panel homonimo se actualizan en vivo
  desde `polla_official_results` via `subscribeLiveData` (admin.client.js,
  `initOfficialResultsKpi`); el mock solo es el valor SSR inicial.
- Felipe e Italo aparecen por el mismo pipeline compartido; no se agregaron
  KPIs, filas ni reglas manuales.
- La carga oficial sigue siendo `npm run predictions:build`.

## Estado de cartones oficiales - 2026-06-09

- Admin consume metadata de `predictions.json`.
- KPIs y panel de predicciones muestran cartones confirmados, marcadores,
  ultima importacion, nombres confirmados y pendientes.
- La carga sigue siendo versionada mediante `npm run predictions:build`.
- `PredictionsLoadedPanel` genera códigos temporales por jugador, permite
  copiarlos una sola vez y revocar códigos o sesiones activas.
- Los códigos duran 30 minutos para canje y las sesiones de corrección dos
  horas. Generar un código nuevo revoca permisos anteriores del jugador.
- RPC y tablas: `supabase/migrations/20260609193000_prediction_edit_access.sql`.

## Fase 10 - Simplificacion arcade
Admin organizado como sidebar, sesion protegida, KPIs, estado del sistema y control global del marcador.

## Ruta
/admin

## Función
Centro técnico de control de la Polla Mundialera SECPLAN 2026.
El gate valida una sesion remota y el mini marcador escribe el estado global
mediante RPC protegidas de Supabase.

## Componente principal
AdminSection.astro

## CSS local
AdminSection.module.css

## Subcomponentes Astro
- AdminSidebar.astro — navegación interna administrativa, zona peligrosa y conexión.
- AdminSidebarItem.astro — item reutilizable del menú lateral.
- DangerousZone.astro — acciones críticas simuladas.
- AdminHeroHeader.astro — título `ADMIN PANEL` + centro de control.
- MiniLiveScoreControl.astro — mini control de marcador en vivo en el hero (reemplaza la card de sesión).
- SessionStatusCard.astro — (legacy, sin montar) sesión activa y perfil admin; ya no se renderiza en el hero.
- AdminKpiGrid.astro — grilla de seis métricas rápidas.
- AdminKpiCard.astro — card reutilizable de KPI.
- SystemStatusPanel.astro — modo de datos, Supabase, JSON local y API.
- RegisteredPlayersPanel.astro — chips y conteo de jugadores.
- PredictionsLoadedPanel.astro — partidos, cartones y total posible de predicciones.
- PendingRequestsPanel.astro — estado vacío de solicitudes.
- OfficialResultsPanel.astro — resultados cargados/pendientes.
- BackupExportPanel.astro — backup/exportación mock.
- ActivityLogPanel.astro — bitácora inferior.
- AdminActionButton.astro — botón local para acciones administrativas.

## Data
- src/data/players.json — 15 jugadores registrados.
- src/data/fixture.json — 72 partidos.
- src/data/admin-dashboard.json — estado base, solicitudes, backup y bitácora.

## Lógica
- admin.logic.ts:
  - buildAdminDashboardViewModel(players, matches, mock)
  - calcula jugadores registrados, cartones, partidos, resultados y total posible de predicciones.
- admin.client.js:
  - scoped a `[data-section="admin"]`
  - valida token remoto antes de habilitar el dashboard
  - actualiza/finaliza partidos mediante RPC Supabase
  - cambia estado visual del sidebar
  - muestra feedback local
  - pide confirmación para acciones críticas locales

## Comportamiento
- Navbar global marca `Admin` activo vía `aria-current="page"`.
- Sidebar interna contiene 9 ítems: Dashboard, Jugadores, Predicciones, Solicitudes, Resultados oficiales, Base de datos, Exportar / Backup, Bitácora, Sistema.
- Zona peligrosa separada: Reset local, Limpiar caché, Forzar recálculo.
- KPIs:
  - Jugadores registrados: 13
  - Cartones confirmados: 13 / 13
  - Predicciones cargadas: 72
  - Solicitudes pendientes: 0
  - Resultados oficiales: 0 / 72
  - Estado del sistema: OK
- Total posible de predicciones: 936 (13 x 72).

## Restricciones
- No exponer password, hash, `service_role` ni tokens Admin en el bundle.
- Las escrituras globales solo pueden pasar por RPC con sesion valida.
- No usar CSS global.
- No agregar React ni librerías UI.
- Acciones críticas son simuladas y requieren confirmación.
- No construir el dashboard como una imagen de fondo.

## Checklist
- [x] ruta /admin renderiza solo esta sección
- [x] Admin activo en navbar Clean V2
- [x] sidebar separada del navbar principal
- [x] KPI cards reutilizables
- [x] zona peligrosa separada
- [x] paneles administrativos en componentes
- [x] CSS local
- [x] datos iniciales desde JSON/mock
- [x] JS scoped a [data-section="admin"]

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- AdminSidebar: brand-mark `PM` -> `19-shield-secplan-blue-gold-star` (identidad).
- DangerousZone: glifo warning -> `11-badge-alert-orange-circle`.
- SystemStatusPanel: header -> `icon-checklist-blue`.

## Fase 12 - Mini marcador en vivo en el hero (2026-06-08)

Se reemplaza la card de sesión + botón "Cerrar sesión admin" del hero por
`MiniLiveScoreControl.astro` (control remoto de goles, arriba a la derecha).

- Componente: `MiniLiveScoreControl.astro`, con `<style>` scoped propio (sin CSS global, sin React).
  - Props: `match` (partido inicial resuelto en server, anti-CLS).
  - Marcador compacto + botones `+/-` por equipo + botón `ACTUALIZAR MARCADOR`.
  - Borde verde/cian cuando `data-status="live"`. Sin goles negativos (botón `-` deshabilitado en 0).
- Lógica de marcador: `admin.client.js` -> `initLiveScoreControl()`.
  - Hidrata desde `polla:liveMatchState` si existe; si no, `resolveCurrentMatch()` (en vivo/próximo) en 0-0.
  - `ACTUALIZAR MARCADOR` llama `saveLiveMatchState(state)` y dispara `polla:live-score-updated`.
- Contrato y helpers: `src/lib/liveMatch/liveMatchState.js`.
  - En esta fase historica se uso `polla:liveMatchState`; la Fase 14 lo deja
    como cache y mueve la autoridad a Supabase.
  - El fixture es calendario fijo: el control solo lee la lista slim, nunca modifica `fixture.json`.
- Logout eliminado: la sesión admin solo expira por tiempo (2h) o limpiando `sessionStorage`.
- `SessionStatusCard.astro` queda legacy (no se monta).

## Fase 13 - FINALIZAR partido -> oficiales acumulados (2026-06-08)

`MiniLiveScoreControl` gana un segundo botón `data-live-finalize` ("FINALIZAR PARTIDO").

- `ACTUALIZAR MARCADOR` (`data-live-update`) -> `saveLiveMatchState()` (provisional, mueve la tabla en vivo).
- `FINALIZAR PARTIDO` (`data-live-finalize`) -> `saveOfficialResult()` en `polla:officialResults` y avanza al próximo partido no finalizado en 0-0.
- El contrato de `liveMatchState` ahora incluye `matchId` (la tabla keyea por matchId).
- La tabla (`/tabla`) consume todo esto via `subscribeLiveData`. Ver flujo "Marcador en vivo (admin) -> Tabla dinamica" en el mapa principal.

## Fase 14 - Sesion admin y escritura Supabase (2026-06-08)

Esta fase reemplaza como estado vigente el storage local descrito en Fases 12-13.

- El password ya no esta hardcodeado en el bundle.
- `polla_admin_login` valida hash bcrypt y emite un token de dos horas.
- El navegador guarda solo token/expiracion en `sessionStorage`.
- `ACTUALIZAR MARCADOR` usa RPC sobre `polla_live_match`.
- `FINALIZAR PARTIDO` guarda resultado + siguiente partido atomicamente.
- Las tablas son publicas solo para SELECT; las escrituras pasan por RPC.
- Migracion y runbook: `supabase/migrations/20260608170000_polla_live_realtime.sql`
  y `supabase/README.md`.
