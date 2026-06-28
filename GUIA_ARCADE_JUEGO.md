# Guía Arcade — "Es un JUEGO, no un informe"

> Lente de juego para la Polla Mundialera. Complementa [DESIGN.md](DESIGN.md) (la biblia
> arcade-luminosa). DESIGN.md dice **cómo se ve**; esta guía dice **cómo se SIENTE: como un
> juego arcade**, no como una tabla de datos. Todo lo que cita ya existe en el repo (rutas,
> clases, tokens verificados). Nada inventado.

---

## 0. Veredicto

Inicio, Reglas y Jugador se sienten **juego**: entran con movimiento, hay un foco grande, el color
grita, se lee de un vistazo y al tocar **responden**. Tabla, Próximo y Estadísticas tienen buena
data pero se sienten **informe**: "acá está la info" en una tabla/lista quieta. Misma data, cero
juego.

La regla madre:

```txt
CADA PANTALLA ES UNA PANTALLA DE JUEGO, NO UN REPORTE.
- Jugador      = CHARACTER SELECT (elegí tu peleador)
- Próximo      = VS SCREEN (el duelo)
- Tabla        = ESCALERA / HIGH-SCORE (el ranking arcade)
- Estadísticas = STAT CARDS / DATA ARENA
- Llave        = TOURNAMENT BRACKET
- Predicciones = PICK SCREEN (armá tu cartón)
```

**"Street Fighter" = la ENERGÍA y los PATRONES de juego, no un skin oscuro.** La identidad sigue
**clara** (arcade-luminoso, DESIGN.md §1, identity-preservation manda). No se vuelve dark/CRT. El
juego está en: entrada con impulso, foco, color semántico, feedback físico al tocar, y números que
**viven**.

> **Ojo dial (DESIGN.md §1):** las páginas-producto (tabla, fixture, estadísticas, admin) son
> Motion **3** / Density **7**. Game-feel ahí **no** es animar todo siempre: es **impacto PUNTUAL**
> (un número que salta cuando cambia, una fila que sube cuando escala) + framing de HUD + color +
> medallas. Loops permanentes y fuegos artificiales son para las páginas-brand (inicio/reglas).

---

## 1. El test del juego (6 preguntas)

Si una sección falla 3+, es informe, no juego:

1. **¿Entra con movimiento?** ¿Los bloques aparecen escalonados (no todos de golpe, no estáticos)?
2. **¿Hay UN foco grande?** ¿Un héroe/3D/título gigante que manda, o todo es del mismo tamaño?
3. **¿Da feedback al tocar?** hover/active/selected con cambio físico (scale/glow), no solo color.
4. **¿Los números VIVEN?** ¿Cuentan hacia arriba, saltan al cambiar (`.is-score-pop`), o son texto muerto?
5. **¿Se lee de un vistazo?** pocas cosas grandes y jerarquizadas, no 13 filas iguales.
6. **¿Se siente físico?** scale-pop, spring, snap, glow — peso y "golpe", no fade plano genérico.

---

## 2. Los 6 pilares del game-feel (lo que hacen bien Inicio/Reglas/Jugador)

| Pilar | Qué es | Dónde vive hoy (real) |
|---|---|---|
| **RÁPIDO** | Entrada escalonada, easing fuerte, 140–560ms | `[data-animate]`+`[data-stagger]` (`StepCards.astro`), `motion.js` IntersectionObserver, `--ease-out` / `--pm-spring-out` |
| **VISUAL** | Un foco grande + capas decorativas | `TrophyStage.astro` (rays/glow/shine/sparkles), título `clamp(4rem,9.6vw,8.8rem)` skew+gradiente (`HeroCopy.astro`) |
| **COLORFUL** | Color como **código semántico**, no arcoíris | `data-tone` por step (`StepCards.astro`), `rule-card--<color>` (`RuleCard.astro`), section-accent |
| **SIMPLE** | Pocas cosas grandes, 1 idea por bloque | máx 4 StepCards, 5 RuleCards, títulos de 1 palabra, line-height 0.82 |
| **IMPACTO** | Feedback de "golpe" al actuar | clases `.is-*` (ver §4), CTA hexagonal `:active{scale(0.985)}` (`PrimaryCTA.astro`) |
| **FÍSICO** | Spring/overshoot, snap, glow | `--pm-spring-out: cubic-bezier(0.34,1.56,0.64,1)`, burst dorado del select (`PlayerCard.astro`) |

