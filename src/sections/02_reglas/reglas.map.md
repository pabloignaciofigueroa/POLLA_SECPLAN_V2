# 02_reglas — Mapa técnico

## Estado
wireframe-implemented

## Fase 10 - Simplificacion arcade
Primera vista reducida a hero, 5 reglas, puntajes y CTA. Se retiraron ChallengeMessage y FairPlayFooter de la experiencia renderizada.

## Ajuste referencia arcade - reglas
Se recuperan `ChallengeMessage` y `FairPlayFooter` como piezas livianas de composicion: desafio integrado junto al panel de puntajes y franja fair play inferior delgada. Las cards de reglas pasan de bloques solidos a posters glass con iconos SVG inline, numero superior y divisor interno. El CTA principal queda como placa arcade amarilla hacia `/jugador`. Se mantiene `LONE WOLF` como regla correcta del proyecto.

## Ajuste puntaje por grupo
`ChallengeMessage.astro` ahora funciona como panel de bonificacion por clasificados de grupo, conservando el icono de trofeo: elegir el 1ro del grupo suma +1 y elegir el 2do suma +3. La grilla inferior reduce el peso visual de `ScoringPanel` y da mas espacio al nuevo panel. El CTA secundario `ENTENDIDO` fue eliminado por duplicar `ELEGIR JUGADOR`.
El panel usa estilos inline criticos para evitar que una perdida/reinyeccion de CSS scoped/global lo deje crudo tras el primer render. `ScoringPanel` muestra el orden correcto: TENDENCIA +1, EXACTO +3, LONE WOLF +5.

## Función
Explicar rápidamente cómo se juega, cómo se puntúa y por qué Lone Wolf es una regla competitiva especial.
Debe ir antes de Jugador y Predicciones.

## Zonas implementadas
- section-shell
- background-stadium-layer
- background-energy-layer
- rules-hero-header
- rules-cards-grid
- scoring-panel
- group-bonus-panel (ChallengeMessage.astro)
- action-panel
- fair-play-footer

## Sub-componentes Astro
```txt
02_reglas/
├── ReglasSection.astro
├── ReglasSection.module.css
├── RulesHeroHeader.astro
├── RulesCardsGrid.astro
├── RuleCard.astro
├── ScoringPanel.astro
├── ScoringRow.astro
├── ChallengeMessage.astro
├── RulesActionPanel.astro
└── FairPlayFooter.astro
```

## Assets pendientes
- public/assets/backgrounds/bg-02-reglas-clean.webp — reemplaza el placeholder background-stadium-layer
- public/assets/ui/rules-icons/* — reemplaza icon placeholders de reglas y scoring

## Data
- Arreglos locales `rules` y `scoringRules` en `ReglasSection.astro`.
- No se crea JSON global todavía.

## Comportamiento
- CTA principal `ELEGIR JUGADOR` apunta a `/jugador`.
- Navbar compartido marca `/reglas` con `aria-current="page"`.
- Diseño responsive: 5 cards en desktop, grilla colapsable en tablet/mobile.

## Notas
- El panel de puntajes usa `LONE WOLF` y elimina la etiqueta anterior.
- Lone Wolf significa acierto exacto único entre todos los jugadores.
- La sección mantiene estética wireframe; arte final, fondos reales e iconos finales quedan pendientes.

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- RuleCard: 5 iconos SVG -> `02-icon-card-football-ball-blue` / `13-chart-growth-bars-gold-blue` / `icon-shield-star-blue` / `icon-lock-blue` / `05-icon-card-trophy-gold`.
- ScoringRow (EXACTO/TENDENCIA/LONE WOLF, labels intactos): `icon-target-goal-blue` / `icon-trend-up-green` / `mascot-wolf-purple`; chips suavizados a tinte claro.
