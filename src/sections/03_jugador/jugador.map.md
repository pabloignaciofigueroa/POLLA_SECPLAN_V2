# 03_jugador — Mapa técnico

## Estado
wireframe-implemented

## Isaias y Jaime oficiales - 2026-06-10

- `players.json` mantiene a ambos como jugadores seleccionables con sus avatares reales.
- `predictions.json` confirma sus cartones dentro del total dinamico de 11/15.
- El selector y `OfficialPlayerModal` derivan ese estado de las fuentes compartidas;
  no existen ramas, filas ni contadores manuales para estos jugadores.

## Cartones oficiales entre dispositivos - 2026-06-09

- La selección se cruza con las entregas confirmadas de `predictions.json`.
- Al confirmar un jugador oficial se guarda la identidad y se abre
  `OfficialPlayerModal.astro` con accesos a Estadísticas, Tabla y el cartón.
- El diálogo atrapa foco, cierra con Escape y restaura el foco al CTA.
- Cambiar o resetear identidad elimina sesiones y borradores de corrección.

## Iteracion arcade - referencia visual (2026-05-30)
Movimiento de piezas hacia referencia arcade compacta para first view. Sin cambios en storage, rutas, navbar ni JS.
- PlayerHeroPanel: quitado badge debug `03_jugador / seleccion`; agregado subtítulo de identidad; h1 reducido (tope 4.2rem).
- SelectedPlayerCard: marco dorado tipo trofeo (--pm-gold-500, --pm-gold-glow); placa azul con estrella; portrait compactado (tope 20rem).
- PlayersGrid: quitado panel-header (etiqueta debug "JUGADORES DISPONIBLES" + "player-cards-grid"); grilla limpia con aria-label accesible.
- PlayerCard: barra de nombre oscura integrada (fondo --pm-blue-900); estado seleccionado en dorado; literal "OK" reemplazado por check SVG inline; cards compactadas.
- PlayerSelectionCTA: forma pill (border-radius 999px); ícono balón SVG a la izquierda; CTA más compacto (tope 5rem).
- PlayerWarningNote: tono azul claro/blanco en vez de morado/cyan; caja con borde suave.
- JugadorSection.module.css: padding-block y gap reducidos para first view 1024–1440px.

## Fase 10 - Simplificacion arcade
Selector convertido en character select mas directo. Se retiro IdentityMessageCard y el aviso de bloqueo quedo como capsula compacta.

## Función
Identificar al participante. Convertir al visitante en jugador.
Pantalla funcional de selección de personaje antes de pasar a Predicciones.

## Zonas implementadas
- section-shell
- background-energy-layer
- player-selection-layout
- player-hero-panel
- selected-player-card-large
- identity-message-card
- players-grid-panel
- player-card
- selected-state
- action-zone
- primary-cta
- warning-note

## Sub-componentes Astro
```txt
03_jugador/
├── JugadorSection.astro
├── JugadorSection.module.css
├── PlayerHeroPanel.astro
├── SelectedPlayerCard.astro
├── IdentityMessageCard.astro
├── PlayersGrid.astro
├── PlayerCard.astro
├── PlayerSelectionCTA.astro
├── PlayerWarningNote.astro
```

## Assets pendientes
- avatars en public/assets/players/ (15 jugadores, ver 06_jugadores.md)
- background final de estadio para 03_jugador

## Data
- src/data/players.json — 15 jugadores iniciales con ids ASCII, nombre visible, avatar futuro y estado.

## Comportamiento
- Luis aparece seleccionado por defecto.
- Al seleccionar una card se actualiza el panel grande y el check.
- `IR A PREDICCIONES` guarda `polla:selectedPlayerId` y `polla:playerConfirmed` en localStorage.
- Al volver con selección confirmada, la grilla queda bloqueada visualmente.
- CTA principal apunta a `/predicciones`.
- Para un jugador oficial, el CTA abre primero el aviso de cartón confirmado.

## Notas
- 15 jugadores iniciales con slugs ya definidos.
- Se mantiene estética wireframe: placeholders explícitos, sin avatars reales ni arte final.
- El JS inline de `JugadorSection.astro` está encapsulado en `[data-section="jugador"]` y no toca otras secciones.

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- PlayerWarningNote: glifo `i` -> `icon-shield-star-blue` (identidad).
- IdentityMessageCard: placeholder `ID` -> `19-shield-secplan-blue-gold-star` (componente no montado en este snapshot; listo si se reactiva).
- Avatares reales de players.json NO se tocan.

## Martin incorporado (#15) - 2026-05-30

- Total jugadores: 15
- Nuevo jugador: Martin
- Asset: /assets/players/martin.webp (+ /assets/players/thumbs/martin.webp)
- Orden: despues de Jaime, antes de Narigon (alfabetico)
- id: "martin" (misma forma que el resto: id/name/avatar/avatarThumb/status; status "available")
- Estado: integrado (grilla seleccionable/confirmable; guarda "martin" en polla:selectedPlayerId)
- Propagacion automatica (deriva de players.json): tabla, predicciones, estadisticas, admin. En table-predictions.mock.json se agrego previousPositions["martin"]=15 para no marcarlo NEW.

## Hard reset de jugador

- Subcomponente local: `PlayerResetAction.astro`.
- Ubicacion visual: debajo de `PlayerSelectionCTA` y `PlayerWarningNote`, sin competir con el CTA principal.
- El JS sigue inline dentro de `JugadorSection.astro`, scoped a `[data-section="jugador"]`; no existe ni se agrega `jugador.client.js`.
- La accion abre modal visual y solo resetea al confirmar.
- El reset usa `resetPollaLocalState({ preserveIdentity: false })` y ademas limpia identidad espejo en `sessionStorage`.
- Elimina:
  - `polla:selectedPlayerId`
  - `polla:playerConfirmed`
  - `polla:selectedPlayerSnapshot`
  - `polla:predictions`
  - `polla:qualifiedPredictions`
  - `polla:activePredictionGroup`
  - `polla:favoriteTeams`
  - `polla:activePredictionGroupIntent`
  - `polla:predictionEditSession`
  - `polla:predictionCorrectionDrafts`
- Al confirmar redirige a `/jugador` para dejar la experiencia como primera entrada.
