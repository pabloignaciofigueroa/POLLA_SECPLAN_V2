# Design — Arcade Luminoso (elevado)

Fuente única de verdad del idioma visual. Sintetiza las 15 skills de
`.agents/skills/` en UNA dirección coherente, anclada a los tokens ya
comprometidos en [tokens.css](src/styles/tokens.css). Formato Stitch DESIGN.md +
reglas `impeccable`. **Identity-preservation manda:** donde una skill choca con
la identidad existente, gana la identidad (overrides documentados abajo).

---

## 1. Atmósfera

Un marcador electrónico de estadio en modo día: tablero claro, luminoso, con
acentos de neón controlados. Energía de arcade y álbum de figuritas, no de casa
de apuestas ni de dashboard sobrio. Festivo, competitivo, legible.

**Dials** (escala 1-10, base de las taste-skills 8/6/4, ajustada por registro):

| Dial | Brand (inicio, reglas, equipos, partido) | Product (predicciones, tabla, fixture, estadísticas, admin) |
|---|---|---|
| Variance | 7 | 4 |
| Motion | 6 | 3 |
| Density | 4 | 7 |

Las páginas-herramienta bajan variance/motion y suben densidad (lente brutalista
de telemetría). Las páginas-poster suben variance/motion (lente high-end + gpt-taste).

---

## 2. Color

Paleta "arcade luminosa" ya definida en tokens; **no se reemplaza, se disciplina**.
Base clara, azul tinta estructural, y acentos de neón usados como **código
semántico** (sección / grupo / estado), nunca como arcoíris decorativo.

### Neutrales base
| Rol | Token | Hex |
|---|---|---|
| Canvas | `--pm-smoke` | `#F6F8FB` |
| Panel | `--pm-panel-soft` / `--pm-white` | `#F8FBFF` / `#FFFFFF` |
| Hielo / sutil | `--pm-ice` | `#EAF1F8` |
| Tinta texto | `--pm-text-main` | `#071735` |
| Estructura oscura (navbar) | `--pm-blue-900` | `#061326` |

### Acentos (semánticos)
- **Azul** `--pm-blue-500 #126DFF` / `--pm-blue-600 #005BFF` — estructura, links, activo.
- **Cian** `--pm-cyan-500 #18DDF2` — selección, foco, energía secundaria.
- **Amarillo/Oro** `--pm-yellow-500 #FFD21F` (CTA rey) — **acción principal, uno por vista**.
- **Verde/Mint** `#22C55E / #21D99A` — éxito, confirmado, acierto.
- **Morado** `--pm-purple-500 #7C35FF` — bloqueado/finalizado, sección reglas/estadísticas.
- **Rojo/Coral** `--pm-red-500 #FF4058` — error, en vivo, alerta.
- **Neón fluor** (lime/pink/magenta/orange) — solo acento puntual de grupo/estado, < 10% de superficie.

### Reglas de color (consolidado impeccable + taste + minimalist + redesign)
- **CTA rey = solo amarillo.** Una sola intención de acción primaria por página
  (regla "no duplicate CTA intent"). El resto de botones, secundarios neutros.
- **Un acento de sección domina la página** (`--section-accent` local). El neón
  extra es chispa, no fondo.
- Texto cuerpo nunca `#000`; usar `--pm-text-main #071735`. Texto sobre fondo de
  color: usar sombra propia del hue o blanco/tinta con contraste verificado.
- Estado nunca por color solo: acompañar con ícono/etiqueta (a11y, daltonismo).
- Gradientes permitidos como identidad de marca (CTA, podio, section-gradient);
  **prohibido `background-clip:text` decorativo** (gradient-text) — ban impeccable.

### Sombras
Tintadas al hue, ya tokenizadas (`--pm-shadow-card`, `--pm-shadow-cyan`, etc.).
Nunca negro puro. No emparejar `border 1px` + sombra ancha ≥16px en el mismo
elemento (ghost-card ban de impeccable/codex): elegir una.

---

## 3. Tipografía

Tres familias self-hosted, **se conservan** (override explícito a los bans de
Inter de minimalist/high-end/gpt-taste/brutalist — identidad comprometida):