---

## 3. El toolkit reutilizable (YA existe — solo recomponer)

### 3.1 Los "arcade moments" (`styles/animations.css`) — el kit de golpes

Se disparan agregando la clase por JS (en el `*.client.js` de la sección). Para re-disparar:
`el.classList.remove(c); void el.offsetWidth; el.classList.add(c);`

| Clase | Keyframe / dur | Cuándo usarla |
|---|---|---|
| `.is-score-pop` | scorePop 460ms spring (1→1.28→1) | **Un número cambió** (puntos, marcador) |
| `.is-row-rise` | rowRise 900ms (bg oro→transparente) | **Una fila escaló** en el ranking |
| `.is-countdown-tick` | countdownTick 320ms (1.18→1) | **Tick** del reloj / cuenta regresiva |
| `.is-live-pulse` | livePulse 1.5s ∞ (anillo rojo) | Indicador **EN VIVO** (único loop permitido en producto) |
| `.is-selected-burst` | selectedBurst 620ms (glow dorado) | **Selección** (card elegida) |
| `.is-check-pop` | checkPop 380ms spring (0→1.25→1) | Aparece **check / voto** |
| `.is-saved-punch` | savedPunch 460ms spring | **Guardado / confirmado** |
| `.is-unlock-burst` | unlockBurst 620ms (explota+fade) | **Desbloqueo** de contenido |
| `.is-feedback-flash` | feedbackFlash 420ms | Nudge de **feedback** (admin) |
| `.is-swap-in` | fadeUp 560ms | **Swap** de contenido (filtros) |

### 3.2 Entrada en scroll + count-up (`scripts/motion.js`)

- **Entrada:** `data-animate="fade-up|pop-in|deal-in|scale-in|slide-in-left|slide-in-right"` +
  `style="--i:N"` para escalonar. `motion.js` agrega `.in-view` al entrar al viewport (threshold 0.12).
  Contenedor con `[data-stagger]` para cascada (delay `--pm-stagger: 60ms`).
- **Count-up:** `data-countup="57"` (+ opcional `data-countup-duration`) → `motion.js` cuenta con
  easeOutCubic. **Todo número importante debería entrar contando.**
- Respeta `prefers-reduced-motion` (lo apaga). Contenido visible por defecto (sin gatear visibilidad).

### 3.3 Componentes arcade INFRAUTILIZADOS (`components/ui/`) — usarlos

| Componente | Variantes/tonos | Para |
|---|---|---|
| `ArcadeCard.astro` | default/highlight/locked/`solid-*`/striped/danger | stat cards, placas de partido, ítems con identidad de color |
| `StatusPill.astro` | live(con pulso)/finished/upcoming/completed/locked… | estado de partido/cruce (color **+ ícono + texto**, nunca solo color) |
| `ArcadeButton.astro` | primary(amarillo rey)/secondary/ghost/danger/success/info… | CTAs (1 primario amarillo por vista) |
| `SectionTitle.astro` | blue/purple/cyan/pink/orange | header con eyebrow + accent gradiente |
| `TeamFlag` / `TeamCrest` | xs..xl, rounded | identidad de equipo (banderas/escudos grandes) |

### 3.4 Iconos 3D (`lib/ui-assets/uiAssets.ts`)

- **HERO** (uno por sección, focal): `trophy`, `chart`, `stopwatch`, `shieldHandshake`, `ball`.
- **AWARD** (solo ranking/podio): `rank1/2/3`, `medal1/2/3`, `top10`, `shieldStar`.
- **STATUS** (solo estados): `live`, `finished`, `calendar`, `orbCommunity`, `orbChecklist`.
- **MOVEMENT** (tendencia): `up`, `down`, `neutral`.
- **INLINE** (chico): `podium`, `trophy`, `checklist`, `star`, `fire`, `live`.

