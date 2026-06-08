# 10_admin — Mapa técnico

## Estado
wireframe-implemented

## Fase 10 - Simplificacion arcade
Admin reducido a sidebar, sesion, 4 KPIs, estado del sistema y feedback. Se retiraron paneles operativos secundarios y bitacora.

## Ruta
/admin

## Función
Centro técnico de control de la Polla Mundialera SECPLAN 2026.
Renderiza un dashboard administrativo en Fase 2: datos mock/derivados,
sin login real, sin backend, sin escritura destructiva y sin import/export real.

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
- src/data/admin-dashboard.mock.json — sesión, sistema, solicitudes, backup y bitácora.

## Lógica
- admin.logic.ts:
  - buildAdminDashboardViewModel(players, matches, mock)
  - calcula jugadores registrados, cartones, partidos, resultados y total posible de predicciones.
- admin.client.js:
  - scoped a `[data-section="admin"]`
  - cambia estado visual del sidebar
  - muestra feedback local
  - pide confirmación para acciones críticas y no muta datos reales

## Comportamiento
- Navbar global marca `Admin` activo vía `aria-current="page"`.
- Sidebar interna contiene 9 ítems: Dashboard, Jugadores, Predicciones, Solicitudes, Resultados oficiales, Base de datos, Exportar / Backup, Bitácora, Sistema.
- Zona peligrosa separada: Reset local, Limpiar caché, Forzar recálculo.
- KPIs:
  - Jugadores registrados: 15
  - Cartones confirmados: 0 / 15
  - Predicciones cargadas: 72
  - Solicitudes pendientes: 0
  - Resultados oficiales: 0 / 72
  - Estado del sistema: OK
- Total posible de predicciones: 0 / 1008.

## Restricciones
- Fase 2 wireframe: sin auth real, Supabase, backend, roles reales ni escrituras.
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

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

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
- Contrato y helpers: `src/lib/liveMatch/liveMatchState.js` (seam único para futuro Supabase).
  - Storage key: `polla:liveMatchState` (localStorage).
  - El fixture es calendario fijo: el control solo lee la lista slim, nunca modifica `fixture.json`.
- Logout eliminado: la sesión admin solo expira por tiempo (2h) o limpiando `sessionStorage`.
- `SessionStatusCard.astro` queda legacy (no se monta).

## Fase 13 - FINALIZAR partido -> oficiales acumulados (2026-06-08)

`MiniLiveScoreControl` gana un segundo botón `data-live-finalize` ("FINALIZAR PARTIDO").

- `ACTUALIZAR MARCADOR` (`data-live-update`) -> `saveLiveMatchState()` (provisional, mueve la tabla en vivo).
- `FINALIZAR PARTIDO` (`data-live-finalize`) -> `saveOfficialResult()` en `polla:officialResults` y avanza al próximo partido no finalizado en 0-0.
- El contrato de `liveMatchState` ahora incluye `matchId` (la tabla keyea por matchId).
- La tabla (`/tabla`) consume todo esto via `subscribeLiveData`. Ver flujo "Marcador en vivo (admin) -> Tabla dinamica" en el mapa principal.
