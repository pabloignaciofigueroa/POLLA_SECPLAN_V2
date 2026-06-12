# 04_predicciones - Mapa tecnico

## Estado
wireframe-implemented

## Felipe e Italo oficiales (reemplazan a Daniel y Martin) - 2026-06-12

- El rebuild canonico carga 13/15 cartones, 936 marcadores y 312 posiciones
  clasificatorias, con cero errores de validacion.
- `felipe` e `italo` usan el mismo flujo `official-locked` / `official-editing`
  que los demas cartonistas; no hay un sistema paralelo.
- Los dos pendientes vigentes son Gonzalo y Ratinha.

## Isaias y Jaime oficiales - 2026-06-10

- El rebuild canonico cargaba 11/15 cartones, 792 marcadores y 264 posiciones
  clasificatorias, con cero errores de validacion.
- `isaias` y `jaime` usan el mismo flujo `official-locked` / `official-editing`
  que los demas cartonistas; no hay un sistema paralelo.

## Cartón oficial protegido - 2026-06-09

- Los jugadores importados ven sus 72 marcadores y 24 clasificados desde
  cualquier dispositivo.
- `lib/predictions/predictionAccess.js` resuelve `pending`,
  `official-locked` y `official-editing`.
- Un código Supabase de un solo uso habilita una sesión de corrección de dos
  horas; dispone de 30 minutos para ser canjeado.
- La corrección vive en `polla:predictionCorrectionDrafts`, separada del cartón
  canónico y de los borradores ordinarios.
- La exportación agrega `replacesChecksum`, `correctionGeneratedAt` y
  `correctionPlayerId`.
- Si Supabase falla, expira o revoca la sesión, vuelve el cartón protegido.

## Funcion
Permitir que cada jugador complete las predicciones de los 72 partidos de fase de grupos. El 1er/2do lugar de cada grupo se calcula automaticamente desde los marcadores.

Regla madre: no existe polla incompleta. El JSON final solo se descarga cuando estan completos:

- 72 marcadores validos.
- 12 primeros de grupo calculados.
- 12 segundos de grupo calculados.

## Zonas implementadas
- prediction-hero-header
- progress-summary-grid
- group-tabs-navigation
- prediction-workspace
- matches-panel
- qualified-panel
- prediction-bottom-bar

## Sub-componentes principales
```txt
04_predicciones/
├── PrediccionesSection.astro
├── predicciones.client.js
├── predicciones.validation.js
├── predicciones.export.js
├── predicciones.standings.js
├── ProgressSummaryGrid.astro
├── GroupTabs.astro
├── PredictionWorkspace.astro
├── QualifiedPanel.astro
├── PredictionBottomBar.astro
└── SaveAndContinueCTA.astro
```

## Comportamiento
- Lee jugador desde `polla:selectedPlayerId` / identidad confirmada.
- Guarda marcadores en `polla:predictions`.
- Calcula tabla de grupo en vivo y guarda clasificados automaticos en `polla:qualifiedPredictions`.
- Guarda grupo activo en `polla:activePredictionGroup`.
- Los tabs A-L cambian grupo activo y muestran sus 6 partidos.
- Inputs aceptan solo enteros no negativos.
- El panel lateral muestra POS/EQUIPO/PTS/DG/GF y destaca 1°/2° cuando el grupo tiene 6 partidos completos.
- El boton `RESULTADO RANDOM` vive dentro del panel de clasificados y genera marcadores ponderados por H2H/info de equipos.
- El boton final queda gris hasta que `validateFullPrediction(...)` marca la polla completa.
- Al completar todo, el boton amarillo descarga el JSON local.
- Luego se guarda el bloqueo local con `polla:finalDownloaded*` y se deshabilitan inputs/random.

## Modulos ESM
- `predicciones.validation.js`: modulo puro sin DOM; valida grupo y polla completa con contadores 72/12/24.
- `predicciones.export.js`: construye el payload oficial, genera `predicciones_<jugador>_<YYYY-MM-DD_HH-mm>.json` y descarga con `Blob`.
- `predicciones.standings.js`: calcula tabla de posiciones, clasificados automaticos y resultados random ponderados.

## Storage
- `polla:predictions`
- `polla:qualifiedPredictions`
- `polla:activePredictionGroup`
- `polla:finalDownloaded`
- `polla:finalDownloadedAt`
- `polla:finalDownloadedFilename`
- `polla:finalSubmissionPayload`
- `polla:predictionCorrectionDrafts`
- `sessionStorage[polla:predictionEditSession]`

## JSON oficial
El payload incluye:

- `schemaVersion`
- `competition`
- `submittedAt`
- `player`
- `summary`
- `groupPredictions`
- `raw`

Los grupos siguen el orden A-L y los partidos se ordenan por `matchNumber`.

## Correcciones oficiales

Admin genera y revoca códigos desde `/admin`. El jugador descarga un JSON
corregido, pero el dataset no cambia automáticamente: Admin debe reemplazar el
archivo anterior, ejecutar `npm run predictions:build` y publicar. Mantener
ambos archivos hace fallar la importación por jugador duplicado.