| Rol | Familia | Token | Uso |
|---|---|---|---|
| Display | Barlow Condensed (700–900) | `--font-display` | Titulares, gritos de marca, mayúsculas |
| UI / cuerpo | Inter (400–800) | `--font-ui` | Texto, labels, botones, navegación |
| Marcador | Rajdhani / Barlow | `--font-score` | Números, marcadores, posiciones, datos |

### Reglas (impeccable + redesign + minimalist + brutalist)
- Jerarquía por **escala + peso**, contraste ≥1.25 entre pasos. Escala fluida ya
  tokenizada (`--type-mega … --type-micro`).
- **Techo de display:** la portada puede usar `--type-hero/--type-mega`, pero el
  H1 nunca supera 2–3 líneas (regla gpt-taste). Si desborda: bajar `clamp` o
  acortar copy, nunca dejar 4+ líneas.
- **Letter-spacing display:** piso `-0.04em` (no más apretado; impeccable).
- Cuerpo: ancho máx 65–75ch, `line-height` ~1.6.
- **Números = tabular** (`font-variant-numeric: tabular-nums`) o `--font-score`
  en tablas, marcadores y estadísticas (lente brutalista/redesign).
- Mayúsculas solo en labels cortos (≤4 palabras), gritos de marca y badges.
  Nada de párrafos en ALL CAPS.
- `text-wrap: balance` en h1–h3; `text-wrap: pretty` en prosa larga.

---

## 4. Componentes (estados completos — full-output-enforcement)

Cada componente interactivo define **default / hover / active / focus-visible /
disabled** y, donde aplique, **loading / empty / error**. Estados ya tokenizados
en `--pm-state-*`.

- **CTA rey (ArcadeButton primario):** placa amarilla, texto tinta `#061326`,
  `:active { transform: scale(0.97) }` (Emil), foco `--pm-focus-ring-yellow`.
  Label = verbo + objeto, 1–2 palabras, una sola línea (no wrap en desktop).
- **Botón secundario:** superficie neutra/borde, mismo radio, sin competir con el rey.
- **ArcadeCard:** radio 12–16px (`--pm-radius-md`; **no** 24/32px en cards —
  override de over-rounding de codex; los radios xl/pill quedan para
  contenedores grandes/tags). Sombra tintada, sin doble-borde+sombra. Cards solo
  cuando la elevación comunica jerarquía; si no, separar con `border-t`/espacio.
  **Nunca cards anidadas** (impeccable).
- **StatusPill:** color + ícono + texto (estado nunca solo color).
- **Tablas/telemetría (tabla, estadísticas, fixture):** densidad alta, números
  tabulares, filas separadas por hairline `--pm-border-soft`, sin caja por celda;
  agrupar en chunks, no 20 filas con borde en cada una (lente brutalist+minimalist).
- **Inputs (predicciones ScoreInput, admin):** label arriba, helper en markup,
  error abajo; `:focus-visible` con anillo; placeholder con contraste 4.5:1; nunca
  placeholder-as-label.
- **Marquee/banderas:** loop CSS ya existente; respeta `prefers-reduced-motion`.
  Máx 1 marquee por página (gpt-taste).

---

## 5. Layout

- Estructura por-ruta (no scroll-landing). Common: Header + Footer.
- Contención de ancho con max-width centrado; grid para 2D, flex para 1D.
- **Bento sin huecos** (gpt-taste): tantas celdas como contenido; `grid-flow-dense`
  cuando aplique; nada de celda vacía.
- **Anti-repetición de layout** (taste): una familia de layout aparece máx 1 vez
  por página; en multi-sección, ≥ varias familias distintas.
- Hero (inicio): `min-h-[100svh]` (ya usado), no `h-screen`; CTA visible sin scroll.
- Mobile: cada layout multi-columna declara su colapso `<900px` (ya presente en
  varias secciones); asimetrías colapsan a 1 columna `w-full`.
- Ritmo de espaciado variado; secciones brand respiran (`--space-xl/2xl`),
  herramientas más compactas.