### 3.5 Tokens + helpers

- Rank: `--pm-rank-gold #FFD21F`, `--pm-rank-silver #C7D2E5`, `--pm-rank-bronze #C9823B` (+ `-bg` gradientes).
- Grupo: `--pm-group-a … --pm-group-l` (color por grupo). Números: `--font-score` (Rajdhani, tabular).
- Easing/dur: `--ease-out`, `--pm-spring-out`, `--pm-dur-entrance 560`, `--pm-dur-pop 420`, `--pm-stagger 60`.
- Datos para viz: `lib/statistics/buildScoreRaceTimeline.js` (carrera de puntaje + paleta por jugador),
  `buildChangeEvents.js` (deltas de posición ↑/↓), `score-race.client.js`.

---

## 4. Anti-patrones "informe" (refuse-and-rewrite)

Si aparece esto, **reescribir** a su forma de juego:

- `<table>` plano con `<tr>` iguales y `#` en texto → **escalera** con podio, medallas y glow.
- Número **estático** (puntos, "0/4", marcador) → **count-up** + `.is-score-pop` al cambiar.
- "VS" como texto naranja quieto → **VS screen**: glint, pulso, entrada de cada equipo.
- Cuenta regresiva como `<span>` plano → reloj con `.is-countdown-tick` + `STATUS.live`.
- **Lista-bulletin** (`<ul><li>`) para resultados/consenso → placas/cards o **barras de votación**.
- Card sin ícono ni color de sección → `ArcadeCard` + icono `HERO/INLINE` + accent.
- Sección que aparece **toda de golpe** → `[data-animate]`+`[data-stagger]` por bloque.
- Estado por color solo → `StatusPill` (color + ícono + texto).

---

## 5. Playbook por sección — BEFORE → AFTER (con ingredientes exactos)

### 5.1 TABLA → "Escalera / High-Score" 🏆
**Hoy:** `13_tabla/TablaKnockoutSection.astro` = `<table>` con `#/Jugador/Pts`, posición en texto `—`,
solo el líder con bg amarillo pálido. Cero entrada, cero medallas, números muertos.

**Juego:**
- **Podio 1-2-3 destacado** arriba (no fila de tabla): `AWARD.medal1/2/3` o `rank1/2/3`, marco
  `--pm-rank-gold/silver/bronze` con glow; el #1 más grande (foco).
- **Resto = escalera**: filas que **entran escalonadas** (`[data-stagger]` + `.is-swap-in` al recalcular).
- **Puntos vivos**: `data-countup` + `.is-score-pop` cuando el puntaje sube; `--font-score` tabular.
- **Movimiento**: flecha `MOVEMENT.up/down/neutral` por jugador (de `buildChangeEvents`), y `.is-row-rise`
  (flash dorado) en la fila que escala.
- **Identidad**: avatar del jugador como "personaje" (ya hay `p.avatar`), no solo nombre.
- Accent de sección = `--pm-sec-tabla-a` (magenta). HERO opcional: `HERO.trophy` de fondo focal.

### 5.2 PRÓXIMO → "VS Screen" ⚔️
**Hoy:** `06_proximo_partido/ProximoSection.astro` = grid `equipo | VS | equipo` estático, countdown
texto plano, "VS" naranja quieto, resultados recientes en `<ul><li>`.

**Juego:**
- **Entrada cinemática**: equipo local `slide-in-left`, visitante `slide-in-right`, "VS" `pop-in`
  con glint (sweep) y micro-pulso. Es EL duelo.
- **Banderas/escudos grandes** (`TeamFlag size="xl"` o `TeamCrest`), nombre display gigante.
- **Reloj arcade**: countdown con `.is-countdown-tick` cada segundo + `STATUS.live`/`STATUS.calendar`;
  cerca de la hora, `.is-live-pulse`. Focal `HERO.stopwatch`.
- **Stake** ("el ganador avanza a Octavos") como banda HUD, no texto suelto.
- **Resultados recientes = placas** (mini-cards con `StatusPill="finished"` + marcador `--font-score`),
  no lista con viñetas.
