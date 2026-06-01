# 01_inicio — Mapa técnico

## Estado
wireframe-implemented

## Fase 10 - Simplificacion arcade
Portada reducida a hero, copa, CTA JUGAR y pasos minimos. Se elimino el contexto FIFA largo del hero para que la primera accion mande.

## Ajuste referencia arcade - portada
Se recupero la intencion de poster: badge azul con estrellas, titulo mas heroico, bajada emocional breve, pasos en mini cards con iconos, CTA como placa arcade amarilla, trofeo mas grande con pedestal/glow y ticker inferior mas coleccionable. Navbar intacto.

## Función
Apertura emocional y visual de la Polla Mundialera SECPLAN 2026.
Convierte al visitante en jugador a través del CTA principal.

## Zonas implementadas
- section-shell (InicioSection.astro)
- background-energy-layer (placeholder vacío)
- hero-content-grid
  - hero-copy (HeroCopy.astro)
    - title "POLLA MUNDIALERA"
    - subtitle decorado "— SECPLAN 2026 —"
    - description
  - step-cards (StepCards.astro) — 01 APRENDE / 02 ELIGE / 03 PREDICE / 04 GANA
  - primary-cta (PrimaryCTA.astro) — "JUGAR ▶" → /reglas
  - trophy-stage (TrophyStage.astro) — asset zone placeholder
- flag-marquee (FlagMarquee.astro)
  - summary "48 SELECCIONES" con ícono globo
  - viewport con mask-image fade en bordes
  - track animado 48×2 chips, loop infinito derecha→izquierda
  - phase-status "Fase de grupos · 72 partidos"
  - team-chip (TeamChip.astro) — marco placeholder + código FIFA

## Sub-componentes Astro
```
01_inicio/
├── InicioSection.astro          orquestador
├── InicioSection.module.css     grid 2-col + marquee
├── HeroCopy.astro
├── StepCards.astro
├── TrophyStage.astro
├── PrimaryCTA.astro
├── FlagMarquee.astro
└── TeamChip.astro
```

## Data
- `src/data/teams.json` — 48 selecciones del Mundial 2026 (id, name, shortCode, group, confederation)

## Assets pendientes
- `public/assets/trophy/` — imagen real de la copa (reemplaza TrophyStage placeholder)
- `public/assets/flags/<shortCode>.svg` — 48 banderas (reemplaza el marco placeholder en TeamChip)
- background-energy-layer — fondo arcade (reemplaza el div `.backgroundLayer` vacío)

## Comportamiento
- Marquee: animación `marquee-left` 60s linear infinite (45s en mobile)
- Hover desktop sobre marquee: `animation-play-state: paused`
- `@media (prefers-reduced-motion: reduce)`: animación desactivada
- Lista duplicada x2 dentro del track para loop sin salto visual

## Notas
- Estética actual = wireframe limpio (blanco + bordes + tipografía system).
- Colores arcade definidos en tokens.css pero NO aplicados todavía a componentes.
- Fonts arcade definitivas pendientes en fonts.css.
- CTA "JUGAR" dirige a /reglas (decisión del usuario en Fase 2).
- Texto correcto: "48 SELECCIONES" (no "16 países").

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- TrophyStage: copa hero -> `01_inicio/trophy-secplan-worldcup-gold.webp` (ratio 0.75, holder sin cambios).
- StepCards: 4 iconos SVG -> `02-icon-card-football-ball-blue` / `07-icon-card-players-blue` / `18-success-check-gold-energy` / `05-icon-card-trophy-gold`.