- **Eyebrows con disciplina** (impeccable + taste): máx 1 cada 3 secciones; no
  poner kicker mayúscula sobre cada bloque. Sin marcadores "01/02/03" salvo
  secuencia real (los StepCards de inicio SÍ son secuencia legítima).

---

## 6. Motion (CSS nativo — sin Motion/GSAP)

Traducción del motion de las skills a CSS, gobernada por Emil:

- **Easing fuerte, no los CSS débiles.** Curvas: `--ease-out: cubic-bezier(0.23,1,0.32,1)`,
  `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`.
  Entradas/salidas = ease-out. Nunca ease-in en UI.
- **Duración:** feedback botón 100–160ms; tooltips/popovers 125–200ms;
  dropdowns 150–250ms; modales/drawers 200–360ms. UI bajo 300ms.
- **Propósito obligatorio:** cada animación comunica jerarquía/feedback/estado.
  Nada de loops infinitos "porque sí".
- Animar solo `transform` y `opacity`. Nunca `scale(0)`: entrar desde `0.95`+opacity.
- Reveal en scroll con `IntersectionObserver` o `@starting-style`; **el contenido
  es visible por defecto** (no gatear visibilidad a una clase JS).
- `transition: transform …`, propiedades explícitas, nunca `transition: all`.
- `prefers-reduced-motion`: crossfade/instantáneo, sin movimiento de posición.
- Popovers origin-aware; modales centrados.

---

## 7. Anti-patterns (refuse-and-rewrite — unión de las skills)

- Em-dashes (`—`/`--`) como recurso de diseño o en copy. Usar coma/dos puntos/punto.
- Gradient-text decorativo (`background-clip:text`).
- Eyebrow mayúscula sobre cada sección; marcadores numéricos por reflejo.
- Card-grids idénticos repetidos; cards anidadas; over-rounding (24/32px en cards).
- `border 1px` + `box-shadow` ancha en el mismo elemento (ghost-card).
- Side-stripe borders (border-left de color >1px como acento).
- Negro puro `#000`; texto gris lavado sobre fondo claro (contraste < 4.5:1).
- Fake-precision numérica inventada sin dato real (marcar mock si lo es).
- SVG sketch/doodle hechos a mano; div-fake-screenshots.
- Copy buzzword: "Elevate/Seamless/Unleash/Next-Gen/Game-changer/Delve…".
- Nombres genéricos "John Doe / Acme"; usar nombres y datos contextuales.
- Inter purple-glow de IA, mesh genérico morado-azul.

---

## 8. Overrides de skills (conflictos resueltos)

| Skill dice | Decisión aquí | Por qué |
|---|---|---|
| minimalist/high-end/gpt-taste: **banear Inter** | Se conserva Inter (UI) | Identidad comprometida + fuentes self-hosted ya optimizadas |
| brutalist: **exigir Inter Black + dark/mono total** | Solo como lente de densidad/grilla en páginas-herramienta | El producto es festivo-claro, no terminal militar |
| minimalist: **prohibir gradientes y pills grandes** | Gradientes de marca (CTA/podio) permitidos; pills para tags/botones | Son parte del idioma arcade ya tokenizado |
| design-taste/redesign: **default React/Tailwind/Motion** | Astro + CSS Modules, motion en CSS | Stack real del proyecto; sin nuevas deps pesadas |
| impeccable: **cream-bg es el AI-default a evitar** | N/A — el bg es azulado-claro `#F6F8FB`, no cream | Ya cumple |
| brandkit/imagegen/image-to-code: **generar imágenes** | Briefs de arte en texto | Decisión del usuario en este run |

---

## 9. Verificación por página (checklist)

Antes de dar una página por lista:
1. Una sola intención de CTA primario (amarillo).
2. Contraste AA en cuerpo, datos, placeholders, botones.
3. Estados completos en interactivos (incl. focus-visible, disabled, error/empty).
4. Sin anti-patterns de §7. Eyebrows ≤ 1 cada 3 secciones.
5. Números tabulares en datos. H1 ≤ 3 líneas.
6. Motion con propósito, <300ms, con alternativa reduced-motion.
7. Colapso mobile declarado. Identidad arcade intacta (tokens, no hardcode).