- Accent = `--pm-sec-partido-a` (naranja/rojo). Energía alta (es la pantalla más "hype").

### 5.3 ESTADÍSTICAS → "Data Arena / Stat Cards" 📊
**Hoy:** `09_estadisticas/EstadisticasSection.astro` = 3 `.es-card` planas, números `0`/`0/4` muertos,
consenso en `<ul><li>` tipo FAQ.

**Juego:**
- **Stat cards = ArcadeCard** (`highlight`/`solid-*`) con **ícono** por métrica: `INLINE.checklist`
  (cruces), `AWARD.shieldStar`/`INLINE.podium` (podio), `HERO.chart`/`INLINE.fire` (puntos). Entrada
  `pop-in` escalonada.
- **Números vivos**: `data-countup` + `.is-score-pop`; `--font-score`.
- **Consenso = barras de votación** (cuántos hacen pasar a A vs B por cruce): barra `--pm-cyan/blue`,
  `.is-check-pop` al revelarse, badge de "consenso líder". No lista de texto.
- **Score-race**: usar `buildScoreRaceTimeline` (+ `score-race.client.js`) para un gráfico de carrera
  de puntaje por jugador (data arena de verdad).
- Focal `HERO.chart`. Accent = `--pm-sec-estadisticas-a` (morado).

### 5.4 LLAVE y ADMIN
- **LLAVE**: ya es bracket (árbol espejo). El "diseño hard" del nodo/conectores/**ceremonia del
  centro** vive en `workflow_2026-06-27_diseno_llave_hard.md`. Aplica los pilares §2 ahí.
- **ADMIN**: es **sala de control** (operación, no show). Game-feel mínimo y útil: `.is-feedback-flash`
  al guardar, `.is-saved-punch` en confirmaciones, `StatusPill` de estado. **No** sobre-decorar.

---

## 6. Reglas de oro

**SÍ**
- Reframear cada sección como una **pantalla de juego** (§0) antes de maquetar.
- Un **foco grande** por pantalla (héroe/podio/VS), el resto subordinado.
- Números que **entran contando** y **saltan** al cambiar.
- **Impacto puntual** con `.is-*` en el evento real (no loop por decorar, salvo `live`).
- Color **semántico** (rank/grupo/estado/sección), reusando tokens.
- Reusar `ArcadeCard/StatusPill/ArcadeButton` + iconos `uiAssets` (dejar de maquetar a mano).

**NO**
- `<table>`/`<ul>` planos como producto final; números estáticos; VS/countdown sin vida.
- Animar todo siempre en páginas-producto (Motion=3): es golpe puntual, no fuegos artificiales.
- Romper la identidad clara (nada dark/CRT). Sin ghost-card (borde **o** sombra). Sin gradient-text decorativo.
- Tocar los `data-*`/hooks de hidratación de los clientes al re-maquetar (la data sigue cargando igual).

---

## 7. Checklist "¿se siente juego?" (extiende DESIGN.md §9)

Antes de dar una sección por lista, además del checklist de DESIGN.md §9:

1. Pasa **el test del juego** (§1): ≤2 fallas.
2. Hay **un foco** claro (no todo del mismo peso).
3. **Entrada escalonada** declarada (`[data-animate]`/`[data-stagger]`), con `reduced-motion` OK.
4. Cada **número** clave: count-up + `.is-score-pop` al cambiar.
5. Cada **estado** con `StatusPill` (color+ícono+texto), no color solo.
6. Reusa **componentes/iconos/tokens** existentes (cero hardcode nuevo de color).
7. Motion acorde al **dial** de la página (producto = puntual; brand = más).
8. Hooks de hidratación **intactos**; build verde; identidad clara intacta.

---

## 8. Orden sugerido de aplicación
`PRÓXIMO (VS, el más hype y acotado) → TABLA (escalera/podio) → ESTADÍSTICAS (data arena) → LLAVE
(workflow propio) → ADMIN (mínimo)`. Una sección por vez, build verde + screenshot por gate.
