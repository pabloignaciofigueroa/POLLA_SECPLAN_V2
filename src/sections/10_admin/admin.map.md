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
- SessionStatusCard.astro — sesión activa y perfil admin.
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
