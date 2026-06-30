# 🗺️ MAP.md — Mapa profundo del sitio (Polla Mundialera SECPLAN 2026 · Clean V2)

> **Para qué sirve este archivo:** es la *tabla de saltos* del proyecto. Antes de tocar algo,
> busca aquí "para cambiar X → toca Y" y vas directo al archivo correcto **gastando los menos
> tokens posibles** (no hace falta releer medio repo). Generado por mapeo automático del código real.
>
> **Cómo usarlo:** (1) mira la **Tabla de saltos** para ir de una ruta a sus archivos; (2) baja al
> **detalle de la sección** para subcomponentes, hooks `data-*`, gotchas y "para cambiar…"; (3) si tocas
> lógica de negocio, ve a **Capa lib (el cerebro)**. Mantén este mapa actualizado en el MISMO cambio
> (ver *Mantenimiento* al final).

---

## 🧭 Arquitectura en 30 segundos

- **Stack:** Astro **estático** (`astro build` → HTML, sin SSR runtime ni adapter), **GSAP** para motion,
  **Supabase opcional** (gated por env). 1 layout, 11 páginas, 10 secciones, capa `lib/` por dominio.
- **Patrón página → sección:** cada `src/pages/<ruta>.astro` solo importa `BaseLayout` + **una** sección
  `src/sections/NN_nombre/<Nombre>Section.astro`. Toda la UI vive en la sección.
- **Hidratación (el patrón que se repite):** el `.astro` renderiza SSR un *seed* y serializa un
  `<script type="application/json" data-<seccion>-payload>`; un `*.knockout.client.js` lo lee, **re-resuelve
  la llave con los resultados EN VIVO** (localStorage del admin, opcional Supabase) y **repinta** el DOM.
  El SSR nunca espera al live: pinta primero, el cliente repinta.
- **El "cerebro" está en `src/lib/knockout/`** — resolución del cuadro, puntaje, consenso, estado vivo.
  Las secciones casi no tienen lógica propia: orquestan libs + repintan.
- **Sin backend obligatorio ("modo seguridad total"):** la app corre 100% local con los JSON
  commiteados (`src/data/knockout-*.json` como *seed*) + `localStorage` como estado runtime.
  Supabase es una capa de lectura/realtime opcional con **fallback local automático**.
- **🌐 Supabase = fuente de verdad de RESULTADOS cross-device (2026-06-29):** cuando hay env
  (`PUBLIC_SUPABASE_*` — en `.env.local` y en Vercel), TODAS las secciones de resultados leen del SQL:
  `/admin` (siembra el form desde SQL + escribe), `/tabla`, `/fixture`, `/proximo`, `/estadisticas`.
  El helper compartido es **`src/lib/knockout/remoteResults.js`** (`attachRemoteResults` = pull + realtime,
  no-op si Supabase off). Sin env → cada uno cae a `liveResults.js` (localStorage+seed), idéntico a antes.
  Deploy = Vercel `polla-secplan-v2`. ⛔ Repo/deploy: SOLO `v2`/`polla-secplan-v2` (ver `hard-rule` en memoria).
- **⚠️ V2 = eliminatorias.** La app migró de *fase de grupos* (V1) a *eliminatorias* (R32→Final).
  Mucho código de la carpeta de cada sección y TODA `lib/statistics/` + `lib/tabla/` son **legacy/huérfanos**
  (ver sección *Estado V2 vs Legacy*). Los `*.map.md` viejos y `gotchas.md` describen en parte V1: **verifica
  contra el código antes de confiar en ellos.**

---

## 🗺️ Tabla de saltos — Ruta → archivos

| Ruta | Página | Sección raíz (`src/sections/…`) | Client JS (navegador) | lib clave (`src/lib/…`) | data clave (`src/data/…`) |
|---|---|---|---|---|---|
| **`/`** Inicio | `index.astro` | `01_inicio/InicioSection.astro` | `scripts/moments/inicio.js` *(solo deco)* | `ui-assets/uiAssets` | `teams`, `knockout-teams` |
| **`/reglas`** | `reglas.astro` ·🖥️ | `02_reglas/ReglasSection.astro` | — *(estático)* | `ui-assets/uiAssets` | — *(datos inline en el `.astro`)* |
| **`/jugador`** | `jugador.astro` | `03_jugador/JugadorSection.astro` | inline `<script>` + `scripts/moments/jugador.js` | `playerIdentity`, `storage/resetPollaState`, `predictions/predictionEditAccess` | `players`, `knockout-predictions`, `knockout-results` |
| **`/predicciones`** | `predicciones.astro` ·🖥️ | `04_predicciones/PrediccionesSection.astro` | `predicciones.knockout.client.js` (+ `predicciones.export.js`) | `knockout/{validation,canPredict,bracket,liveResults,scoring,podium,model}` | `knockout-matches`, `knockout-teams`, `teams`, `knockout-results`, `knockout-predictions` |
| **`/proximo-partido`** Próximo | `proximo-partido.astro` ·🖥️ | `06_proximo_partido/ProximoSection.astro` | `proximo.knockout.client.js` | `knockout/{schedule,bracket,canPredict,liveResults,model}` | `knockout-matches`, `teams`, `knockout-results` |
| **`/fixture`** 🏆 Llave | `fixture.astro` ·🖥️ | `07_fixture/FixtureSection.astro` | `fixture.bracket.client.js` + `bracket-tree.client.js` | `knockout/{bracket,bracketTree,canPredict,liveResults,model}` | `knockout-matches`, `teams`, `knockout-results` |
| **`/equipos`** | `equipos.astro` | `08_equipos/EquiposSection.astro` | — *(estático en vivo)* | `knockout/{bracket,canPredict}` | `teams`, `knockout-matches`, `knockout-results` |
| **`/estadisticas`** | `estadisticas.astro` | `09_estadisticas/EstadisticasSection.astro` | `estadisticas.knockout.client.js` | `knockout/{community,bracket,canPredict,scoring,liveResults}` | `players`, `knockout-matches`, `teams`, `knockout-results`, `knockout-predictions` |
| **`/admin`** | `admin.astro` | `12_admin/AdminKnockoutSection.astro` | `admin.gate.client.js` + `admin.knockout.client.js` | `knockout/{adminResult,bracket,canPredict,liveResults}`, `supabase/knockoutData` | `knockout-matches`, `knockout-teams`, `teams`, `knockout-results` |
| **`/tabla`** | `tabla.astro` ·🖥️ | `13_tabla/TablaKnockoutSection.astro` | `tabla.knockout.client.js` | `knockout/{scoring,bracket,schedule,canPredict,liveResults}`, `supabase/knockoutData` | `players`, `knockout-matches`, `teams`, `knockout-results`, `knockout-predictions` |
| **`/wireframe`** | `wireframe.astro` | `components/wireframe/*` *(dev tool)* | — | — | *(array inline)* |

🖥️ = `hideFooter` → **pantalla única sin scroll** en desktop/tablet (el contenido debe caber en el viewport).
Nav (orden Header): Inicio · Reglas · Jugador · Predicciones · **Próximo** · Tabla · **Llave** · Equipos · Estadísticas · Admin.

---

## ⚠️ Estado V2 (eliminatorias) vs LEGACY (grupos) — leer antes de borrar nada

> ✅ **LIMPIEZA 2026-06-29:** la mayoría de este código muerto YA FUE ELIMINADO (61 archivos):
> componentes huérfanos de 04/07/08/03, `lib/tabla/*`, `lib/admin/` (vacío), 15 JSON legacy/mock de
> `src/data/`, y la página dev **`/wireframe`** + sus componentes. Verificado con build (10 páginas) + tests (90).
> Lo de abajo queda como **registro histórico**. Lo que se CONSERVÓ (acoplado a tests): `lib/statistics/*`
> (3 archivos los usan `tests/score-race-timeline` y `stat-cards-rerank`), `lib/liveMatch/*`, `lib/scoring/*`.

La migración grupos→eliminatorias dejó **mucho código muerto** en su sitio (no se borró para no perder datos).
Estos archivos **NO** los usaba la página real; solo los referenciaba `src/pages/wireframe.astro` (índice dev) o tests:

- **Secciones — componentes huérfanos:**
  - `04_predicciones/`: todos los `*.astro` salvo `ScoreInput.astro` (lo usa el bracket). `PredictionWorkspace`, `MatchesPanel`, `MatchPredictionRow`, `ProgressCard`, etc. son del wireframe V1. El render real usa `07_fixture/BracketColumn`→`BracketMatchCard` en `mode="capture"`.
  - `07_fixture/`: huérfanos `FixtureHero/SummaryCards/Filters/ListPanel/DayGroup/MatchRow`, `SelectedMatch*`, `DayAgendaPanel`, `MatchInfoPanel`, `GroupStandingsPanel`, `TimezoneNotice`, `NotificationCTA` + el client `fixture.client.js` + lógica `fixture.logic.ts`. Vivo = `BracketTree` + `BracketMatchCard` + `fixture.bracket.client.js` + `bracket-tree.client.js`.
  - `08_equipos/`: huérfanos `TeamCard`, `TeamsSummaryStrip`, `ConfederationStrip`, `TeamDetailModal` + `equipos.client.js` + `equipos.logic.ts`. Vivo = solo `EquiposHero` + render inline en `EquiposSection.astro`.
  - `03_jugador/IdentityMessageCard.astro` no se importa en `/jugador` (solo wireframe).
- **Capa lib — LEGACY completo (solo tests los tocan):** TODA `src/lib/statistics/*` y TODA `src/lib/tabla/*`.
  Para puntaje/tabla/estadísticas en V2 el archivo correcto está en **`src/lib/knockout/*`**, NO ahí.
- **`src/lib/predictions/*`** y `src/lib/liveMatch/*` + `src/lib/scoring/*` están **parcialmente vivos / en modo seguridad**:
  funciones remotas deshabilitadas (lanzan Error); ver detalle en *Capa lib*.
- **Datos legacy (no importados):** `predictions.json`, `results.json`, `official-results.json`, `fixture.json`,
  `scoring-rules.json`, `equipos-info.json`, `match-h2h-*.json`, `admin-dashboard.json`, `team-covers.*.manifest.json`,
  y todos los `*.mock.json`. Fuente de verdad = los **`knockout-*.json`** + `teams.json` + `players.json`.
- **`src/lib/admin/`** existe pero está **vacío** (residuo).

> Regla: borrar un componente/card compartido NO es borrar un archivo — hay que limpiar TODOS sus consumidores
> (imports, hidrataciones, payloads SSR, CSS). Borrar huérfanos rompe `/wireframe` pero no la página real.

---

## 🔑 Convenciones globales

- **Scope por sección:** la raíz de cada sección lleva `data-section="<nombre>"`; el client JS y el CSS scoped
  cuelgan de ahí. `motion.js` busca `main [data-section]` para disparar el "momento" GSAP (solo `inicio` y `jugador` tienen).
- **CSS de DOM inyectado por `innerHTML` NO recibe el hash scoped de Astro** → debe estilarse con `:global(...)`
  anclado a un data-attr contenedor. Casos vivos: `09_estadisticas` (`.es-vote*`), `06_proximo` (`.px-recent*`).
- **Pantalla única (`hideFooter`):** `/reglas`, `/predicciones`, `/proximo-partido`, `/fixture`, `/tabla` fijan el alto
  al viewport (`overflow:hidden`) en ≥768px. Contenido extra rompe el "first view". `/fixture` además escala con `fit()`.
- **Motion:** entrada por `[data-animate]` + `IntersectionObserver` (`motion.js`); count-up por `[data-countup]`;
  todo respeta `prefers-reduced-motion` (sin JS, el contenido es visible igual). Tokens en `src/styles/animations.css`.
- **Tokens CSS:** único archivo `src/styles/tokens.css` (`--pm-*`). Los `--ko-*`/`--llave-*` del bracket viven
  *scoped* en `src/sections/07_fixture/`, no en la capa compartida.
- **Identidad del jugador:** `?player=<id>` en la URL **override**ea `polla:selectedPlayerId`; sin jugador → `"invitado"`.

### Claves `localStorage` / `sessionStorage` (estado runtime)

| Clave | Qué guarda | Escribe | Lee |
|---|---|---|---|
| `polla:selectedPlayerId` | id del jugador (identidad) | 03_jugador | 04, 06, 07, 09, 13 |
| `polla:playerConfirmed` | `"true"` al confirmar jugador | 03_jugador | 03 |
| `polla:selectedPlayerSnapshot` | `{id,name,avatar,avatarThumb}` | 03_jugador | 03, 04 |
| `polla:knockoutPredictions` | bucket pronósticos `{[player]:{[match]:{…}}}` | 04_predicciones | 06, 07, 09, 13 |
| `polla:podiumPredictions` | bucket podio `{[player]:{champion,…}}` | 04_predicciones | 09, 13 |
| `polla:knockoutResults` | resultados+asignaciones vivos del admin *(`KNOCKOUT_RESULTS_KEY`)* | 12_admin | 04, 06, 07, 09, 13 |
| `polla:finalDownloaded` (+ `…At`/`…Filename`/`…SubmissionPayload`) | bloqueo tras descargar la final | 04_predicciones | 04 |
| `polla:adminUnlocked` *(sessionStorage)* | gate admin desbloqueado | 12_admin | 12 |

Sincronización entre pestañas: evento `polla:knockout-results-updated` + evento nativo `storage` (en `lib/knockout/liveResults.js`).
Migración/limpieza de claves: `src/lib/storage/resetPollaState.js` (`POLLA_STORAGE_VERSION` = `production-reset-2026-06-27-knockout-v2`).

---

## 📂 Secciones (detalle)

A continuación, una ficha por ruta: subcomponentes, client JS, libs y datos que consume, hooks `data-*`,
gotchas y la guía accionable **"para cambiar … → toca …"**.

### `/` — 01_inicio

- **Página / raíz:** `src/pages/index.astro` → `src/sections/01_inicio/InicioSection.astro`
- **Qué hace:** Portada/hero arcade de la Polla Mundialera SECPLAN 2026: título poster + copa animada + CTA "Jugar", pasos de cómo jugar y marquee de los 32 clasificados. Convierte al visitante en jugador vía el CTA → `/reglas`.
- **Subcomponentes .astro:**
  - `src/sections/01_inicio/HeroCopy.astro` — título "Polla Mundialera", subtítulo "SECPLAN 2026" y bajada; estilos scoped + glow `::before`.
  - `src/sections/01_inicio/StepCards.astro` — 4 mini-cards (01 Aprende / 02 Elige / 03 Predice / 04 Gana) con iconos `INLINE` y tono por color.
  - `src/sections/01_inicio/PrimaryCTA.astro` — placa amarilla "Jugar ▶", `<a href="/reglas">`.
  - `src/sections/01_inicio/TrophyStage.astro` — `<figure>` de la copa hero (img webp) + rayos, glow, shine especular y 4 chispas (decorativos, los anima el JS).
  - `src/sections/01_inicio/FlagMarquee.astro` — ticker inferior animado (CSS) con 32 chips clasificados, summary "32 SELECCIONES" y phase-status "Dieciseisavos · 16 cruces".
  - `src/sections/01_inicio/TeamChip.astro` — chip individual (bandera vía `TeamFlag` + shortCode); recibe `team` y `ariaHidden`.
- **Client JS (navegador):**
  - `src/scripts/moments/inicio.js` — momento GSAP del hero. Despachado por `src/scripts/motion.js` (mapa `MOMENTS.inicio`) al detectar `data-section="inicio"`. Anima entrada (título main yPercent, accent clip-path reveal, copa cae con rebote, flash de glow) y loops idle (float copa, glow respira, rayos rotan 38s, shine pasa cada ~3.2s, chispas titilan random). NO repinta datos; solo decorativo. Gated por reduced-motion (no se carga si reduce).
- **Lógica local (.ts/.js):** ninguna propia de la sección. La selección de clasificados está inline en el frontmatter de `FlagMarquee.astro`: cruza `teams.json` (por `shortCode`) con `knockout-teams.json` (`slots` con `concrete:true`), preservando el orden de knockout.
- **CSS:** `src/sections/01_inicio/InicioSection.module.css` (grid 2-col, fondo image-set avif/webp + overlay `::before`, breakpoint 900px apila y `overflow:visible`). Estilos scoped notables en cada subcomponente (HeroCopy, StepCards, PrimaryCTA, TrophyStage, FlagMarquee, TeamChip) — la mayor parte del estilo vive en `<style>` por componente, no en el module.css.
- **lib/ que consume:** `src/lib/ui-assets/uiAssets.ts` (`INLINE.checklist/player/calendar/trophy` → webp en StepCards).
- **data/ que consume:** `src/data/teams.json`, `src/data/knockout-teams.json` (ambos en FlagMarquee).
- **localStorage keys:** ninguna.
- **Hooks data-* clave:** `data-section="inicio"` (raíz, lo busca motion.js); `data-moment="title-main|title-accent|trophy|trophy-glow"`, `data-trophy-rays`, `data-trophy-shine`, `.spark` (targets de inicio.js); `data-animate="fade-up|deal-in|pop-in"` + `--i` (reveal CSS por viewport en motion.js); `data-stagger` (StepCards), `data-trophy-img`.
- **Gotchas / restricciones:**
  - El map.md está DESACTUALIZADO en datos de marquee: dice "48 SELECCIONES / Fase de grupos / 72 partidos" pero el código real ya es eliminatorias → "32 SELECCIONES / Dieciseisavos · 16 cruces". No reintroducir los textos viejos.
  - motion.js pre-oculta todos los `[data-moment]` con `visibility:hidden` y solo los revela cuando inicio.js carga; si renombras/quitas un `data-moment` o el módulo falla, el `.catch` revela igual, pero quitar el atributo rompe la animación de ese elemento.
  - El `data-section` raíz DEBE seguir siendo `"inicio"` y estar dentro de `<main>` (el header también lleva `data-section`); cambiarlo desconecta el momento GSAP.
  - El shine y los rayos usan el mismo webp de la copa como mask (`trophy-secplan-worldcup-gold.webp`): si renombras/mueves el asset, actualiza también la URL del `mask` en TrophyStage.
  - `reduced-motion`: bajo `reduce` inicio.js no corre (sin GSAP), rayos/shine/sparks quedan ocultos por CSS y el reveal CSS muestra todo de inmediato. No dependas del JS para que el contenido sea visible.
  - El track del marquee duplica la lista (`qualified` ×2, la 2ª con `ariaHidden`) para loop sin salto; la animación `marquee-left` traslada -50%. No rompas el ×2 ni cambies el % sin ajustar ambos.
- **Para cambiar … → toca:**
  - Texto del título/subtítulo/bajada del hero → `src/sections/01_inicio/HeroCopy.astro`.
  - Destino o label del CTA principal ("Jugar" → `/reglas`) → `src/sections/01_inicio/PrimaryCTA.astro`.
  - Pasos (número/título/desc/icono/tono) → array `steps` en `src/sections/01_inicio/StepCards.astro` (iconos en `src/lib/ui-assets/uiAssets.ts`).
  - Qué selecciones aparecen / textos del ticker → `src/sections/01_inicio/FlagMarquee.astro` (filtro contra `knockout-teams.json`/`teams.json`).
  - Animación/timing de la copa (entrada, float, rayos, shine, chispas) → `src/scripts/moments/inicio.js`; el asset de la copa y su layout → `src/sections/01_inicio/TrophyStage.astro`.
  - Layout 2-columnas / fondo de la sección → `src/sections/01_inicio/InicioSection.module.css`.

### `/reglas` — 02_reglas

- **Página / raíz:** `src/pages/reglas.astro` → `src/sections/02_reglas/ReglasSection.astro` · hideFooter (pantalla única sin scroll en desktop/tablet)
- **Qué hace:** Tutorial estático que explica en 30s cómo se juega la polla de ELIMINATORIAS (arranca en dieciseisavos, no hay grupos): 5 reglas clave, tabla de puntaje por cruce, puntaje del podio mundial y CTA hacia `/jugador`.
- **Subcomponentes .astro:**
  - `src/sections/02_reglas/RulesHeroHeader.astro` — título "Las 5 Reglas Clave" + subtítulo "Tutorial simple en 30 segundos" (estilos scoped, sin props).
  - `src/sections/02_reglas/RulesCardsGrid.astro` — `<ol>` que mapea `rules[]` (prop) a `RuleCard`; grid responsive 5→3→2→1 col.
  - `src/sections/02_reglas/RuleCard.astro` — poster glass de una regla: número, icono inline (mapeo `ICONS` por `rule.icon`), título, descripción; color por `rule.tone` (blue/green/purple/orange/red).
  - `src/sections/02_reglas/ScoringPanel.astro` — panel "¿Cómo sumas puntos?" que mapea `scoringRules[]` (prop) a `ScoringRow`.
  - `src/sections/02_reglas/ScoringRow.astro` — fila de puntaje: icono inline (mapeo `ICONS` por `rule.icon`), label, descripción, puntos; tinte por `data-icon` (target/trend/wolf).
  - `src/sections/02_reglas/WorldPodiumPanel.astro` — panel "Podio Mundial" con `rows[]` HARDCODEADO localmente (Campeón +5, Segundo +3, Tercero +1, Cuarto +1); medallas con emoji.
  - `src/sections/02_reglas/RulesActionPanel.astro` — CTA arcade amarillo "ELEGIR JUGADOR" → `/jugador` (único CTA).
  - `src/sections/02_reglas/FairPlayFooter.astro` — franja azul inferior con escudo SVG y mensaje fair play.
- **Client JS (navegador):** ninguno (estático). Animaciones vía atributos `data-animate`/`data-stagger` manejados por el runtime global del layout, no por JS local de la sección.
- **Lógica local (.ts/.js):** ninguna. Los datos `rules` y `scoringRules` son arreglos inline en el frontmatter de `ReglasSection.astro` (no en JSON externo).
- **CSS:** `src/sections/02_reglas/ReglasSection.module.css` (shell, fondo, layout grid `bottomLayout`/`scoringChallenge`, fit-to-viewport ≥768px). Cada subcomponente tiene `<style>` scoped propio (notable: `RuleCard`, `ScoringRow`, `WorldPodiumPanel`, `RulesActionPanel` con sus CTAs y tintes).
- **lib/ que consume:** `src/lib/ui-assets/uiAssets.ts` (export `INLINE` — iconos webp `icon-circle-*`; usado por `RuleCard` y `ScoringRow`).
- **data/ que consume:** ninguno. `src/data/scoring-rules.json` NO se usa aquí (el enunciado lo asume, pero solo se referencia en `src/data/README.md` y `src/pages/wireframe.astro`).
- **localStorage keys:** ninguna.
- **Hooks data-* clave:** `data-section="reglas"`, `data-animate` (`fade-up`/`pop-in`), `data-stagger`, `style="--i:N"` (orden de entrada); `data-icon`/`data-rule` en `ScoringRow` (tinte CSS por icono); `data-section="reglas"` en `<section>`.
- **Gotchas / restricciones:**
  - Pantalla única SIN scroll en desktop/tablet (≥768px `.contentShell` fija `height` + `overflow:hidden` + `justify-content:center`); cualquier contenido extra rompe el fit. La página usa `hideFooter`.
  - Los datos viven INLINE en `ReglasSection.astro` (dos arreglos), no en JSON: editar reglas/puntajes es tocar ese frontmatter, no `data/`.
  - `RuleCard.ICONS` y `ScoringRow.ICONS` mapean `rule.icon` → claves de `INLINE`; el mapeo es semántico y NO 1:1 (ej. `ball`→`calendar`, `lock`→`podium`, `wolf`→`fire`). Cambiar `icon` sin clave existente cae al fallback.
  - `WorldPodiumPanel` tiene su podio HARDCODEADO aparte de `scoringRules`; el puntaje del podio no sale de los arreglos del raíz.
  - LONE WOLF = acierto EXACTO único entre todos los jugadores (+5); mantener esa definición (comentario en `ReglasSection.astro`). Orden correcto en panel: TENDENCIA +1, EXACTO +3, LONE WOLF +5, BONUS PENALES +1.
  - El map.md está DESACTUALIZADO: menciona `ChallengeMessage.astro` (no existe) y `scoring-rules.json` (no usado); el panel real junto a `ScoringPanel` es `WorldPodiumPanel`.
- **Para cambiar … → toca:**
  - Texto/cantidad de las 5 reglas o su color/icono → arreglo `rules` en `src/sections/02_reglas/ReglasSection.astro` (+ mapeo `ICONS` en `src/sections/02_reglas/RuleCard.astro`).
  - Reglas de puntaje por cruce (TENDENCIA/EXACTO/LONE WOLF/PENALES, puntos, textos) → arreglo `scoringRules` en `ReglasSection.astro` (+ `ICONS`/tintes en `src/sections/02_reglas/ScoringRow.astro`).
  - Puntaje del podio mundial (campeón/2°/3°/4°) → arreglo `rows` en `src/sections/02_reglas/WorldPodiumPanel.astro`.
  - Destino o estilo del CTA principal → `src/sections/02_reglas/RulesActionPanel.astro` (href `/jugador` + estilos `.primary-cta`).
  - Título/subtítulo del hero → `src/sections/02_reglas/RulesHeroHeader.astro`; mensaje fair play → `src/sections/02_reglas/FairPlayFooter.astro`.
  - Fondo, decoración de copa o layout fit-to-viewport (sin scroll) → `src/sections/02_reglas/ReglasSection.module.css`.

### `/jugador` — 03_jugador

- **Página / raíz:** `src/pages/jugador.astro` → `src/sections/03_jugador/JugadorSection.astro`
- **Qué hace:** Pantalla "character select": el usuario elige su jugador (cromo) de un grid, lo confirma como identidad permanente de la Polla y salta a `/predicciones`. Si ese jugador ya tiene cartón oficial entregado, abre un modal de "cartón protegido".
- **Subcomponentes .astro:**
  - `PlayerHeroPanel.astro` — título "Elige tu Jugador" + bajada; envuelve `SelectedPlayerCard`.
  - `SelectedPlayerCard.astro` — portrait grande del jugador activo (nombre/estado/avatar full); `[data-moment="selected-card"]`, repintado por JS.
  - `PlayersGrid.astro` — grid responsive (5→2 cols) que mapea `PlayerCard`; contenedor `[data-moment="player-grid"]`.
  - `PlayerCard.astro` — carta-botón por jugador con todos los `data-player-*` (id/name/avatar/thumb/status); estado seleccionado vía `[data-selected]`.
  - `PlayerSelectionCTA.astro` — botón "IR A PREDICCIONES" (`<a data-player-cta href="/predicciones">`).
  - `PlayerWarningNote.astro` — aviso "no podrás cambiar de jugador"; usa icono `STATUS.orbAlert` de `uiAssets`.
  - `PlayerResetAction.astro` — botón "RESETEAR JUGADOR" + modal de confirmación de hard-reset + feedback.
  - `OfficialPlayerModal.astro` — modal "Tu cartón ya está confirmado" (links a `/estadisticas`, `/tabla`, `/predicciones?player=`).
  - `IdentityMessageCard.astro` — NO usado por esta sección (no se importa en `JugadorSection.astro`); solo lo consume `src/pages/wireframe.astro`. Marcar como huérfano respecto a `/jugador`.
- **Client JS (navegador):**
  - Inline `<script is:inline>` dentro de `JugadorSection.astro` (no hay `.client.js` separado): hidrata toda la lógica de selección/confirmación. Lee selección/confirmación de storage, pinta carta activa (`paintSelected`), maneja click en cartas (solo si no confirmado), `pointerdown`+`click` del CTA (persiste + abre modal oficial o redirige a `returnAfterPlayerSelect`), reescribe `href` de links a `/predicciones` con `?player=`, y maneja modales reset/oficial (focus-trap, Escape). Repinta: portrait, nombre, estado, avatares (thumb→full), atributos `data-confirmed`/`data-selected`.
  - `src/scripts/moments/jugador.js` — moment GSAP "reparto de cromos": entrada escalonada del grid + glow del `selected-card`. Registrado en `src/scripts/motion.js` (`jugador: () => import("./moments/jugador.js")`).
- **Lógica local (.ts/.js):** ninguna propia de la carpeta (todo el JS de comportamiento es el inline script); consume libs externas (ver abajo).
- **CSS:** `JugadorSection.module.css` (shell grid, reset modal, official modal). Estilos `<style>` scoped notables en `PlayerHeroPanel`, `PlayerCard`, `SelectedPlayerCard` (incluye reglas `:global([data-section="jugador"][data-confirmed="true"])`), `PlayerSelectionCTA`, `PlayerWarningNote`, `PlayersGrid`.
- **lib/ que consume:**
  - `src/lib/storage/resetPollaState.js` (`resetPollaLocalState`, `ensurePollaStorageVersion`) — cargado vía `?url`.
  - `src/lib/playerIdentity.js` (`publishConfirmedPlayer`, `syncPredictionLinks`; también `resolveConfirmedPlayer`, `PLAYER_IDENTITY_KEYS`, `PLAYER_IDENTITY_EVENT`) — cargado vía `?url`.
  - `src/lib/predictions/predictionEditAccess.js` (`clearPredictionEditSession`, `clearPredictionCorrectionDrafts`) — cargado vía `?url`; limpia sesión al cambiar de jugador.
  - `src/lib/ui-assets/uiAssets.ts` (`STATUS.orbAlert`) — usado por `PlayerWarningNote`.
- **data/ que consume:** `src/data/players.json` (13 jugadores: carlos, chelo, felipe, humberto, luis_renato, jaime, italo, narigon, pancho, tanke, antonio, martin, ale), `src/data/knockout-predictions.json` (calcula `officialPlayerIds`), `src/data/knockout-results.json` (filtra cruces `final` para no contar como oficial al que solo predijo ya-finalizados).
- **localStorage keys (identidad del jugador):**
  - `polla:selectedPlayerId` — id del jugador elegido (la clave de identidad principal).
  - `polla:playerConfirmed` — `"true"` cuando se confirmó.
  - `polla:selectedPlayerSnapshot` — JSON `{id,name,avatar,avatarThumb}`.
  - (todas también se escriben en `sessionStorage`). Centralizadas en `PLAYER_IDENTITY_KEYS` de `playerIdentity.js`.
  - sessionStorage adicionales leídos/escritos: `polla:playerResetFeedback`, `polla:returnAfterPlayerSelect`. El hard-reset borra además `polla:predictions`, `polla:qualifiedPredictions`, `polla:activePredictionGroup`, `polla:favoriteTeams`, `polla:final*`, `polla:predictionCorrectionDrafts`, `polla:predictionEditSession`, etc.
- **Hooks data-* clave:** sección `[data-section="jugador"]` con `data-default-player-id` / `data-selected-player-id` / `data-confirmed` / `data-player-ready` / `data-reset-modal-open` / `data-official-modal-open` / `data-reset-state-url` / `data-player-identity-url` / `data-prediction-edit-access-url`. Cartas: `[data-player-card]` + `data-player-id/-name/-avatar/-avatar-thumb/-status/-selected`. Selected: `[data-selected-card]`, `[data-selected-player-name]`, `[data-selected-status]`, `[data-selected-avatar-img]`. CTA `[data-player-cta]`. Reset: `[data-player-reset-open/-modal/-cancel/-confirm/-feedback]`. Oficial: `[data-official-player-modal/-dialog/-name/-close]`, `[data-official-card-link]`, `[data-official-player-ids]` (script JSON). Moments: `[data-moment="player-grid"]`, `[data-moment="selected-card"]`.
- **Gotchas / restricciones:**
  - El portrait de `SelectedPlayerCard` se renderiza server-side con el jugador por defecto (`carlos`) y SIEMPRE visible (opacity:1) — no gatear visibilidad en clase JS (rompe carga lenta / sin-JS / headless).
  - `selectedPlayerId = "carlos"` está hardcodeado como default en `JugadorSection.astro` (no viene de data); si `carlos` desaparece de players.json cae a `players[0]`.
  - "Oficial" = submission con ≥1 predicción de cruce AÚN ABIERTO (no solo finalizados); tocar la lógica de `finalizedMatchIds`/`officialPlayerIds` cambia quién dispara el modal de cartón protegido.
  - Una vez `data-confirmed="true"`, las cartas quedan `disabled` y el click no re-selecciona; el único camino de cambio es RESETEAR JUGADOR (hard reset que borra TODO el progreso, no solo identidad).
  - Identidad guardada inválida (jugador ya no en players.json) se limpia sola al cargar (`clearStoredIdentity`).
  - Todo el comportamiento es un inline script único; no existe `jugador.client.js`. Editar comportamiento = editar el `<script is:inline>` de `JugadorSection.astro`.
  - `IdentityMessageCard.astro` está en la carpeta pero NO se usa aquí; no asumir que aparece en `/jugador`.
- **Para cambiar … → toca:**
  - Texto del hero ("Elige tu Jugador" / bajada) → `PlayerHeroPanel.astro`.
  - Lista/orden/avatares de jugadores → `src/data/players.json` (y assets en `/assets/players/`).
  - Jugador por defecto preseleccionado → const `selectedPlayerId` en `JugadorSection.astro` (línea 25).
  - Regla de "jugador oficial"/modal cartón protegido → cálculo `officialPlayerIds`/`finalizedMatchIds` en frontmatter de `JugadorSection.astro` + textos en `OfficialPlayerModal.astro`.
  - Claves/sincronización de identidad o links `?player=` → `src/lib/playerIdentity.js` (`PLAYER_IDENTITY_KEYS`, `publishConfirmedPlayer`, `syncPredictionLinks`).
  - Qué borra el reset → `fallbackHardReset` en el inline script + `src/lib/storage/resetPollaState.js`; copy del modal en `PlayerResetAction.astro`.
  - Animación de entrada (stagger/glow) → `src/scripts/moments/jugador.js`.
  - Layout 2-columnas / breakpoints / modales → `JugadorSection.module.css`.

### `/predicciones` — 04_predicciones

- **Página / raíz:** `src/pages/predicciones.astro` → `src/sections/04_predicciones/PrediccionesSection.astro` · hideFooter (pantalla única; en desktop/tablet el `.contentShell` no scrollea y el scroll es interno en `.pred-rounds`)
- **Qué hace:** Captura local de la polla de ELIMINATORIAS. El jugador predice los cruces R32 predecibles (marcador + quién avanza) y elige su PODIO (4 puestos), luego descarga el JSON. Cruces ya jugados se siembran bloqueados; Octavos→Final están ocultos hoy (`VISIBLE_PREDICTION_ROUNDS=["R32"]`).
- **Subcomponentes .astro:**
  - `ScoreInput.astro` — input numérico de goles (`data-score-input="home|away"`); ÚNICO usado en vivo (lo consume `07_fixture/BracketMatchCard.astro`, no el raíz directamente).
  - `PredictionHeroHeader.astro`, `PlayerStatusCard.astro`, `PredictionSummaryLine.astro`, `ProgressSummaryGrid.astro`, `ProgressCard.astro`, `PredictionWorkspace.astro`, `MatchesPanel.astro`, `MatchPredictionRow.astro`, `PredictionStatusIcon.astro`, `PredictionBottomBar.astro`, `SaveAndContinueCTA.astro`, `OfficialPredictionAccessPanel.astro` — **LEGACY/HUÉRFANOS** del wireframe de fase-de-grupos. NO los importa `PrediccionesSection.astro`; solo se referencian entre sí y en `src/pages/wireframe.astro`. `PredictionWorkspace.astro` incluso importa `QualifiedPanel.astro`, que ya no existe. No tocar para cambios de la página real.
  - El render REAL usa `src/sections/07_fixture/BracketColumn.astro` → `BracketMatchCard.astro` (mode `"capture"`).
- **Client JS (navegador):**
  - `predicciones.knockout.client.js` — único client. Lee el `<script type="application/json" data-knockout-predict-payload>`, resuelve la llave con resultados vivos (`resolveBracket` sobre `readLiveKnockout`), parchea cada `[data-ko-match]` (banderas/nombres/editable), hidrata valores guardados, capta inputs/botones de avance, gestiona los 4 selects de podio (sin repetir equipo), construye y descarga el JSON, y bloquea todo al descargar la final. Re-pinta vía `subscribeLiveKnockout`.
  - `predicciones.export.js` — NO hidrata; módulo ESM consumido por el client: `buildKnockoutPayload`, `buildFileName`, `slugifyPlayer`, `downloadJson`.
- **Lógica local (.ts/.js):**
  - `predicciones.export.js` — `SCHEMA_VERSION="2.0-knockout"`, `COMPETITION`, `slugifyPlayer`, `buildFileName` (`predicciones_<slug>_<YYYY-MM-DD_HH-mm>.json`), `buildKnockoutPayload`, `downloadJson`. (Nota: el nombre real exportado lleva `who.name`, no el id.)
- **CSS:** `PrediccionesSection.module.css` (solo layout del shell: `.prediccionesSection`, `.contentShell`, `.topGrid` —`topGrid` no se usa en el markup actual—). Casi todo el estilo está **inline/scoped** en `<style>` de `PrediccionesSection.astro` (hero, podio, `.pred-lock-note`, `.pred-rounds`, `.pred-download`) y en `07_fixture/BracketMatchCard.astro` (la card de captura) + `ScoreInput.astro`.
- **lib/ que consume:**
  - `src/lib/knockout/validation.js` — `toScore`, `isTie`, `inferAdvance`, `predictionStatus`, `validateKnockout`.
  - `src/lib/knockout/canPredict.js` — `buildTeamsByCode` (+ `isConcreteSlot`, `canPredictMatch`, `resolveSlot`).
  - `src/lib/knockout/bracket.js` — `resolveBracket`, `normalizeResults`, `resultWinnerSide` (predecible = ambos lados concretos y NO `played`).
  - `src/lib/knockout/liveResults.js` — `readLiveKnockout`, `subscribeLiveKnockout` (+ key `polla:knockoutResults`, evento `polla:knockout-results-updated`).
  - `src/lib/knockout/scoring.js` — `scoreKnockoutMatch` (puntos de cruces ya jugados en el JSON).
  - `src/lib/knockout/podium.js` — `PODIUM_SLOTS`, `PODIUM_LABELS` (`validatePodium`/`normalizePodium` no se usan aquí).
  - `src/lib/knockout/model.ts` — `sortBySlot`, tipos `KnockoutMatch`/`ResolvedSlot` (SSR).
  - **NO consume** `src/lib/predictions/*` (predictionAccess/predictionEditAccess) — eso es de 03_jugador y 07_fixture; el flujo "corrección oficial" del map.md NO está cableado en esta sección.
- **data/ que consume:** `src/data/knockout-matches.json`, `src/data/knockout-teams.json`, `src/data/teams.json`, `src/data/knockout-results.json` (seed), `src/data/knockout-predictions.json` (cartones ya enviados → `seededPredictions`).
- **localStorage keys:**
  - Lee/escribe: `polla:knockoutPredictions` (bucket `{[playerId]:{[matchId]:{matchId,homeScore,awayScore,advances,status,locked?}}}`), `polla:podiumPredictions` (`{[playerId]:{champion,runnerUp,third,fourth}}`).
  - Escribe al descargar final: `polla:finalDownloaded` (`"true"`), `polla:finalDownloadedAt`, `polla:finalDownloadedFilename`, `polla:finalSubmissionPayload`.
  - Lee identidad: `polla:selectedPlayerId`, `polla:selectedPlayerSnapshot`; también `?player=` en la URL.
  - Lee (vía liveResults): `polla:knockoutResults`.
- **Hooks data-* clave:**
  - Sección/payload: `[data-section="predicciones"]`, `[data-knockout-predict-payload]`.
  - Cards (de BracketMatchCard): `[data-ko-match]`, `[data-ko-editable]`, `[data-status]`, `[data-ko-status-pill]`, `[data-ko-flag="home|away"]`, `[data-ko-name="…"]`, `[data-ko-pick="…"]`, `[data-score-input="home|away"]`, `[data-advance-pick="home|away"]`.
  - Hero/acciones: `[data-pred-identity]`, `[data-pred-cruces-count]`, `[data-pred-podio-count]`, `[data-pred-lock-note]`, `[data-pred-status]`, `[data-pred-download]`.
  - Podio: `[data-podium-card=KEY]`, `[data-podium-spot=KEY]`, `[data-podium-preview=KEY]` (KEY ∈ champion/runnerUp/third/fourth).
- **Gotchas / restricciones:**
  - El map.md (`predicciones.map.md`) está MUY desactualizado: describe la app de FASE DE GRUPOS (72 partidos, tabs A-L, `polla:predictions`, archivos `predicciones.client.js`/`.standings.js`/`.validation.js` que NO existen). Ignorar ese changelog; la verdad es el código knockout.
  - Octavos→Final NO se borraron: se ocultan solo con `VISIBLE_PREDICTION_ROUNDS=["R32"]` en el raíz. Para reabrir rondas, editar ese array (NO datos/lógica).
  - "Predecible" = ambos slots concretos Y no jugado; se recalcula en cliente con resultados vivos. Un marcador `status:"live"` NO avanza el cuadro (sí puntúa).
  - Empate cargado ⇒ `advances` queda manual (botón); marcador no-empate fuerza `advances` por `inferAdvance` e ignora el click.
  - Gating de la "final" (que dispara el bloqueo): `completedMatches === totalPredictableMatches` Y `podiumComplete` (4 puestos distintos). Cruces bloqueados/jugados NO cuentan al gating.
  - Descarga sin completar = "borrador" (no bloquea). Al completar bloquea inputs, selects de podio, random y deja `polla:finalDownloaded="true"`.
  - El identificador del jugador para el bucket viene de `?player=` o `polla:selectedPlayerId` (fallback `"invitado"`); sin jugador elegido igual funciona como invitado.
- **Para cambiar … → toca:**
  - Reabrir/ocultar rondas (R16/QF/SF/F) → `VISIBLE_PREDICTION_ROUNDS` en `src/sections/04_predicciones/PrediccionesSection.astro`.
  - Texto del hero / eyebrow / chips / etiquetas de podio → `PrediccionesSection.astro` (markup + `<style>` inline); labels de podio también en `src/lib/knockout/podium.js`.
  - Regla de bloqueo/desbloqueo de un cruce → `src/lib/knockout/bracket.js` (`resolveBracket`/`predictionEnabled`) y `src/lib/knockout/canPredict.js` (`canPredictMatch`).
  - Regla de "polla completa" / contadores → `src/lib/knockout/validation.js` (`validateKnockout`) y `buildKnockoutPayload` en `predicciones.export.js` (campo `summary.podiumComplete` + `completedMatches`).
  - Forma/nombre/esquema del JSON descargado → `src/sections/04_predicciones/predicciones.export.js`.
  - Puntaje de cruces ya jugados embebido en el JSON → `src/lib/knockout/scoring.js` (`scoreKnockoutMatch`).
  - Aspecto de las cards de captura (inputs, banderas, botones avanza) → `src/sections/07_fixture/BracketMatchCard.astro` + `src/sections/04_predicciones/ScoreInput.astro`.

### `/proximo-partido` — 06_proximo_partido

- **Página / raíz:** `src/pages/proximo-partido.astro` → `src/sections/06_proximo_partido/ProximoSection.astro` · hideFooter (pantalla única sin scroll; `backgroundPreloadHref` = `06_proximo_partido_background.avif`)
- **Qué hace:** "VS SCREEN" arcade del próximo cruce de la llave: paneles retrato LOCAL/VISITA con foto+bandera, ronda, fecha, countdown, tu pronóstico y resultados recientes. SSR pinta un seed; el cliente lo re-resuelve en vivo con resultados del admin (localStorage).
- **Subcomponentes .astro:** ninguno (solo el raíz; toda la UI vive en `ProximoSection.astro`).
- **Client JS (navegador):**
  - `proximo.knockout.client.js` — hidrata `[data-section="proximo"]`: lee `[data-proximo-payload]` (JSON), resuelve bracket con estado vivo, recalcula `findNextMatch`, repinta ronda/fecha/paneles (`--px-flag`/`--px-cover`/nombre), countdown 1s, tu pronóstico, stake, y placas de recientes (innerHTML). Se re-renderiza vía `subscribeLiveKnockout(render)`.
- **Lógica local (.ts/.js):** ninguna propia aparte del client; toda la lógica de dominio vive en `lib/knockout/*`. Helpers inline: `sideStyle()`, `fmtWhen()`, array `MES` (en el `.astro`), y `fmtWhen`/`nowKey`/`startCountdown`/`render`/`renderRecent` (en el client).
- **CSS:** `<style>` scoped dentro de `ProximoSection.astro` (no hay `Section.module.css`). Prefijo `.px-*`; placas de recientes vía `:global(.px-recent-*)` porque las inyecta el client por innerHTML. Banderas/fotos vía custom props `--px-flag`/`--px-cover` (con clip-path diagonal por panel).
- **lib/ que consume:**
  - `src/lib/knockout/model` (`sortBySlot`, tipo `KnockoutMatch`) — solo SSR
  - `src/lib/knockout/canPredict.js` (`buildTeamsByCode`) — SSR + client
  - `src/lib/knockout/bracket.js` (`resolveBracket`) — SSR + client
  - `src/lib/knockout/schedule.js` (`findNextMatch`, `recentResults`) — SSR usa `findNextMatch`; client usa ambos
  - `src/lib/knockout/liveResults.js` (`readLiveKnockout`, `subscribeLiveKnockout`) — solo client
- **data/ que consume:** `src/data/knockout-matches.json` (matches), `src/data/teams.json` (teams), `src/data/knockout-results.json` (seed: `slotAssignments` + `results`).
- **localStorage keys:**
  - `polla:knockoutResults` (lee vía `readLiveKnockout`/`subscribeLiveKnockout`; constante `KNOCKOUT_RESULTS_KEY` en `liveResults.js`) — resultados/asignaciones vivos del admin
  - `polla:knockoutPredictions` (lee; bucket por jugador → tu pronóstico)
  - `polla:selectedPlayerId` (lee; fallback `"invitado"`; override por query `?player=`)
- **Hooks data-* clave:** `data-section="proximo"`, `[data-proximo-payload]` (JSON SSR→client), `data-px-versus`, `data-px-empty`, `data-px-round`, `data-px-date`, `data-px-countdown`, `data-px-team="home|away"`, `data-px-name="home|away"`, `data-px-flag` (medallón), `data-has-flag="true|false"` (gatilla el "?"), `data-px-yourpick`, `data-px-stake`, `data-px-recent`.
- **Gotchas / restricciones:**
  - El estado vivo manda en runtime; el SSR es solo seed inicial (puede mostrarse otro cruce tras hidratar). `findNextMatch` del client pasa `nowKey` (hora Chile) — el SSR no, así que pueden diferir.
  - "Próximo cruce" = primer item con `codeA`+`codeB` concretos y `!played`; sin candidatos → `.px-empty` visible y `.px-versus` oculto.
  - Countdown asume offset fijo `-04:00` (línea 51) — no respeta horario de verano de Chile (`-03:00`).
  - `--px-cover` (foto cover) tiene prioridad visual sobre `--px-flag` en el `background-image`; sin cover cae a bandera; sin equipo → degradado base + glifo "?".
  - Las placas de recientes son `:global` + innerHTML; cambiar sus clases requiere tocar AMBOS (markup en client + CSS `:global`).
  - Desktop/tablet (≥768px): `overflow:hidden`, arena dimensionada por viewport (`width:min(93vh,49.5rem)`, paneles `height:min(62vh,33rem)`) — pantalla única sin scroll; móvil (≤640px) apila paneles y permite scroll.
- **Para cambiar … → toca:**
  - Texto del eyebrow / "VS" / tag LOCAL-VISITA / título de recientes / mensaje vacío → markup en `ProximoSection.astro`.
  - Formato de fecha o lista de meses → `fmtWhen`/`MES` en **ambos** `ProximoSection.astro` (SSR) y `proximo.knockout.client.js` (deben coincidir).
  - Regla de "cuál es el próximo cruce" o nº de recientes → `src/lib/knockout/schedule.js` (`findNextMatch` / `recentResults` `limit`).
  - Offset de zona horaria / texto del countdown → `startCountdown` en `proximo.knockout.client.js` (línea ~51, `-04:00`).
  - Texto de "tu pronóstico" / stake / link a `/predicciones` → bloque `render()` en el client (líneas ~115-128).
  - Look de paneles/fotos/banderas (clip-path, velo de color, custom props) → `<style>` `.px-team*` en `ProximoSection.astro`.
  - Fuente del estado vivo / claves localStorage / merge seed↔local → `src/lib/knockout/liveResults.js`.

### `/fixture` — 07_fixture (LLAVE / bracket)

- **Página / raíz:** `src/pages/fixture.astro` → `src/sections/07_fixture/FixtureSection.astro` · `hideFooter`, preload `07_fixture_background.avif` (pantalla única sin scroll)
- **Qué hace:** Renderiza la LLAVE eliminatoria completa (árbol espejo R32→Final, P73–P104) en modo SOLO LECTURA: SSR resuelve con el seed y el cliente re-resuelve con resultados vivos (admin/localStorage) parcheando equipos, ganadores, desbloqueo y el pronóstico guardado del jugador.

- **Subcomponentes .astro (los QUE USA `/fixture`):**
  - `BracketTree.astro` — layout flex anidado del árbol espejo (lado izq + centro trofeo/Final/3P + lado der), capa `<svg class="ko-connectors">` para conectores; round-labels HUD hexagonales; mapea `tree.left/right[round]` a nodos. Trae el grueso del CSS scoped (escalas `--ko-rs`/`--ko-rw` por ronda, centro ceremonial, media `max-width:700px` que colapsa a columnas).
  - `BracketMatchCard.astro` — la tarjeta-nodo (`variant="node"`, `mode="view"`). Define TODOS los hooks `data-ko-*` y el CSS de la card (cromo/sticker, R32 hero, números de slot, barra "en espera"). Compartido con `/predicciones` vía `mode="capture"`.
  - **HUÉRFANOS respecto a `/fixture`** (la página NO los importa; solo se referencian entre sí y en `src/pages/wireframe.astro`, versión vieja "fase de grupos"): `FixtureHero.astro`, `FixtureSummaryCards.astro`, `FixtureFilters.astro`, `FixtureListPanel.astro`, `FixtureDayGroup.astro`, `FixtureMatchRow.astro`, `SelectedMatchPanel.astro`, `SelectedMatchHero.astro`, `DayAgendaPanel.astro`, `MatchInfoPanel.astro`, `GroupStandingsPanel.astro`, `TimezoneNotice.astro`, `NotificationCTA.astro`.
  - **NO EXISTEN** los archivos `BracketColumn.astro` ni `BracketLegend.astro` mencionados en el brief (no están en la carpeta).

- **Client JS (navegador):** importados en `FixtureSection.astro` (`<script>`):
  - `fixture.bracket.client.js` — hidrata el bracket. Lee payload `[data-knockout-readonly]`, `readLiveKnockout(seed)` + `resolveBracket`, y por cada `[data-ko-match]` parchea bandera/nombre (`patchSlot`), pill (`Final`/`Por jugar`/`Bloqueado`), `data-locked`, marca fila ganadora (`data-winner`), y pinta el pronóstico del jugador (`data-ko-score`, `data-ko-advance` → "tu pick: XXX"). Re-renderiza con `subscribeLiveKnockout`. No escribe nada.
  - `bracket-tree.client.js` — SOLO presentación. Mide nodos (`offsetLeft/Top`, sin transform), dibuja conectores SVG (`elbow` H/V/H; `ko-conn--win` dorado si la fila tiene ganador, `ko-conn--lose` morado punteado vía `data-ko-loserto`), y `fit()` escala el árbol (`transform: translate+scale`) para que entre en ventana. Re-`schedule()` en load/resize/`document.fonts.ready`.
  - **HUÉRFANO:** `fixture.client.js` (filtros/selección de lista, consenso `communityPulseByMatch`) — NO se importa en `/fixture`; pertenece al wireframe viejo.

- **Lógica local (.ts/.js):** ninguna que use `/fixture` — `fixture.logic.ts` (getRelevantMatches/getMatchStatusVisual/groupMatchesByDate/etc.) es de la versión lista/grupos, hoy huérfana. La lógica real vive en `lib/knockout/*`.

- **CSS:** `FixtureSection.module.css` (clase `fixtureArcadeStage`, `contentShell`, `bottomHud` + atmósfera arcade 100% CSS: `arcadeAtmosphere`/`stadiumGlow`/`speedLines`/`confettiLayer`/`fieldGlow`, tokens `--llave-*`). Mayor parte del CSS del bracket está **scoped** en `BracketTree.astro` y `BracketMatchCard.astro` (`<style>` por componente, no en el module).

- **lib/ que consume:**
  - `src/lib/knockout/model` (`sortBySlot`, tipos `KnockoutMatch`/`ResolvedSlot`)
  - `src/lib/knockout/canPredict.js` (`buildTeamsByCode`, `resolveSlot`)
  - `src/lib/knockout/bracket.js` (`resolveBracket`, `normalizeResults`, `resultWinnerSide`, `deriveActualPodium`)
  - `src/lib/knockout/bracketTree.js` (`buildBracketTree`, `sideRoundsOrder`)
  - `src/lib/knockout/liveResults.js` (`readLiveKnockout`, `subscribeLiveKnockout`, `mergeResults`, `KNOCKOUT_RESULTS_KEY`)
  - `src/components/ui/TeamFlag.astro` y `src/sections/04_predicciones/ScoreInput.astro` (vía BracketMatchCard)
  - (`src/lib/statistics/communityStatistics.js` solo lo usa el `fixture.client.js` huérfano)

- **data/ que consume:** `src/data/knockout-matches.json` (cruces P73–P104), `src/data/teams.json` (mapeado a `teamsLite`), `src/data/knockout-results.json` (seed: `slotAssignments` + `results`). NOTA: el brief menciona `knockout-teams.json` pero el raíz importa `teams.json`.

- **localStorage keys:** lee (no escribe): `polla:knockoutResults` (vía `readLiveKnockout`, key `KNOCKOUT_RESULTS_KEY` en `liveResults.js`), `polla:selectedPlayerId` (id jugador), `polla:knockoutPredictions` (bucket del pronóstico del jugador). También respeta query param `?player=`.

- **Hooks data-* clave:** `data-section="fixture"`, `data-knockout-readonly` (JSON payload SSR), `data-bottom-hud` (alto reservado por `fit()`), `data-ko-tree` (root del árbol), `data-ko-node`/`data-ko-side`/`data-ko-winnerto`/`data-ko-loserto` (en `BracketTree`, para medir y dibujar conectores), `data-ko-match`/`data-ko-round`/`data-ko-variant="node"`/`data-ko-mode="view"`, `data-ko-flag`/`data-ko-name`/`data-ko-score`/`data-ko-advance`/`data-ko-status-pill`/`data-ko-locknote`, `.ko-row[data-slot="home|away"]` + `data-winner`, `data-concrete` (true/false en el nombre).

- **Gotchas / restricciones:**
  - `fit()` es **HEIGHT-bound + width-bound**: escala = `min(availW/natW, availH/natH)`; resta el alto de `[data-bottom-hud]` (`hudReserve`). Si tocas el HUD o el alto del árbol, revisa esto o el bracket tapa el HUD / aparece scroll.
  - Los conectores miden **offsets reales** (escala de ronda es de LAYOUT vía `--ko-rs`/`--ko-rw`, no transform). NO conviertas la escala por ronda a `transform`: rompería la medición.
  - La topología sale SOLO de `winnerTo`/`bracketSlot` en `bracketTree.js` (post-orden); no hardcodea ids. Cambiar el orden vertical de R32 = tocar `collectSide`/`buildFeederIndex`, no el JSON.
  - **Estado-cero R16+:** los placeholders "Ganador P##" se ocultan visualmente (`BracketMatchCard.astro`, regla `[data-ko-variant="node"]:not([data-ko-round="R32"]) .ko-team-name[data-concrete="false"]` → `font-size:0` + barra "en espera"). R32 SÍ muestra los placeholders de grupo ("2º Grupo K"). Nunca se pre-hornean ganadores: el cuadro solo AVANZA con `result.status !== "live"` (`bracket.js`/`resolveSlotCode`).
  - Números de slot: prop `seedNum` solo en R32 (`seedNum = i*2`; home=`seedNum+1`, away=`seedNum+2`).
  - El map.md de la sección está MUY desactualizado (describe la app vieja de fase de grupos/lista); descártalo como fuente de verdad para `/fixture`.

- **Para cambiar … → toca:**
  - **Layout/columnas/escala del árbol, round-labels, centro (trofeo/Final/CAMPEÓN/3P), colores de conectores** → `src/sections/07_fixture/BracketTree.astro` (markup + `<style>`).
  - **Aspecto de cada nodo/card (R32 hero, números de slot, ocultar "Ganador P##", banderas, ganador)** → `src/sections/07_fixture/BracketMatchCard.astro`.
  - **Fit-to-viewport / conectores SVG / reserva del HUD** → `src/sections/07_fixture/bracket-tree.client.js` (`fit()`, `drawConnectors`, `hudReserve`).
  - **Regla de desbloqueo/ganador/propagación** → `src/lib/knockout/bracket.js` (`resolveBracket`, `resolveSlotCode`); **topología izq/der/centro u orden de ronda** → `src/lib/knockout/bracketTree.js`.
  - **Cómo se leen los resultados vivos / merge seed↔localStorage / qué se hidrata (pill, tu pick)** → `src/sections/07_fixture/fixture.bracket.client.js` + `src/lib/knockout/liveResults.js`; **datos del cuadro** → `src/data/knockout-matches.json` / `knockout-results.json`.
  - **Atmósfera arcade de fondo y texto del HUD inferior** → `FixtureSection.module.css` (`fixtureArcadeStage`) y `FixtureSection.astro` (`bottomHud`).

### `/equipos` — 08_equipos

- **Página / raíz:** `src/pages/equipos.astro` → `src/sections/08_equipos/EquiposSection.astro`
- **Qué hace:** Álbum estático (SSR) de los 32 clasificados a dieciseisavos, agrupados por su cruce de la llave: 16 cards "VS" con bandera, nombre y confederación de cada equipo. Informativo, no interactivo. (OJO: el map.md describe la versión vieja "álbum de 48 selecciones por grupo con favoritos+modal" — está OBSOLETO; ver Gotchas.)
- **Subcomponentes .astro:**
  - `EquiposHero.astro` — header: eyebrow "LOS 32 CLASIFICADOS · DIECISEISAVOS", título "Álbum de Clasificados", subtítulo y badge FIFA. ÚNICO subcomponente realmente renderizado.
  - `TeamCard.astro` — poster vertical (cover webp + overlay + favorito + confed + "VER FICHA"). **HUÉRFANO**: no lo importa la raíz; solo lo lista `wireframe.astro`.
  - `TeamsSummaryStrip.astro` — 4 stat-cards (selecciones/grupos/confederaciones/pasión). **HUÉRFANO** (no usado en vivo).
  - `ConfederationStrip.astro` — franja de confederaciones con `ConfederationLogo`. **HUÉRFANO** (no usado en vivo).
  - `TeamDetailModal.astro` — `<dialog>` nativo con ficha editorial (portada, confed, formaciones, fortaleza/riesgo, jugadores, tags). **HUÉRFANO** (no usado en vivo).
  - (Nota: el componente `TeamFlag.astro` que sí usa la raíz vive en `src/components/ui/`, no en la carpeta de la sección.)
- **Client JS (navegador):** `equipos.client.js` — **NO CARGADO** por la raíz (la raíz no tiene `<script>` ni emite `[data-equipos-payload]` ni el modal). Diseñado para hidratar favoritos (`aria-pressed`) y abrir el `<dialog>` modal por delegación de clicks. Inerte en la página actual. La página en vivo es **estática (sin client JS)**.
- **Lógica local (.ts/.js):** `equipos.logic.ts` — `buildInfoIndex`, `enrichTeams` (merge teams↔equipos-info con alias Türkiye→Turquía), `groupByConfederation`, `uniqueConfederations`, `shortDescription`; tipos `EnrichedTeam`/`EquipoInfo`. **NO la consume la raíz** (solo `TeamCard` huérfano). La lógica viva está inline en `EquiposSection.astro` (resuelve R32 vía `resolveBracket`).
- **CSS:** `EquiposSection.module.css` (solo `.equiposSection`/`.contentShell`/`.topRow` + background `08_equipos_background` avif/webp). El grid de cards `.cruce-*` está como `<style>` scoped inline DENTRO de `EquiposSection.astro` (líneas 79-117), no en el module.css.
- **lib/ que consume:** `src/lib/knockout/bracket.js` (`resolveBracket`), `src/lib/knockout/canPredict.js` (`buildTeamsByCode`, indirecto `resolveSlot`), `src/lib/ui-assets/uiAssets` (solo vía `TeamsSummaryStrip` huérfano).
- **data/ que consume (en vivo):** `src/data/teams.json` (48 equipos: id/name/shortCode/group/confederation/flag/crest/cover), `src/data/knockout-matches.json` (`.matches`), `src/data/knockout-results.json` (`.slotAssignments`, `.results`). — `src/data/equipos-info.json` y `src/data/confederations-assets.json` existen pero **NO se consumen en vivo** (solo por componentes/lógica huérfanos; confederations-assets lo usa `ConfederationLogo`).
- **localStorage keys:** ninguna en vivo. (`polla:favoriteTeams` solo la escribiría `equipos.client.js`, que no se carga.)
- **Hooks data-* clave:** `[data-section="equipos"]` (scope), `[data-animate="fade-up"]` (animación del topRow). Los hooks del JS huérfano (`[data-equipos-payload]`, `[data-team-modal]`, `[data-favorite-toggle]`, `[data-view-ficha]`, `[data-modal-*]`) **no existen en el DOM en vivo**.
- **Gotchas / restricciones:**
  - El `equipos.map.md` está MUY desactualizado: describe álbum de 48 por grupo, favoritos y modal; el código real es álbum de 16 cruces R32 sin interacción. No confíes en él.
  - 4 de los 6 .astro de la carpeta (`TeamCard`, `TeamsSummaryStrip`, `ConfederationStrip`, `TeamDetailModal`) + `equipos.client.js` + `equipos.logic.ts` son **código muerto** en `/equipos`; siguen referenciados solo por `src/pages/wireframe.astro` (índice de wireframe). Borrarlos no rompe `/equipos` pero sí `wireframe.astro`.
  - El render depende de que `resolveBracket` produzca filas con `round === "R32"`; si los códigos de equipo no resuelven, sale "Por definir" + placeholder "?".
  - `view(code)` mapea por `shortCode` (Map `teamByCode`); cambiar shortCodes en `teams.json` rompe el match de banderas/nombres.
  - Grid 2-col, colapsa a 1-col en `max-width: 760px` (breakpoint definido inline, no en el module.css).
  - El cuadro solo avanza con resultados finalizados; `status: "live"` no mueve equipos (lógica en `bracket.js`/`canPredict.js`).
- **Para cambiar … → toca:**
  - Texto del hero (eyebrow/título/subtítulo/badge) → `src/sections/08_equipos/EquiposHero.astro`.
  - Layout/estilo de las cards de cruce (`.cruce-card`, VS, banderas) → `<style>` inline en `src/sections/08_equipos/EquiposSection.astro` (no el module.css).
  - Qué partidos/etiqueta se muestran (filtro `round === "R32"`, formato de fecha, "16avos") → bloque frontmatter de `src/sections/08_equipos/EquiposSection.astro`.
  - Background, ancho del shell o grid topRow → `src/sections/08_equipos/EquiposSection.module.css`.
  - Datos de equipos/cruces/resultados → `src/data/teams.json`, `src/data/knockout-matches.json`, `src/data/knockout-results.json`; lógica de resolución → `src/lib/knockout/bracket.js` + `canPredict.js`.
  - Reactivar ficha/favoritos/strips (versión vieja) → reintroducir imports de `TeamCard`/`TeamDetailModal`/`TeamsSummaryStrip` + cargar `equipos.client.js` y emitir `[data-equipos-payload]` en `EquiposSection.astro`.

### `/estadisticas` — 09_estadisticas

- **Página / raíz:** `src/pages/estadisticas.astro` → `src/sections/09_estadisticas/EstadisticasSection.astro`
- **Qué hace:** "DATA ARENA" arcade 100% local: muestra tu resumen personal (cruces pronosticados / podio definido / tus puntos en vivo) + el consenso de la oficina por cruce como barras de votación (a quién hacen avanzar y marcadores más pronosticados).
- **Subcomponentes .astro:**
  - ninguno (solo el raíz; toda la UI dinámica la inyecta el client JS por `innerHTML`)
- **Client JS (navegador):**
  - `estadisticas.knockout.client.js` — único módulo. Lee el payload JSON inline, resuelve la llave con resultados EN VIVO, repinta: stat cards (`data-es-predicted/-podium/-points`), nota de cartones (`data-es-cartones`) y la lista de consenso (`data-es-consensus`). Se re-renderiza ante cambios live vía `subscribeLiveKnockout(render)`.
- **Lógica local (.ts/.js):** ninguna propia de la sección. Toda la lógica vive en `lib/knockout/*` (ver abajo). El consenso y el conteo se delegan a `community.js`.
- **CSS:** estilos `<style>` scoped inline en `EstadisticasSection.astro` (no hay `.module.css`). CRÍTICO: las reglas `.es-vote*` van con `:global(...)` porque los `<li>` los inyecta el cliente por `innerHTML` y no llevan el hash de scope de Astro.
- **lib/ que consume:**
  - `src/lib/knockout/canPredict.js` — `buildTeamsByCode`
  - `src/lib/knockout/bracket.js` — `resolveBracket`, `deriveActualPodium`
  - `src/lib/knockout/community.js` — `buildMatchConsensus`, `countCartones`, `buildPlayerProfile`
  - `src/lib/knockout/scoring.js` — `buildKnockoutLeaderboard`
  - `src/lib/knockout/liveResults.js` — `readLiveKnockout`, `subscribeLiveKnockout`
  - NOTA: `src/lib/statistics/*` (communityStatistics, statCards, statCardsRerank, dataArenaBase, buildScoreRace*, buildChangeEvents) y `src/data/stat-cards/*` NO se usan en esta sección. Solo los referencia `07_fixture` (community split por fila) y se importan entre sí dentro de `lib/statistics/`. Son código muerto para `/estadisticas`.
- **data/ que consume:** (importados en el raíz `.astro` y serializados al payload inline)
  - `src/data/players.json`, `src/data/knockout-matches.json` (`.matches`), `src/data/teams.json`, `src/data/knockout-results.json` (`.slotAssignments`, `.results` = seed), `src/data/knockout-predictions.json` (`.submissions` = dataset oficial de cartones)
- **localStorage keys (solo lectura, solo para "tu resumen"):**
  - `polla:selectedPlayerId` — jugador seleccionado (fallback `"invitado"`; también query `?player=`)
  - `polla:knockoutPredictions` — borrador local de pronósticos (overlay por-cruce, solo del jugador seleccionado)
  - `polla:podiumPredictions` — borrador local de podio (overlay del jugador seleccionado)
  - Live (vía `liveResults.js`): el `subscribe`/`read` puede tocar sus propias claves live; el consenso NO las usa.
- **Hooks data-* clave:** `data-section="estadisticas"`, `data-estadisticas-payload` (JSON inline), `data-es-cartones`, `data-es-predicted`, `data-es-podium`, `data-es-points`, `data-es-consensus`.
- **Gotchas / restricciones:**
  - CONSENSO y "N cartones" leen SOLO `payload.submissions` (dataset compilado, vía `buildBuckets()` → `buildMatchConsensus`/`countCartones`). NUNCA mezclan localStorage. Mezclar el bucket del dispositivo infla el conteo (regla "14 falso / cruces en 12" del MEMORY). No tocar.
  - El localStorage SOLO se superpone en `withMyOverlay()` y SOLO sobre la fila del `playerId` seleccionado, para las 3 stat cards. No afecta consenso ni el total de cartones.
  - El consenso solo lista cruces con AMBOS equipos concretos (`r.codeA && r.codeB`) y con `total > 0`; ordena por nº de cartones desc., luego por `matchNumber`.
  - Las barras de votación se inyectan por `innerHTML` → requieren las reglas `:global(.es-vote*)`; renombrar clases rompe el estilo silenciosamente.
  - Puntos (`data-es-points`) son EN VIVO: `buildKnockoutLeaderboard` con `live.results`; cambian con cada gol sin avanzar el cuadro (coherente con scoring dinámico).
  - `countUp()` respeta `prefers-reduced-motion`; el podio se pinta directo como `N/4` (sin count-up).
- **Para cambiar … → toca:**
  - Texto del hero / eyebrow / labels de las cards / mensaje vacío del consenso → `EstadisticasSection.astro` (markup + `<style>`).
  - Regla de qué cuenta como "cartón" o cómo se computa el consenso/lean/topScores → `src/lib/knockout/community.js`.
  - Qué cruces aparecen en el consenso (filtro ambos equipos / orden) → `estadisticas.knockout.client.js` (`concreteIds`, `.filter`/`.sort` en `render`).
  - Cómo se calcula "Tus puntos" → `src/lib/knockout/scoring.js` (`buildKnockoutLeaderboard`) y `liveResults.js` (fuente de resultados live).
  - Reglas del overlay del borrador local (qué claves, qué jugador) → `estadisticas.knockout.client.js` (`withMyOverlay`, `getPlayerId`).
  - Aspecto de las barras de votación → reglas `:global(.es-vote*)` en `EstadisticasSection.astro` (NO quitar el `:global`).

### `/admin` — 12_admin

- **Página / raíz:** `src/pages/admin.astro` → `src/sections/12_admin/AdminKnockoutSection.astro`
- **Qué hace:** Panel ADMIN LOCAL (oficina) de la llave eliminatoria: tras un candado por contraseña, permite (1) asignar equipos reales a las plazas placeholder (1L/2K/3CEFHI…) y (2) cargar marcadores oficiales con estado EN VIVO / FINALIZADO (incluye definición por penales). Escribe a localStorage y, si está configurado, a Supabase.

- **Subcomponentes .astro:**
  - ninguno (la sección es un único `.astro`; todo el panel está inline en el raíz)

- **Client JS (navegador):**
  - `admin.gate.client.js` — hidrata el candado: lee `[data-admin-gate-form]`, hashea el input con SHA-256 (`crypto.subtle`) y lo compara contra el hash esperado; al match revela `[data-admin-panel]` y guarda flag en sessionStorage; botón logout re-bloquea. NO repinta datos, solo muestra/oculta gate↔panel.
  - `admin.knockout.client.js` — hidrata el panel: lee el payload JSON inline (`[data-admin-payload]`), pinta nombres/labels resueltos (`renderLabels`/`resolveBracket`), maneja selects de asignación, steppers ±, inputs de marcador, botones ganador (penales), `Actualizar` (commit `live`), `Finalizar` (commit `final` con `confirm`) y `Borrar resultados locales`. Persiste vía `writeLocalKnockout` + opcional Supabase.

- **Lógica local (.ts/.js):** `src/lib/knockout/adminResult.js` — `resolveResult({homeScore,awayScore,draftWinner})` → módulo puro sin DOM: decide `outcome` (home/away/draw), `winner`, `resolution` (`regular_time`|`penalties`), `requiresPenaltyWinner`, `canFinalize` (false si empate sin ganador elegido). El frontmatter del `.astro` arma `clientPayload` (matches ordenados por `sortBySlot`, teams lite, seed assignments/results).

- **CSS:** No hay `*.module.css`; todos los estilos son `<style>` scoped dentro de `AdminKnockoutSection.astro` (clases `.adm-*`, candado `.adm-gate*`, estados `[data-state=live/final]`, `[data-dirty]`, `[data-adm-tie]`). Usa tokens `--pm-*` globales.

- **lib/ que consume:**
  - `src/lib/knockout/model` (`sortBySlot`, tipo `KnockoutMatch`) — solo en frontmatter
  - `src/lib/knockout/adminResult.js` (`resolveResult`)
  - `src/lib/knockout/bracket.js` (`resolveBracket`)
  - `src/lib/knockout/canPredict.js` (`buildTeamsByCode`)
  - `src/lib/knockout/liveResults.js` (`readLocalKnockout`, `writeLocalKnockout`; key/evento `polla:knockoutResults` / `polla:knockout-results-updated`)
  - `src/lib/supabase/knockoutData.js` (`upsertResult`, `deleteResult`, `deleteAllResults`, `isSupabaseConfigured`)
  - `src/lib/supabase/client.js` (indirecto, vía re-export de `isSupabaseConfigured`)

- **data/ que consume:** `src/data/knockout-matches.json`, `src/data/knockout-teams.json`, `src/data/teams.json`, `src/data/knockout-results.json` (seed commiteado: `slotAssignments` + `results`).

- **localStorage keys:**
  - `polla:knockoutResults` (lee y escribe; objeto `{slotAssignments, results}`) — fuente de verdad en runtime, mergeado sobre el seed.
  - **sessionStorage** (no localStorage): `polla:adminUnlocked` = `"true"` (flag de gate desbloqueado; se borra al cerrar navegador o logout).

- **Hooks data-* clave:** `data-section="admin"` (scope), gate: `data-admin-gate` / `data-admin-panel` / `data-admin-gate-form` / `data-admin-pass` / `data-admin-error` / `data-admin-logout`; panel: `data-admin-payload` (JSON inline), `data-adm-assign={code}`, `data-adm-match={id}`, `data-adm-name=home|away`, `data-adm-score=home|away`, `data-adm-step` + `data-dir`, `data-adm-winner=home|away`, `data-adm-pick`, `data-adm-update`, `data-adm-finish`, `data-adm-state`, `data-adm-adv-label`, `data-adm-clear`. Datasets de estado: `data-played`, `data-draft-winner`, `data-adm-tie`, `[data-dirty]`, `[data-state]`.

- **Gotchas / restricciones:**
  - La contraseña NUNCA está en el repo: solo el hash SHA-256. `FALLBACK_HASH` hardcodeado en `admin.gate.client.js` línea 10 (clave de oficina actual); override opcional con env `PUBLIC_ADMIN_PASSWORD_HASH` (de `.env.local`, gitignored). Es candado de UI puramente client-side, NO seguridad server-side.
  - `crypto.subtle` requiere contexto seguro (HTTPS/localhost); sin él el gate muestra error y no desbloquea.
  - `Actualizar` guarda `status:"live"` (NO avanza el cuadro ni suma puntos); `Finalizar` guarda `status:"final"` (avanza + suma) y exige marcador completo + ganador de penales si hubo empate (`resolveResult.canFinalize`).
  - Carga de marcador habilitada solo si ambos lados del cruce son equipos concretos (`codeA && codeB`); placeholders sin resolver dejan inputs/botones disabled.
  - `mergeResults` (liveResults) protege: un `final` del seed NO es pisado por un `live` local viejo. Borrar marcador (ambos scores vacíos en commit) elimina el resultado y lo borra también de Supabase.
  - Escritura a Supabase es opcional (gated por `isSupabaseConfigured()`); requiere policy de escritura (migración 0002), si falla queda local y avisa por consola. `Borrar` llama `deleteAllResults()`.
  - Cualquier cambio de marcador propaga a `/fixture`, `/predicciones`, `/tabla` vía evento `polla:knockout-results-updated` + `storage`. El estado borrador (steppers/tipeo) NO se persiste hasta Actualizar/Finalizar.

- **Para cambiar … → toca:**
  - Cambiar la contraseña de admin → regenerar hash con `scripts/hash-admin-password.mjs "nueva-clave"` y reemplazar `FALLBACK_HASH` en `src/sections/12_admin/admin.gate.client.js` (o setear `PUBLIC_ADMIN_PASSWORD_HASH` en `.env.local`).
  - Cambiar la regla de empate/penales o cuándo se puede finalizar → `src/lib/knockout/adminResult.js` (`resolveResult`).
  - Cambiar dónde/cómo se guardan los resultados (key, merge, evento) → `src/lib/knockout/liveResults.js`; la escritura remota → `src/lib/supabase/knockoutData.js`.
  - Cambiar el flujo de revelado/bloqueo del panel (sessionStorage, logout, errores) → `src/sections/12_admin/admin.gate.client.js`.
  - Cambiar UI del panel (steppers, botones, textos hero, asignación, confirmaciones) → `src/sections/12_admin/AdminKnockoutSection.astro` (markup + `<style>`) y la lógica de interacción en `admin.knockout.client.js`.

### `/tabla` — 13_tabla

- **Página / raíz:** `src/pages/tabla.astro` → `src/sections/13_tabla/TablaKnockoutSection.astro` · hideFooter (pantalla única sin scroll; desktop/tablet ≥768px fija al viewport, escalera y preds scrollean interno)
- **Qué hace:** "Carrera SECPLAN" — ranking en vivo de eliminatorias. IZQ: podio top-3 (foto+medalla) + escalera de ranking (barra de progreso + flechas de movimiento). DER: card del partido en curso (live) + tabla de predicciones por jugador + leyenda de puntos. Puntúa cartones contra los resultados vivos del admin; el marcador EN VIVO suma provisional (cambia con cada gol) pero NO avanza el cuadro.
- **Subcomponentes .astro:**
  - ninguno — la sección es un único `.astro` monolítico (todo el markup vive en el raíz)
- **Client JS (navegador):**
  - `src/sections/13_tabla/tabla.knockout.client.js` — único script. Lee el payload JSON inyectado (`[data-tabla-payload]`), construye el leaderboard y repinta TODO en cada tick: posiciones/total (count-up), barra de progreso relativa al líder, píldoras de movimiento (▲/▼), podio top-3, card live del próximo cruce, y tabla de predicciones (marcador, bandera del equipo que avanza, pts dinámicos) reordenada por cercanía al marcador actual. Se re-renderiza vía `subscribeLiveKnockout` (localStorage/admin) y, si Supabase está on, vía `subscribeKnockout` (Realtime).
- **Lógica local (.ts/.js):** ninguna propia de la sección. NOTA: `src/lib/tabla/*` (`calculatePlayerStandings.ts`, `calculatePlayerMovement.ts`, `formatRankingRows.ts`, `calculateCurrentMatchAccuracy.ts`, `getLiveOrRelevantMatch.ts`, `types.ts`, `resolveDisplayWindow.js`) son LEGADO de la versión de grupos (V1): solo se importan entre sí, NINGUNO lo consume la sección knockout actual. No tocar para cambios de /tabla.
- **CSS:** no hay `*.module.css`. Todo es `<style>` scoped en `TablaKnockoutSection.astro` (clases `tk-*`; usa tokens `--pm-*` y `--pm-sec-tabla-a/b`). El cálculo de puntos del panel (`matchPts`) es un **wrapper fino sobre `scoreKnockoutMatch`** (el mismo scorer del ranking) → ya NO diverge *(fix 2026-06-29: antes era copia simplificada que daba +3 a cualquier exacto y nunca el +5 lone-wolf)*.
- **lib/ que consume:** (todas desde el client)
  - `src/lib/knockout/canPredict.js` (`buildTeamsByCode`)
  - `src/lib/knockout/bracket.js` (`deriveActualPodium`, `resolveBracket`)
  - `src/lib/knockout/scoring.js` (`buildKnockoutLeaderboard` → `scoreKnockoutMatch`, `scorePodium`)
  - `src/lib/knockout/schedule.js` (`findNextMatch`)
  - `src/lib/knockout/liveResults.js` (`readLiveKnockout`, `subscribeLiveKnockout`)
  - `src/lib/supabase/knockoutData.js` (`isSupabaseConfigured`, `fetchSubmissions`, `fetchResults`, `subscribeKnockout`)
  - `src/lib/supabase/client.js` (indirecto: `getSupabase` carga `@supabase/supabase-js` dinámicamente)
- **data/ que consume:** `src/data/players.json`, `src/data/knockout-matches.json` (`.matches`), `src/data/teams.json`, `src/data/knockout-results.json` (`.slotAssignments`, `.results` → seed), `src/data/knockout-predictions.json` (`.submissions`). Inyectados como `clientPayload` JSON en el raíz.
- **localStorage keys (solo lectura):**
  - `polla:knockoutPredictions` — drafts de marcadores; se MERGEAN por cruce sobre lo remoto/dataset (no reemplazan el bucket)
  - `polla:podiumPredictions` — drafts de podio; mismo merge
  - (lectura adicional de live vía `readLiveKnockout` en `lib/knockout/liveResults.js` — ahí vive la key de resultados del admin)
- **Hooks data-* clave:** `data-section="tabla"` (root), `data-tabla-payload` (JSON), `data-tabla-body` + `data-tabla-row={id}` (escalera), `data-cell="pos|total|bar"`, `data-tabla-move`, `data-tabla-note` (status hero), `data-tabla-count`, `data-tabla-podium` + `data-podium="1|2|3"` (+ `data-podium-avatar/name/pts`), `data-tabla-cruce*` (when/home/away/-flag/score/state) live card, `data-tabla-preds` + `data-tabla-pred={id}` (+ `data-pred-flag/score/adv/pts`). Estados pintados: `data-started`, `data-state`, `data-change`, `data-leader`, `data-rank`, `data-pts-pos`, `data-pts-live`, `data-empty`.
- **Supabase / fallback (documentado):** capa OPCIONAL gated por env (`PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, fallback legado `PUBLIC_SUPABASE_ANON_KEY`). Si NO está configurado → `isSupabaseConfigured()` es false, `fetch*` devuelven `null`, y la web corre 100% local con los JSON commiteados + localStorage. Si SÍ → al cargar hace `pull()` (`fetchSubmissions`+`fetchResults`), setea `remoteSubmissions`/`remoteResults` (drop-in con la misma forma que los JSON), re-renderiza, y se suscribe a Realtime (`subscribeKnockout` sobre tablas `knockout_predictions/_results/_podium`). Lectura pública (publishable key, `persistSession:false`); el SDK se importa dinámicamente solo si está on (no infla bundle). Cualquier error queda silenciado y cae al dataset local. Escrituras (`upsertResult`/`deleteResult`/`deleteAllResults`) existen pero las usa el ADMIN, no /tabla.
- **Gotchas / restricciones:**
  - NO borrar/renombrar los hooks `data-tabla-*` / `data-pred-*` / `data-cell` / `data-podium*`: el client los busca por selector exacto y reordena los `<li>` existentes (no recrea DOM).
  - El payload se serializa en el raíz con `set:html={JSON.stringify(...)}`; cambiar la forma de `clientPayload` rompe el parseo en el client.
  - `matchPts` (panel de predicciones, inline en el client) ahora **delega en `scoreKnockoutMatch`** (recibe `allForMatch` = todas las predicciones del cruce) → incluye lone-wolf y coincide con el ranking. ⚠️ Para que el +5 lone-wolf salga bien, hay que pasarle SIEMPRE todas las predicciones del cruce; un `matchPts(pred, res)` sin el 3er arg trataría el exacto como compartido (+3).
  - Tanto el total del ranking (`buildKnockoutLeaderboard`) como el panel por cruce (`matchPts`→`scoreKnockoutMatch`) usan el MISMO scorer; ya no hay dos caminos divergentes.
  - localStorage se MERGEA por cruce sobre lo remoto (no reemplaza el bucket): un draft local no debe borrar el cartón ya cargado.
  - Sin scroll de página en desktop/tablet (≥768px la `.tk` es `height: 100svh - header` con `overflow:hidden`); romper esto rompe el criterio "pantalla única".
  - `src/lib/tabla/*` es legado de grupos — no confundir con la lógica activa en `src/lib/knockout/*`.
- **Para cambiar … → toca:**
  - Texto del hero / eyebrow / título o status inicial → `TablaKnockoutSection.astro` (markup) y/o el texto de `noteNode` en `tabla.knockout.client.js` (línea ~285).
  - Reglas de puntaje (RANKING total **y** panel por cruce) → **único lugar:** `src/lib/knockout/scoring.js` (`scoreKnockoutMatch`/`scorePodium`) sobre `src/lib/liveMatch/liveScoring.js` (`calculatePointsForPrediction`, lone-wolf). El panel solo lo envuelve con `matchPts` en `tabla.knockout.client.js` (NO re-implementar reglas ahí).
  - Cómo se elige el "partido en curso" / próximo cruce → `src/lib/knockout/schedule.js` (`findNextMatch`) + `resolveBracket` en `src/lib/knockout/bracket.js`.
  - Origen de datos vivos (admin/local vs Supabase) → `src/lib/knockout/liveResults.js` (local) o `src/lib/supabase/knockoutData.js` (remoto); el gate env vive en `src/lib/supabase/client.js`.
  - Estética/layout (colores, podio, barras, breakpoints, fit-to-viewport) → bloque `<style>` en `TablaKnockoutSection.astro`.

---

## 🧠 Capa lib (el cerebro)

### Capa lib — Knockout / Live / Scoring (el "cerebro")

#### knockout (`src/lib/knockout/`)

- `src/lib/knockout/model.ts` — **exports:** tipos `SlotType`, `KnockoutSlot`, `KnockoutMatch`, `AdvanceSide`, `PredictionStatus`, `KnockoutPrediction`, `ResolvedSlot` · fns `sortBySlot()`, `getKnockoutStatusLabel()` · **hace:** contrato de tipos del modelo de slots/cruces + 2 helpers (ordenar por `bracketSlot`, etiqueta de estado) · **consumido por:** referenciado por JSDoc en toda la capa; `sortBySlot`/label en secciones fixture/predicciones.
- `src/lib/knockout/canPredict.js` — **exports:** `isConcreteSlot()`, `canPredictMatch()`, `buildTeamsByCode()`, `resolveSlot()` · **hace:** regla "se puede predecir ahora" (solo R32 `open` con ambos lados `type:"team"`) + resuelve un slot a objeto display (bandera/label) · **consumido por:** `bracket.js`, predicciones/fixture client.
- `src/lib/knockout/bracket.js` — **exports:** `normalizeResults()`, `resultWinnerSide()`, `resolveSlotCode()`, `resolveBracket()`, `deriveActualPodium()` · **hace:** núcleo del cuadro — resuelve cada slot a equipo concreto propagando ganadores ronda a ronda (recursivo, anti-ciclo DAG), marca `played`/`predictionEnabled`/`winnerCode`/`loserCode`; un marcador `live` NO avanza el cuadro; deriva podio real de P104/P103 · **consumido por:** fixture (`fixture.bracket.client.js`, `FixtureSection`), proximo, predicciones, estadisticas, tabla, scoring.js (importa `normalizeResults`).
- `src/lib/knockout/bracketTree.js` — **exports:** `buildBracketTree()`, `sideRoundsOrder` (`["R32","R16","QF","SF"]`) · **hace:** topología del árbol-espejo SOLO desde `winnerTo` (no hardcodea ids): LEFT/RIGHT (subárboles de las 2 SF) + CENTER (F P104 + 3P P103), orden vertical post-orden por `bracketSlot` · **consumido por:** `BracketTree.astro`, `BracketColumn.astro`, fixture render.
- `src/lib/knockout/schedule.js` — **exports:** `scheduleKey()`, `findNextMatch()`, `recentResults()` · **hace:** sobre la salida de `resolveBracket`, halla próximo cruce concreto no jugado (determinista vía `nowKey` string) y los N resultados recientes · **consumido por:** `ProximoSection.astro` / `proximo.knockout.client.js`.
- `src/lib/knockout/validation.js` — **exports:** `toScore()`, `scoreStatus()`, `isAdvanceSet()`, `inferAdvance()`, `isTie()`, `predictionStatus()`, `matchIsComplete()`, `predictableMatches()`, `validateKnockout()` · **hace:** valida el bucket de un jugador SOLO sobre cruces `predictionEnabled` (R32 concretos); exige marcador + lado que avanza · **consumido por:** `predicciones.knockout.client.js` / `PrediccionesSection.astro`.
- `src/lib/knockout/adminResult.js` — **exports:** `resolveResult()` · **hace:** desde /admin decide cómo cerrar un cruce — ganador en cancha vs empate→penales (requiere `draftWinner` para `canFinalize`), `resolution` `regular_time`/`penalties`; penales no cambian marcador · **consumido por:** `admin.knockout.client.js` / `AdminKnockoutSection.astro`.
- `src/lib/knockout/scoring.js` — **exports:** `PODIUM_POINTS` (5/3/1/1), `scoreKnockoutMatch()`, `scorePodium()`, `buildKnockoutLeaderboard()` · **hace:** puntaje eliminatorias = BASE por marcador (lone wolf 5 / exacto 3 / tendencia 1, excluyente) + BONUS PENALES (+1, solo final empatado con avance acertado) + podio; arma leaderboard marcando líneas `live` como provisional · **consumido por:** `tabla.knockout.client.js`; importa `calculatePointsForPrediction` (liveScoring) y `normalizeResults` (bracket).
- `src/lib/knockout/podium.js` — **exports:** `PODIUM_SLOTS`, `PODIUM_LABELS`, `normalizePodium()`, `validatePodium()` · **hace:** valida el podio del jugador (4 slots distintos dentro de los 32 válidos, sin duplicados/inválidos) · **consumido por:** predicciones (UI de podio), scoring.js usa el mismo orden de slots.
- `src/lib/knockout/community.js` — **exports:** `buildMatchConsensus()`, `countCartones()`, `buildPlayerProfile()` · **hace:** estadística coral — consenso por cruce (lean home/away/split, %, top-3 marcadores) y perfil corto del jugador, desde cartones agregados · **consumido por:** `estadisticas.knockout.client.js`. (NOTA: per MEMORY, /estadisticas debe leer SOLO el dataset compilado, no localStorage.)
- `src/lib/knockout/liveResults.js` — **exports:** `KNOCKOUT_RESULTS_KEY`, `KNOCKOUT_RESULTS_EVENT`, `mergeResults()`, `readLiveKnockout()`, `readLocalKnockout()`, `writeLocalKnockout()`, `subscribeLiveKnockout()` · **hace:** estado vivo de la llave en localStorage mergeado sobre seed (`knockout-results.json`); regla: un `final` del seed NO lo pisa un `live` local viejo; emite evento + `storage` para sincronizar pestañas · **consumido por:** admin/fixture/proximo/predicciones/tabla/estadisticas knockout clients (fuente de verdad runtime local).

#### liveMatch (`src/lib/liveMatch/`)

- `src/lib/liveMatch/types.ts` — **exports:** tipos `GroupStateName`, `MatchPhase`, `ActiveWindowMatch`, `ActiveWindow`, `EffectiveResult` · **hace:** contrato (solo JSDoc, sin runtime) de la capa DEFINICION SIMULTANEA · **consumido por:** referenciado por JSDoc en `activeWindow.js`, `buildPointLedger.js`, `scoring/types.ts`.
- `src/lib/liveMatch/liveMatchPhase.js` — **exports:** `LIVE_MATCH_PHASE` (`official`/`live`/`pending`), `resolveLiveMatchPhase()` · **hace:** tri-estado del marcador compartido — oficial gana; goles>0 = live; 0-0 decide por reloj vs kickoff; ambiguo nunca regala puntos · **consumido por:** `activeWindow.js` (único gating de fase).
- `src/lib/liveMatch/activeWindow.js` — **exports:** `resolveActiveWindow()`, `resolveEffectiveResults()` · **hace:** F1 — ÚNICO lugar que decide "qué marcador vivo cuenta" (gateado por fase) y mapea `*TeamScore→*Score`; arma ventana 1..N por grupo (+ hermanos oficiales), flag `isSimultaneous`; `resolveEffectiveResults` = resultado efectivo por match (oficial pisa live) · **consumido por:** `buildPointLedger.js`, `liveMultiControl.js`, `buildScoreRaceTimeline.js`. Importa `buildMatchSequence` (fixture) y `resolveLiveMatchPhase`.
- `src/lib/liveMatch/liveScoring.js` — **exports:** `getOutcome()`, `hasCompletePrediction()`, `isExact()`, `isTendencyCorrect()`, `countExactPredictionsForResult()`, `calculatePointsForPrediction()`, `clamp()`, `getExactStatus()`, `getGoalDistance()`, `getGoalsNeededToExact()`, `getOvershoot()`, `calculateLiveAccuracy()`, `accuracyLevelFromPercent()` · **hace:** FUENTE ÚNICA de puntaje (lone wolf 5 / exacto 3 / tendencia 1, no aditivo) + precisión visual (% cercanía al exacto, no es puntaje) · **consumido por:** `knockout/scoring.js`, `scoring/buildPointLedger.js`, `tabla/*` (SSR + recompute live), fixture client, statistics.
- `src/lib/liveMatch/liveMatchState.js` — **exports (muchas):** keys/eventos (`LIVE_MATCH_STATE_KEY`, `LIVE_MATCHES_KEY`, `OFFICIAL_RESULTS_KEY`, `GROUP_CLOSURES_KEY`, eventos), `MULTI_LIVE_WRITE_ENABLED` (=`true`), helpers puros `pickNewestLiveMatch()`/`mapClosureRow()`/`dedupeClosuresByVersion()`, lectura/escritura local `readLiveMatches()`/`readLiveMatchState()`/`saveLiveMatchState()`/`setLiveScore()`/`clearLiveScore()`/`readOfficialResults()`/`saveOfficialResult()`/`deleteOfficialResult()`/`finalizeOfficialResult()`/`readGroupClosures()`/`readLiveSnapshot()`/`subscribeLiveData()`/`resolveCurrentMatch()`, sesión admin `hasValidAdminSession()`/`getAdminSessionToken()`/`clearAdminSession()` · **hace:** estado de marcadores/resultados 100% LOCAL (localStorage + eventos same-tab/storage), sin Supabase/RPC/realtime · **DESHABILITADO (modo seguridad):** `loginAdmin()`, `closeGroup()`, `reopenGroup()` lanzan error; `isRemoteLiveDataEnabled()` siempre `false`; `validateAdminSession()` solo local · **consumido por:** `liveMultiControl.js`, `predictionEditAccess.js`, `buildScoreRaceTimeline.js`, fixture client, `GroupStandingsPanel.astro`.
- `src/lib/liveMatch/liveMultiControl.js` — **exports:** `buildLiveControlModels()`, `buildLiveScorePayload()`, `buildFinalizeResult()`, `resolveAdminControlWindow()` · **hace:** lógica pura del control MULTI-marcador del Admin (DEFINICION SIMULTANEA) — modelos de control por partido activo, payloads para `setLiveScore`/`finalizeOfficialResult`; `resolveAdminControlWindow` resuelve el PAR simultáneo desde el fixture (phase `live`/`ready`/`official`) para arrancar ambos desde cero · **consumido por:** UI admin (`liveMultiControl.client.js`, referenciada en comentarios). Reusa `resolveActiveWindow` y `resolveCurrentMatch`.

#### scoring (`src/lib/scoring/`)

- `src/lib/scoring/types.ts` — **exports:** tipos `StandingRow`, `GroupSituation`, `LedgerOrigin`, `LedgerEstado`, `LedgerRegla`, `PointLedgerLine`, `GroupClosure`, `GroupBonusLine`; re-export `GroupStateName` · **hace:** contrato del libro contable (solo JSDoc, sin runtime) · **consumido por:** JSDoc en `buildPointLedger.js`.
- `src/lib/scoring/buildPointLedger.js` — **exports:** `buildPointLedger()` · **hace:** F3 — libro contable derivado por líneas (total nunca se guarda: oficial = suma `final`, proyectado = `final`+`provisional`, `anulado`=0); función pura sobre resultado efectivo × predicción × reglas; soporta invalidación (reapertura). **Líneas de bono de GRUPO ELIMINADAS** con la migración a eliminatorias (comentario interno; puntaje fase B pendiente) · **consumido por:** tabla/statistics (vía resultado efectivo). Reusa `calculatePointsForPrediction`, `resolveActiveWindow`, `resolveEffectiveResults`.

#### otros

- `src/lib/fixture/matchSequence.js` — **exports:** `buildMatchSequence()`, `padLabel()` · **hace:** numera partidos por orden CRONOLÓGICO real (`dateUtc`), no por `matchNumber` FIFA; SOLO visual (matchId→1..N) · **consumido por:** `activeWindow.js`, `buildScoreRaceTimeline.js`, fixture (`fixture.map.md`).
- `src/lib/playerIdentity.js` — **exports:** `PLAYER_IDENTITY_EVENT`, `PLAYER_IDENTITY_KEYS`, `publishConfirmedPlayer()`, `resolveConfirmedPlayer()`, `syncPredictionLinks()` · **hace:** identidad del jugador seleccionado — persiste en local/sessionStorage + URL `?player=`, resuelve snapshot (id/name/avatar/avatarThumb), reescribe links a `/predicciones?player=` · **consumido por:** `JugadorSection.astro` (único import directo encontrado).

**Conceptos clave del modelo eliminatorias:**

- **Slots = equipo concreto o placeholder:** `type` ∈ `team`/`group`/`third`/`winner`/`runner-up`; `winner/runner-up` referencian el cruce origen vía `from` y se resuelven recursivamente (`resolveSlotCode`). La llave es un DAG con guarda anti-ciclo (`seen`).
- **`winnerTo`/`loserTo` encadenan la llave:** `bracketTree.js` reconstruye la topología SOLO desde `winnerTo` (no hardcodea ids P73–P104); el orden vertical es post-orden por `bracketSlot`.
- **Estado-cero R16+:** solo R32 es predecible (`canPredictMatch`: `round==="R32"` + `status==="open"` + ambos lados `type:"team"`). Rondas posteriores se MUESTRAN como placeholders y se desbloquean progresivamente (`predictionEnabled` = ambos `codeX` concretos y `!played`).
- **El cuadro AVANZA solo con FINAL, nunca con LIVE:** en `bracket.js`, `resolveSlotCode` devuelve `null` si `result.status==="live"`; `played` exige `status!=="live"`. Un marcador en vivo no mueve equipos ni deriva podio.
- **Live dynamic scoring (provisional):** el leaderboard (`buildKnockoutLeaderboard`) SÍ suma puntos de marcadores `live` y marca cada línea con `live:true` para que la UI lo muestre tentativo (cambia con cada gol); el cuadro/podio no se mueve hasta finalizar.
- **Puntaje no aditivo + bonus separado:** BASE excluyente (lone wolf 5 / exacto 3 / tendencia 1, fuente única `calculatePointsForPrediction`); el exacto NO suma además tendencia. BONUS PENALES (+1) es independiente y solo en final empatado con avance acertado. Podio: 5/3/1/1.
- **Tri-estado de fase (`resolveLiveMatchPhase`):** oficial > live > pending; un 0-0 "preparado" por Admin no puntúa antes del kickoff; ante ambigüedad nunca regala puntos. `activeWindow.js` es el ÚNICO gating de fase y el único que mapea `*TeamScore→*Score`.
- **Total reconstruido, nunca guardado:** `buildPointLedger` suma líneas (`final`=oficial, `+provisional`=proyectado, `anulado`=0). Las líneas de bono de GRUPO fueron eliminadas con la migración; el puntaje de eliminatorias (partido+podio) de fase B está pendiente.
- **Modo seguridad total (sin backend):** `liveMatchState.js` es 100% localStorage; `loginAdmin`/`closeGroup`/`reopenGroup` están deshabilitados (lanzan error); `liveResults.js` protege resultados `final` del seed frente a `live` locales viejos al mergear.

### Capa lib — Estadísticas / Tabla / Predicciones / Supabase / Assets

> CONTEXTO CRÍTICO: tras la migración V2 (grupos→eliminatorias), la web consume `lib/knockout/*` (secciones `09_estadisticas`, `13_tabla`, `12_admin`). **Todos los módulos de `lib/statistics/` y `lib/tabla/` son LEGACY de la fase de grupos: huérfanos en runtime web; solo los referencian tests** (`tests/score-race-timeline.test.mjs`, `tests/stat-cards-rerank.test.mjs`). Marcados abajo como `[LEGACY/huérfano]`.

#### statistics (legacy grupos — NO consumido por secciones web)

- `src/lib/statistics/buildChangeEvents.js` — **exports:** `buildChangeEvents`, `deriveRanking` · **hace:** motor diff SOLO-LECTURA "Qué cambió" (F8): narra goles/reorders/impactos por diferencia de 2 snapshots; no recalcula puntaje · **consumido por:** nadie (ni tests). `[LEGACY/huérfano]`
- `src/lib/statistics/buildScoreRaceNarrative.js` — **exports:** `buildScoreRaceNarrative` · **hace:** genera frases automáticas ("Carrera de Puntaje") por partido/jugador desde el timeline (líder, salto, racha seca) · **consumido por:** `tests/score-race-timeline.test.mjs`. `[LEGACY/huérfano en web]`
- `src/lib/statistics/buildScoreRaceTimeline.js` — **exports:** `buildScoreRaceTimeline`, `RACE_PALETTE` · **hace:** acumula puntaje partido-a-partido (eje X cronológico estable) usando `liveScoring.calculatePointsForPrediction`; bono de grupo, clusters, ranking/movimiento · **consumido por:** `tests/score-race-timeline.test.mjs`. `[LEGACY/huérfano en web]`
- `src/lib/statistics/communityStatistics.js` — **exports:** `getOutcome`, `getConsensusLevel`, `buildMatchPulses`, `buildQualifierConsensus`, `buildPlayerComparisons`, `buildPlayerProfiles`, `buildCommunityAnalysis`, `mergeLocalPlayer` · **hace:** análisis comunidad fase-grupos (pulsos por partido, consenso clasificados, perfiles/badges, comparaciones, favoritos) · **consumido por:** nadie. `[LEGACY/huérfano]` (reemplazado por `lib/knockout/community.js`)
- `src/lib/statistics/dataArenaBase.ts` — **exports:** `getArenaUniverseSize`, `getArenaHighlights`, `getArenaDuels` + tipos `ArenaHighlightEntry/Category`, `ArenaDuelSide/Entry` · **hace:** accessor de `data/stat-cards/data-arena-13.json` (corte canónico 13); solo lee/recorta y resuelve avatares desde `players.json`, no recalcula · **consumido por:** nadie. `[LEGACY/huérfano]`
- `src/lib/statistics/statCards.ts` — **exports:** `getPlayerStatCards`, `getPlayerStatCard`, `getStatCardPlayerIds`, `hasStatCard` + tipos (`PlayerStatCard`, `StatSubCard`, `RawStatCardFile`, etc.) · **hace:** registry de fichas jugables (`data/stat-cards/players/*.json` vía `import.meta.glob`), las rerankea al universo e indexa por playerId · **consumido por:** nadie (solo su dependencia rerank tiene test). `[LEGACY/huérfano]`
- `src/lib/statistics/statCardsRerank.ts` — **exports:** `rerankToUniverse` + tipo `RankDirection` · **hace:** recalcula rank/of de las fichas sobre el universo completo sin mutar JSON fuente (infiere dirección asc/desc; throws si datos inconsistentes) · **consumido por:** `statCards.ts` y `tests/stat-cards-rerank.test.mjs`. `[LEGACY salvo test]`
- `src/lib/statistics/types.ts` — **exports (tipos):** `CommunityPrediction`, `QualifiedPrediction`, `CommunityPredictionDataset`, `PlayerPredictionProfile`, `MatchCommunityPulse`, `PlayerComparison`, `QualifierConsensus` · **hace:** contratos TS del dataset comunidad fase-grupos · **consumido por:** ninguno (no importado). `[LEGACY/huérfano]`

#### tabla (legacy grupos — NO consumido; la web V2 usa `lib/knockout/scoring.js`)

- `src/lib/tabla/calculateCurrentMatchAccuracy.ts` — **exports:** `calculateCurrentMatchAccuracy` · **hace:** filas de precisión del partido actual (predicción vs resultado vivo/oficial) vía `liveScoring` · **consumido por:** nadie. `[LEGACY/huérfano]`
- `src/lib/tabla/calculatePlayerMovement.ts` — **exports:** `calculatePlayerMovement` · **hace:** up/down/same/new comparando posición vs previa · **consumido por:** `calculatePlayerStandings.ts` (interno). `[LEGACY]`
- `src/lib/tabla/calculatePlayerStandings.ts` — **exports:** `calculatePlayerStandings` · **hace:** ranking completo de la tabla (puntos/exactos/tendencia/racha/performance) sobre resultados `finished`, orden cronológico vía `matchOrder`; usa `liveScoring` · **consumido por:** nadie. `[LEGACY/huérfano]`
- `src/lib/tabla/formatRankingRows.ts` — **exports:** `formatRankingRows` · **hace:** clampa `performance` a 0–100 redondeado · **consumido por:** `calculatePlayerStandings.ts` (interno). `[LEGACY]`
- `src/lib/tabla/getLiveOrRelevantMatch.ts` — **exports:** `getLiveOrRelevantMatch` · **hace:** elige partido actual/siguiente (live > no-terminado > primero) y su resultado · **consumido por:** nadie. `[LEGACY/huérfano]`
- `src/lib/tabla/resolveDisplayWindow.js` — **exports:** `resolveDisplayWindow`, `windowImpactForPlayer` · **hace:** ventana de DISPLAY para definición simultánea (partidos a la misma hora agrupados por grupo, presentacional, no puntúa) + impacto provisional por jugador desde el ledger · **consumido por:** nadie. `[LEGACY/huérfano]`
- `src/lib/tabla/types.ts` — **exports (tipos):** `Movement`, `StreakHit`, `AccuracyLevel`, `Player`, `Team`, `Match`, `MatchResult`, `Prediction`, `ScoringRules`, `RankingRow`, `MatchAccuracyRow` · **hace:** contratos TS de la tabla de grupos · **consumido por:** los `.ts` de esta misma carpeta. `[LEGACY]`

#### predictions (parcialmente vivo)

- `src/lib/predictions/predictionAccess.js` — **exports:** `PREDICTION_ACCESS_STATES`, `PREDICTION_EDIT_SESSION_KEY`, `PREDICTION_CORRECTION_DRAFTS_KEY`, `getOfficialSubmission`, `countCompletePredictions`, `isLocallyComplete`, `isEditSessionLocallyValid`, `resolvePredictionAccess`, `buildOfficialPlayerBuckets`, `isStatisticsUnlocked`, `isStatisticsUnlockedFromStorage` · **hace:** estado de acceso a predicciones/estadísticas (oficial vs local, sesión de edición); gate de "estadísticas desbloqueadas" leyendo storage. NOTA: usa `totalMatches=72` (modelo grupos) por defecto · **consumido por:** `src/sections/07_fixture/fixture.client.js` (`isStatisticsUnlockedFromStorage`). **VIVO (parcial)**
- `src/lib/predictions/predictionEditAccess.js` — **exports:** `isPredictionEditRemoteEnabled`, `getPredictionEditSession`, `savePredictionEditSession`, `clearPredictionEditSession`, `readPredictionCorrectionDrafts`, `writePredictionCorrectionDraft`, `clearPredictionCorrectionDrafts`, `redeemPredictionEditCode`, `validatePredictionEditSession`, `createPredictionEditCode`, `revokePredictionEditAccess`, `listPredictionEditAccess`, `subscribePredictionEditSession` · **hace:** "MODO SEGURIDAD TOTAL" — drafts de corrección 100% locales; **toda función remota (canje/generación/revocación de códigos vía RPC) está DESHABILITADA: lanza Error o devuelve vacío** · **consumido por:** `src/sections/03_jugador/JugadorSection.astro` (cargado vía `?url`). **VIVO (stub local)**
- `src/lib/predictions/types.ts` — **exports (tipos):** `PredictionAccessStatus`, `PredictionEditSession`, `PredictionAccessState`, `PredictionCorrectionMetadata` · **hace:** contratos TS del acceso a predicciones · **consumido por:** no importado directamente. `[solo doc]`

#### storage

- `src/lib/storage/resetPollaState.js` — **exports:** `POLLA_STORAGE_VERSION` (`production-reset-2026-06-27-knockout-v2`), `POLLA_IDENTITY_STORAGE_KEYS`, `POLLA_LOCAL_STORAGE_KEYS`, `POLLA_SESSION_STORAGE_KEYS`, `resetPollaLocalState`, `ensurePollaStorageVersion` · **hace:** purga/migra localStorage en bump de versión (limpia legado de grupos `polla:predictions/qualifiedPredictions/...`, estrena `knockoutPredictions/podiumPredictions`); preserva identidad opcionalmente · **consumido por:** `src/sections/03_jugador/JugadorSection.astro` (vía `?url`). **VIVO**

#### supabase

- `src/lib/supabase/client.js` — **exports:** `isSupabaseConfigured`, `getSupabase` · **hace:** cliente único browser (publishable key); **gated por env** (`PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY`/legacy `_ANON_KEY`); import dinámico de `@supabase/supabase-js`; devuelve `null` si no configurado · **consumido por:** `knockoutData.js`. **VIVO (gated)**
- `src/lib/supabase/knockoutData.js` — **exports:** `isSupabaseConfigured` (re-export), `fetchSubmissions`, `fetchResults`, `upsertResult`, `deleteResult`, `deleteAllResults`, `subscribeKnockout` · **hace:** capa datos knockout sobre Supabase (lectura cartones/podio/resultados con la misma forma que los JSON; escritura/borrado de resultados para admin; realtime). Todo devuelve `null`/`false`/no-op si Supabase off · **consumido por:** `src/sections/13_tabla/tabla.knockout.client.js` (lectura+subscribe) y `src/sections/12_admin/admin.knockout.client.js` (upsert/delete). **VIVO (gated)**

#### stadiums / ui-assets

- `src/lib/stadiums/getStadiumAsset.ts` — **exports:** `getStadiumAsset` + tipo `StadiumAsset` · **hace:** resuelve asset de estadio por nombre (normaliza acentos; busca por nombre oficial y `knownAs`) desde `data/stadiums-assets.json`; `null` si no hay match · **consumido por:** `src/sections/07_fixture/MatchInfoPanel.astro`. **VIVO**
- `src/lib/ui-assets/uiAssets.ts` — **exports:** `INLINE`, `AWARD`, `STATUS`, `MOVEMENT`, `HERO` + tipo `UiAsset` · **hace:** single source of truth de assets WebP por tier (intrínsecos w/h anti-CLS); regla: no mezclar tiers en un grupo visual · **consumido por:** `src/sections/01_inicio/StepCards.astro`, `02_reglas/RuleCard.astro` + `ScoringRow.astro`, `03_jugador/PlayerWarningNote.astro`, `07_fixture/BracketMatchCard.astro`, `08_equipos/TeamsSummaryStrip.astro`. **VIVO**

**Integración Supabase:**

- **Gated por env:** sin `PUBLIC_SUPABASE_URL`+publishable key, `getSupabase()` devuelve `null` y la web cae 100% a los JSON commiteados (fallback local automático en cada `fetch*`).
- **service_role solo en scripts:** el browser usa únicamente la *publishable/anon* key (lectura pública); la carga de cartones con `service_role` vive fuera de `src/` (scripts), nunca en el bundle web.
- **Lectura web con fallback local:** `fetchSubmissions`/`fetchResults` retornan datos con la MISMA forma que `knockout-predictions.json`/`seedResults`, drop-in; si error o no-config → `null` → el caller usa el dataset local.
- **Páginas ya conectadas:** `/tabla` (sección `13_tabla`, lee + realtime `subscribeKnockout`) y el admin (`12_admin`, escribe `upsertResult`/`deleteResult`/`deleteAllResults`). La sección `09_estadisticas` lee del dataset local (`lib/knockout/community.js`), no de Supabase.
- **Realtime:** `subscribeKnockout` escucha `knockout_predictions`/`knockout_results`/`knockout_podium`; no-op si Supabase off.

**Notas de mantenimiento (load-bearing):**

- Para tocar **puntaje/tabla/estadísticas en la web V2**, el archivo correcto está en `lib/knockout/*` (`scoring.js`, `community.js`, `bracket.js`, `liveResults.js`), **NO** en `lib/statistics/` ni `lib/tabla/` (legacy grupos, solo tests los referencian).
- `predictionAccess.js` y `predictionEditAccess.js` siguen asumiendo el modelo de **72 partidos / códigos RPC de grupos**; la edición remota está apagada (stubs que lanzan Error). Si se reactiva edición en V2, este es el archivo a reescribir.

---

## 📦 Catálogo de datos

### Catálogo de datos (`src/data/`)

Fuente de verdad en producción = los **knockout-*.json** + `teams.json` + `players.json` (+ asset manifests usados por libs). Todo lo demás (`predictions.json`, `results.json`, `official-results.json`, `fixture.json`, `scoring-rules.json`, `equipos-info.json`, `match-h2h-*.json`, `admin-dashboard.json`, `team-covers.*.json`) NO se importa en ningún `.astro/.ts/.js` real → **legacy de la era de grupos** o datos de referencia sin consumir. Los `*.mock.json` son de wireframe/dev.

#### Knockout (fuente de verdad en runtime SSR)

- `src/data/knockout-matches.json` — **contiene:** `_doc`, `rounds[6]{round,roundLabel,totalMatches}`, `matches[32]{id,matchNumber,round,roundLabel,bracketSlot,dateCL,timeCL,slotA/B…}` · **leído por:** 04_predicciones, 06_proximo, 07_fixture, 08_equipos, 09_estadisticas, 12_admin, 13_tabla · **mock?:** no
- `src/data/knockout-teams.json` — **contiene:** `_doc`, `totalSlots`, `slots[32]{code,name,teamId,concrete,slotType}` · **leído por:** 01_inicio/FlagMarquee, 04_predicciones, 12_admin · **mock?:** no
- `src/data/knockout-results.json` — **contiene:** `_doc`, `slotAssignments{…}`, `results[]{matchId,homeScore,awayScore,winner,status}` · **el SEED commiteado**; runtime real = localStorage (`liveResults.js`) · **leído por:** 03,04,06,07,08,09,12,13 · **mock?:** no
- `src/data/knockout-predictions.json` — **contiene:** `_doc`, `schemaVersion`, `submissions[13]{playerId,predictions,podium}` · **leído por:** 03_jugador, 04_predicciones, 09_estadisticas, 13_tabla (y forma esperada por `lib/supabase/knockoutData.js`) · **mock?:** no

#### Equipos / jugadores (fuente de verdad)

- `src/data/teams.json` — **contiene:** ARRAY[48]`{id,name,shortCode,group,confederation,flag,crest,crestThumb,coverImage,coverImageThumb}` · **leído por:** 01,04,06,07,08,09,13 · **mock?:** no
- `src/data/players.json` — **contiene:** ARRAY[13]`{id,name,avatar,avatarThumb,status}` (los 13 jugadores reales) · **leído por:** 03,09,13 + `lib/statistics/dataArenaBase.ts`, `statCards.ts` · **mock?:** no

#### Stat-cards (⚠️ LEGACY — solo las lee `lib/statistics/*`, que es huérfana; **/estadisticas NO las usa**, usa `lib/knockout/community.js`)

- `src/data/stat-cards/data-arena-13.json` — **contiene:** `schemaVersion,competition,validation,players,playerStats,playerCardsIndex,rankings,matches,classificationConsensus,pairwiseInteractions,globalHighlights,implementationNotes` (dataset YA resuelto por generador) · **leído por:** `lib/statistics/dataArenaBase.ts` *(legacy/huérfano en web)* · **mock?:** no
- `src/data/stat-cards/players/card_jugable_jugador_*.json` (13 archivos) — **contiene:** `schemaVersion,cardPlayableId,fileSlug,player,playableCard,summaryStats,rankings,specialRanksAscending,cards,statDetails,implementationNotes` · **leído por:** `lib/statistics/statCards.ts` (glob `stat-cards/players/*.json`) *(legacy/huérfano en web)* · **mock?:** no
  - ⚠️ **Roster CONGELADO en nómina vieja:** los slugs son `01_carlos, 02_chelo, 03_felipe, 04_eric, 06_humberto, 07_isaias, 08_luis, 09_luis_renato, 10_jaime, 11_narigon, 12_pancho, 13_italo, 14_tanke` (numeración con saltos: sin `05`, sin `15`). Incluyen `eric`/`isaias`/`luis` que **ya NO están en `players.json`** (la nómina actual tiene además `antonio`/`martin`/`ale`). NO hay correspondencia 1:1 con la nómina viva — otra señal de que este dataset es legacy de grupos.

#### Assets manifests (usados por libs)

- `src/data/stadiums-assets.json` — **contiene:** `schemaVersion,project,total,assets` · **leído por:** `lib/stadiums/getStadiumAsset.ts` · **mock?:** no
- `src/data/confederations-assets.json` — **contiene:** `schemaVersion,assetSet,basePath,total,items` · **leído por:** `components/ui/ConfederationLogo.astro` · **mock?:** no
- `src/data/team-covers.assets.manifest.json` — **contiene:** `schemaVersion,assetType,project,section,count,items` · **leído por:** NADIE (no importado) · **mock?:** no — **manifest huérfano** (covers ya viven en `teams.json`)

#### Predicciones / resultados (LEGACY era-grupos — NO importados)

- `src/data/predictions.json` — **contiene:** `schemaVersion,source,snapshotAt,expectedPlayers,confirmedCards,totals,submissions[13],predictions[936]{playerId,matchId,groupId,homeScore,awayScore},qualifiedPredictions[312]{groupId,position,teamId},derivationWarnings,previousPositions` · **leído por:** NADIE en código (solo doc en `wireframe.astro`) · **mock?:** no — **legacy de fase de grupos** (936 = 13×72 partidos de grupos)
- `src/data/results.json` — **contiene:** `source,lastUpdatedLabel,matchday{current,total},currentMatchId,nextMatchId,results[0]` · **leído por:** NADIE (solo wireframe) · **mock?:** no — **legacy** (`results` vacío)
- `src/data/official-results.json` — **contiene:** `source,snapshotAt,count,results[4]{matchId,matchNumber,homeTeamScore,awayTeamScore,status}` · **leído por:** NADIE (solo comentario en `matchSequence.js`) · **mock?:** no — **legacy/referencia**
- `src/data/fixture.json` — **contiene:** `source,generatedFor,totalMatches,groupIds[12],matches[72]{id,matchNumber,roundNumber,groupId,groupLabel,stage,dateUtc,dateChile}` · **leído por:** NADIE (solo wireframe/comentarios) · **mock?:** no — **legacy fixture de 72 partidos de grupos**

#### Reglas / scoring (no importado)

- `src/data/scoring-rules.json` — **contiene:** `source,rules{exact,tendency,loneWolf},labels[3]{id,label}` · **leído por:** NADIE en código (scoring real está en `lib/`) · **mock?:** no — referencia/legacy

#### Equipos-info / H2H (datos de referencia, no consumidos)

- `src/data/equipos-info.json` — **contiene:** `schema_version,nombre_dataset,descripcion,fuente_base,uso_sugerido_codex,equipos[48]{id,seleccion,confederacion,formaciones,titulo,informacion_secundaria/terciaria}` · **leído por:** NADIE (solo wireframe) · **mock?:** no — dataset editorial no cableado
- `src/data/match-h2h-fifa-wikipedia.json` — **contiene:** `schema_version,dataset,generatedAt,source_policy{…},matches[72]{matchNumber,id,group,stage,dateChile,timeChile,location}` · **leído por:** NADIE (solo wireframe) · **mock?:** no — H2H de 72 partidos de grupos, **legacy**

#### Admin (no importado)

- `src/data/admin-dashboard.json` — **contiene:** `source,session{status,email,name,role},system{status,dataMode,supabase,localJson,apiConnection,errors},admin{confirmedCards,pendingRequests,officialResultsLoaded,…},activityLog[0]` · **leído por:** NADIE (12_admin usa knockout-*; solo wireframe lo cita) · **mock?:** no — legacy del dashboard pre-knockout

#### Mocks (.mock.json — wireframe/dev, NO producción)

- `src/data/predictions.mock.json` — `source,playerId,predictions,qualifiedPredictions` · **mock?:** sí
- `src/data/results.mock.json` — `source,lastUpdatedLabel,matchday,currentMatchId,nextMatchId,results` · **mock?:** sí
- `src/data/match-info.mock.json` — `source,generatedFor,notes,defaultInfo,matches` · **mock?:** sí
- `src/data/admin-dashboard.mock.json` — `source,session,system,admin,activityLog` · **mock?:** sí
- `src/data/match-preview.mock.json` — `source,defaultContext,matches,teams` · **mock?:** sí
- `src/data/table-predictions.mock.json` — `source,previousPositions,predictions` · **mock?:** sí

Ninguno de los `.mock.json` se importa en código real (no aparecen en grep de `import`). Son de wireframe/dev.

### JSON de la RAÍZ de `site/` (fuera de `src/data/`)

Detectados pero NO catalogados en profundidad (referenciados como semilla de carga, no leídos por la web en runtime):

- `site/polla_secplan_2026_eliminatorias_seed.json` — seed de eliminatorias (probable origen de los knockout-*).
- `site/predicciones_<jugador>_<fecha>.json` (13 archivos: carlos, chelo, eric, felipe, humberto, isaias, italo, jaime, luis, luis_renato, narigon, pancho, tanke) — cartones originales por jugador, fuente de la que se compila `knockout-predictions.json`.
- No existe `*.map.md` en `src/data/` (Glob vacío). No hay JSON de datos en la raíz del proyecto por encima de `site/`.

---

## 🧩 Capa compartida (layout · UI · estilos · scripts · config · supabase · assets)

### Layout & navegación

- `src/layouts/BaseLayout.astro` — shell HTML único. Props: `title`, `description`, `backgroundPreloadHref` (preload AVIF opcional), `hideFooter` (pantallas de viewport único). Importa los 5 CSS (reset, tokens, fonts, accessibility, animations); inline script añade `.motion-ready` a `<html>` salvo reduced-motion (anti-FOUC); preload de 3 woff2 Barlow (700/800/900) + Inter; favicon `.ico`; `<Header/>` → `<main><slot/></main>` → `<Footer/>` (omitido si `hideFooter`); carga `src/scripts/motion.js` al final.
- `src/components/layout/Header.astro` — header sticky. Nav de 10 rutas (orden): `/` Inicio, `/reglas`, `/jugador`, `/predicciones`, `/proximo-partido` (label "Próximo"), `/tabla`, `/fixture` (label "Llave"), `/equipos`, `/estadisticas`, `/admin`. Activo por `normalizePath(href)===currentPath` → `aria-current="page"` (estilo amarillo). `view-transition-name: site-header`. Desktop encoge ≤1180px; oculta nav ≤900px (pasa a MobileMenu). El `.admin-lock`/SVG en CSS no se usa (sin markup).
- `src/components/layout/Footer.astro` — footer estático. Texto "Polla Mundialera SECPLAN 2026 — Clean V2 Alpha 01 · {year}" + placa FIFA (`/assets/brand/fifa/fifa-wordmark-blue.webp`).
- `src/components/layout/MobileMenu.astro` — `<details>` con overlay fullscreen (≤900px). Recibe `links` del Header; reusa `aria-current`. Bloquea scroll del body con `:has(.mobile-menu[open])`. `.admin-lock` declarado sin uso.

### Componentes UI compartidos

- `src/components/ui/ArcadeButton.astro` — `<a>` botón. Props: `label`, `href`, `variant` (primary|secondary|ghost|danger|success|info|purple|pink|orange|lime).
- `src/components/ui/ArcadeCard.astro` — `<article>` contenedor con `<slot/>`. Prop: `variant` (default|highlight|locked|solid-blue|solid-cyan|solid-purple|solid-pink|solid-orange|solid-coral|solid-lime|striped|danger).
- `src/components/ui/StatusPill.astro` — píldora de estado. Props: `label` (req), `tone` (neutral|active|locked|warning|live|upcoming|finished|completed|success|error|danger|info); `live` pulsa.
- `src/components/ui/LockedPanel.astro` — panel bloqueado (gradiente morado, contenido `<slot/>` atenuado). Prop: `message`.
- `src/components/ui/EmptyState.astro` — estado vacío con borde discontinuo. Prop: `message`.
- `src/components/ui/SectionTitle.astro` — encabezado de sección. Props: `eyebrow`, `title`, `titleAccent` (texto con gradiente), `subtitle`, `tone` (blue|purple|cyan|pink|orange); slots `title` y default.
- `src/components/ui/TeamFlag.astro` — bandera. Props: `team`{id,name,shortCode,flag}, `src`, `alt`, `size` (xs–xl), `rounded`, `decorative`, `className`. Fallback: `/assets/flags/<id>.svg` → shortCode.
- `src/components/ui/TeamCrest.astro` — escudo. Props: `team`{...,crest,crestThumb}, `src`, `alt`, `size`, `variant` (full|thumb; auto por size), `decorative`, `className`. Fallback: `/assets/crests/[thumbs/]<id>.webp`.
- `src/components/ui/ConfederationLogo.astro` — logo de confederación leído de `src/data/confederations-assets.json`. Props: `code`/`confederation`, `size` (xs–lg), `decorative`, `className`.
- `src/components/ui/TeamCoverImage.astro` — `<figure>` portada de equipo 3:2. Props: `team`{id,name,coverImage,coverImageThumb} (req), `variant` (full|thumb), `alt`, `className`. Fallback: `/assets/teams/covers/[thumbs/]<id>.webp`.

### Estilos & tokens

- `src/styles/reset.css` — reset mínimo (box-sizing, márgenes, body con `--pm-smoke`/`--font-ui`, listas/links normalizados).
- `src/styles/fonts.css` — `@font-face` Barlow Condensed (600/700/800/900), Inter (variable 400–800), Rajdhani (600/700); redeclara `--font-display`/`--font-ui`/`--font-score` (se importa tras tokens y gana).
- `src/styles/accessibility.css` — `prefers-reduced-motion` global (anula animaciones), `:focus-visible` outline azul, `.sr-only`.
- `src/styles/animations.css` — capa de motion global: keyframes de entrada (fadeUp/Down/In, scaleIn, popIn, blurIn, slideInLeft/Right, clipReveal, dealIn), loops arcade (shineSweep, ctaBreathing, glowPulse, floatBob, spinSlow, livePulse, countdownTick), momentos `.is-*` (selected-burst, saved-punch, check-pop, unlock-burst, row-rise, live-pulse, score-pop, countdown-tick, swap-in, feedback-flash), page-transitions cross-document (`@view-transition` + `pageWipeOutBlue`/`pagePunchInYellow` sobre `root`), `.has-shine`, modal `dialog[data-team-modal]`. Define `--pm-stagger/--pm-dur-*/--pm-translate-in/--pm-spring-out`. Driver: `.motion-ready [data-animate].in-view`.
- `src/styles/tokens.css` — único archivo de variables. Nombres reales:
  - Fuentes: `--font-display`, `--font-ui`, `--font-score`.
  - Escala tipográfica: `--type-mega/-hero/-section/-functional/-block/-card/-body-lg/-body/-small/-micro`.
  - Base clara: `--pm-white/-smoke/-ice/-sky-soft/-blue-mist/-panel-soft`.
  - Azul: `--pm-blue-900/-800/-700/-600/-500/-400/-300/-100`. Cian: `--pm-cyan-600/-500/-400/-200/-glow`. Amarillo/dorado: `--pm-yellow-300/-400/-500/-600`, `--pm-gold-500/-700/-glow`. Morado: `--pm-purple-700/-600/-500/-400/-200/-glow`. Verde: `--pm-green-700/-600/-500/-100`, `--pm-mint-500/-300`. Rojo: `--pm-red-600/-500/-400/-100/-glow`. Naranja: `--pm-orange-600/-500/-400/-100`. Fluor (Fase 6): `--pm-lime-500/-400/-300/-100`, `--pm-pink-600/-500/-400/-100`, `--pm-magenta-600/-500/-400/-100`, `--pm-neon-{blue,cyan,purple,pink,lime,orange,coral}`.
  - Neutrales: `--pm-text-main/-strong/-body/-soft/-muted`, `--pm-border-soft/-blue`.
  - Radios: `--pm-radius-xs/-sm/-md/-lg/-xl/-pill`. Sombras: `--pm-shadow-card/-card-strong/-yellow/-blue/-cyan/-purple/-pink/-lime/-orange/-coral/-soft`.
  - Navbar: `--pm-navbar-bg/-bg-2/-text/-text-hover/-border/-active-bg/-active-text` (`-active-text` usado; sin `--pm-navbar-text-hover`/`-active-text` faltante — todos definidos).
  - CTA Rey: `--pm-cta-bg/-text/-border/-shadow/-bg-hover/-shadow-hover`.
  - Spacing: `--space-xs/-sm/-md/-lg/-xl/-2xl`. Z: `--z-base/-header/-overlay`. Layout: `--layout-header-height`.
  - Aliases retro (Fase 3A, a retirar): `--font-body`, `--color-bg/-text/-muted/-line`, `--color-arcade-{blue,yellow,pink,green}`, `--radius-sm/-md/-lg/-xl` → usados por los wireframe components.
  - Podio: `--pm-rank-{gold,silver,bronze}` + `-bg`.
  - Focus rings: `--pm-focus-ring`, `--pm-focus-ring-yellow/-pink`.
  - Transiciones: `--pm-transition-fast/-base/-slow`; easings `--ease-out/-in-out/-drawer`.
  - Estados funcionales: `--pm-state-{default,hover,active,selected,confirmed,completed,locked,disabled,error,error-soft,warning,warning-soft,success,live,upcoming,finished,danger}-{bg,text,border}`.
  - Por sección: `--pm-sec-{inicio,reglas,jugador,predicciones,tabla,partido,fixture,equipos,estadisticas,admin}-{a,b,c,gradient}`.
  - Por grupo A–L: `--pm-group-a … --pm-group-l`.
  - NOTA: no existen tokens `--ko-*` en este archivo (los `--ko-rs`/fit-to-viewport del bracket viven en `src/sections/07_fixture`, no en la capa compartida).

### Scripts de animación

- `src/scripts/motion.js` — motor de entrada global (cargado por BaseLayout, re-corre por navegación cross-document). (1) guarda reduced-motion; (2) `IntersectionObserver` agrega `.in-view` a `[data-animate]`; (3) count-up de `[data-countup]` (sufijos/decimales, `data-countup-duration`); (4) dispatcher: busca `main [data-section]` y hace `import()` dinámico del momento GSAP del mapa `MOMENTS` (solo `inicio`, `jugador`), preocultando `[data-moment]` por `visibility` hasta cargar.
- `src/scripts/moments/inicio.js` — momento hero Inicio (GSAP). Targets `[data-moment=title-main|title-accent|trophy|trophy-glow]`, `[data-trophy-rays|-shine]`, `.spark`. Timeline de entrada (copa cae con rebote) + loops idle (float, glow, rotación de rayos, destello, chispas).
- `src/scripts/moments/jugador.js` — momento hero Jugador (GSAP). Targets `[data-moment=selected-card|player-grid]`; entrada escalonada tipo "reparto de cromos", `clearProps:transform` para no romper `:hover`.

### Wireframe (dev tool)

- `src/pages/wireframe.astro` — ruta `/wireframe`: vista técnica que tabula las 10 secciones (code, estado, zonas, componentes futuros, assets/data pendientes) desde un array inline `sections`. No es navegación real (lo advierte en pantalla). Usa los 3 componentes wireframe.
- `src/components/wireframe/WireframeBox.astro` — caja de borde discontinuo con `label` opcional y `<slot/>`. Usa aliases `--color-*`/`--radius-*`.
- `src/components/wireframe/WireframeGrid.astro` — grid de N columnas. Prop `columns` (default 1; colapsa a 1col ≤700px).
- `src/components/wireframe/WireframeLabel.astro` — etiqueta inline. Prop `variant` (zone|component|note).

### Config, build & deploy

- `astro.config.mjs` — `build.inlineStylesheets:"always"`; `prefetch` `prefetchAll:true` + `defaultStrategy:"hover"`; Vite `optimizeDeps.include:["@supabase/supabase-js"]` (evita 504 en dev). Sin adapter/integraciones (output estático por defecto).
- `package.json` — v`0.1.0-alpha.01`, ESM. Scripts: `dev`/`start` (`astro dev`), `build`, `preview`, `astro`, `test` (`node --test tests/*.test.mjs`), `supabase:sync` (`node scripts/sync-supabase.mjs`). Deps: `@supabase/supabase-js` ^2.108.2, `astro` ^6.3.7, `gsap` ^3.15.0. (Nota: usa `sharp` en `make-player-avatar.cjs` pero no está declarado en deps.)
- `tsconfig.json` — extiende `astro/tsconfigs/strict`; incluye todo, excluye `dist`.
- `.env.example` — vars: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (web), `SUPABASE_SECRET_KEY` (script), `ADMIN_PASSWORD`, `CARTONES_DIR`. (El script de hash menciona además `PUBLIC_ADMIN_PASSWORD_HASH`, que el `.env.example` no lista.)
- `.gitignore` — ignora `dist/`, `.astro/`, `node_modules/`, `.env*` (incl. `.local`), `.secrets/`, editores, `.agents/`, `_asset_backups/`, y un `site/` anidado accidental.

### Supabase (SQL + sync)

- `supabase/migrations/0001_knockout_polla.sql` — crea 4 tablas: `players` (espejo de players.json), `knockout_predictions` (PK player_id+match_id, cartones P73–P104), `knockout_podium` (PK player_id), `knockout_results` (PK match_id, status live|final). Activa RLS con SELECT público (anon+authenticated); escritura solo service_role. Grants + suma las 3 tablas dinámicas a Realtime. Idempotente.
- `supabase/migrations/0002_admin_results_write.sql` — abre escritura de `knockout_results` a anon/authenticated (policy `for all` + grants insert/update/delete) para que /admin publique marcadores con la publishable key. Idempotente.
- `supabase/README.md` — runbook: web 100% local por defecto, Supabase opcional por env; pasos crear proyecto → correr 0001 → `.env.local` → `npm run supabase:sync` → /tabla lee en vivo con fallback local.

### Scripts utilitarios (`scripts/`)

- `scripts/hash-admin-password.mjs` — imprime el SHA-256 hex de la clave pasada como arg, para pegar como `PUBLIC_ADMIN_PASSWORD_HASH` en `.env.local` (no guarda la clave).
- `scripts/make-player-avatar.cjs` — con `sharp`, genera avatar de jugador: full `public/assets/players/<id>.webp` (1086x1448, cover/attention) + thumb `.../thumbs/<id>.webp` (512x512, cover desde top). Uso: `node ... <id> "<ruta-fuente>"`.
- `scripts/sync-supabase.mjs` — sincroniza Supabase vía service_role (UPSERT idempotente). Carga env de `.env.local`/`.env`. Fuentes: `src/data/players.json` (con prune de bajas), `knockout-results.json`, dataset `knockout-predictions.json`, y cartones sueltos de `CARTONES_DIR` (default `../cartones`). Flags: `--check` (read-only), `--dry-run`, `--dir=`, `--no-players/-results/-dataset/-cartones`.

### Assets públicos (`public/`)

- `public/fonts/` — woff2+ttf de Barlow Condensed (600/700/800/900), Inter variable, Rajdhani (600/700).
- `public/data/community-predictions.json` — único JSON público (predicciones de comunidad; el resto de datasets viven en `src/data/`).
- `public/assets/` — con `README.md`. Categorías:
  - `backgrounds/` — fondos por sección en 3 formatos (`avif/`, `webp/`, `preview/`).
  - `brand/fifa/` — wordmarks FIFA (footer).
  - `confederations/` — 6 logos webp (afc, caf, concacaf, conmebol, ofc, uefa).
  - `copa/` — `trophy-worldcup-main.webp`. `trophy/` y `ui/` y `videos/` están vacíos.
  - `crests/` — 49 escudos webp (+ `thumbs/` referenciado por TeamCrest). `flags/` — 48 banderas SVG.
  - `players/` — 14 avatares webp (+ `thumbs/`); convención del `make-player-avatar.cjs`.
  - `stadiums/` — 16 fotos de estadio webp (`stadium-<code>.webp`).
  - `teams/covers/` — portadas de equipo (full + `thumbs/`).
  - `polla-mundialera/` — banco de assets de marca (`00_shared/`, `by-role/`, `sections/`, `README_ASSETS.md`).

---

## ✅ Tests (`tests/` · `npm test` = `node --test tests/*.test.mjs`)

Todos son de la era **knockout V2** (Node test runner, sin DOM). Mapeo test → módulo que protege:

| Test | Protege |
|---|---|
| `knockout.test.mjs` | modelo/validación general del cuadro (`lib/knockout/model`, `validation`) |
| `knockout-bracket.test.mjs` | `lib/knockout/bracket.js` — `resolveBracket`, propagación de ganadores, *live no avanza* |
| `bracket-tree.test.mjs` | `lib/knockout/bracketTree.js` — topología del árbol espejo desde `winnerTo` |
| `knockout-scoring.test.mjs` | `lib/knockout/scoring.js` — lone wolf/exacto/tendencia, bonus penales, podio |
| `knockout-community.test.mjs` | `lib/knockout/community.js` — consenso por cruce, `countCartones` |
| `knockout-merge-results.test.mjs` | `lib/knockout/liveResults.js` — `mergeResults` (un `final` del seed no lo pisa un `live` viejo) |
| `admin-result.test.mjs` | `lib/knockout/adminResult.js` — `resolveResult` (empate→penales, `canFinalize`) |
| `live-match-phase.test.mjs` | `lib/liveMatch/liveMatchPhase.js` — tri-estado oficial/live/pending |
| `seam-snapshot-shape.test.mjs` | `lib/liveMatch/liveMatchState.js` — forma del snapshot (testeable en Node) |
| `client-entry-bundling.test.mjs` | que los `*.client.js` bundlean sin romper imports |
| `score-race-timeline.test.mjs` | `lib/statistics/buildScoreRaceTimeline.js` — **LEGACY grupos** (solo lo cubre el test) |
| `stat-cards-rerank.test.mjs` | `lib/statistics/statCardsRerank.ts` — **LEGACY grupos** (solo lo cubre el test) |

---

## 🚨 Gotchas globales (no romper)

Reglas transversales que ya costaron tiempo. Las que aplican a **V2** están marcadas; el catálogo completo
(incluye trampas de la **era grupos**, hoy en su mayoría legacy) está en `gotchas.md` — verifícalo contra el código.

1. **El cuadro AVANZA solo con resultado `final`, nunca con `live`.** Un marcador en vivo SÍ suma puntos
   *provisionales* (cambia con cada gol) pero NO mueve equipos ni deriva podio. Lógica única en `lib/knockout/bracket.js`
   (`resolveSlotCode` devuelve `null` si `status==="live"`).
2. **Puntaje NO aditivo:** lone wolf **5** / exacto **3** / tendencia **1** (excluyente) + bonus penales **+1**
   (solo final empatado con avance acertado) + podio **5/3/1/1**. Fuente única: `lib/liveMatch/liveScoring.js`
   (`calculatePointsForPrediction`) → `lib/knockout/scoring.js`. ✅ Desde 2026-06-29 el panel de `/tabla`
   también pasa por este scorer (su `matchPts` envuelve `scoreKnockoutMatch`): **un solo lugar para las reglas**,
   no re-implementar. El LONE WOLF (+5 exacto único) exige conocer TODAS las predicciones del cruce — pasar
   siempre `allForMatch`; sin eso, un exacto único se cuenta como compartido (+3). Fue el bug del panel (mostraba +3 en vez de +5).
3. **CSS de nodos creados por `innerHTML` no recibe scope** → usar `:global(...)` anclado a data-attr
   (`09_estadisticas` `.es-vote*`, `06_proximo` `.px-recent*`). Renombrar la clase rompe el estilo en silencio.
4. **SSR pinta un seed; el cliente re-resuelve con el live** → pueden diferir (p. ej. `06_proximo` usa `nowKey` hora
   Chile solo en el cliente). Nunca bloquees el primer paint esperando el live.
5. **Orden cronológico por `dateUtc`/`dateCL`, no por `matchNumber`** (FIFA no es cronológico). Mismo criterio en
   `/fixture`, `/proximo-partido` y el listado de cruces.
6. **Identidad:** valida `polla:selectedPlayerId` contra `players.json`; si el jugador ya no existe, límpialo
   (`/jugador` lo hace al cargar). Al cambiar el contrato de identidad, sincroniza `lib/playerIdentity.js`,
   `JugadorSection.astro`, `lib/storage/resetPollaState.js` **y este mapa**.
7. **Modo seguridad total (sin backend obligatorio):** `lib/liveMatch/liveMatchState.js` es 100% localStorage;
   `loginAdmin`/`closeGroup`/`reopenGroup` y la edición remota de `lib/predictions/predictionEditAccess.js` están
   **deshabilitadas (lanzan Error)**. Supabase es opcional, gated por env; la *service_role* vive solo en `scripts/`, nunca en el bundle.
8. **Gate de `/admin` es UI client-side** (hash SHA-256, `crypto.subtle` exige HTTPS/localhost), **no** seguridad
   server. La contraseña NUNCA está en el repo: solo `FALLBACK_HASH` en `admin.gate.client.js` u override
   `PUBLIC_ADMIN_PASSWORD_HASH` en `.env.local` (gitignored). Regenerar con `scripts/hash-admin-password.mjs`.
9. **Pantalla única (`hideFooter`):** contenido extra rompe el "first view". `/fixture` usa `fit()` **height+width-bound**
   y resta el alto de `[data-bottom-hud]`; la escala por ronda es de *layout* (`--ko-rs`), no `transform` (rompería la medición de conectores).
10. **Performance se mide con `npm run build && npm run preview`** (el dev server compila bajo demanda y no representa
    producción). GSAP carga lazy por momento, omitido en reduced-motion.
11. **Borrar card/componente compartido = limpiar TODOS los consumidores.** Muchos componentes de sección y todo
    `lib/statistics`+`lib/tabla` son huérfanos (solo `wireframe.astro`/tests). Borrarlos rompe `/wireframe`, no la página real.
12. **Docs viejos mienten en parte:** `gotchas.md`, los `*.map.md` por sección y `mapa_sitio_trabajo_secciones_final.md`
    describen mucho de la **era grupos** (72 partidos, desempate FIFA, cierre de grupo, bonos 1º/2º). Verifica contra el código.

---

## 📚 Documentos y archivos de referencia en la raíz (`site/`)

No son código; son contexto/bitácora. Listados para saber que existen (varios están **parcialmente desactualizados**):

- **Producto/diseño:** `PRODUCT.md`, `DESIGN.md`, `README.md`, `SKILL.md`, `GUIA_ARCADE_JUEGO.md`.
- **Mapas previos:** `MAPA_ACTUALIZADO_2026-06-27.md`, `mapa_sitio_trabajo_secciones_final.md` (~80KB, mayormente era grupos),
  y los `*.map.md` por sección en `src/sections/NN_*/` (estado por sección; varios describen V1 — este `map.md` los reemplaza como índice maestro).
- **Trampas:** `gotchas.md` (catálogo durable; mezcla V2 + legacy grupos).
- **Bitácoras de jornada / comandas:** `comanda_definicion_simultanea.md`, `comandas_2026-06-23_*.md`,
  `workflow_2026-06-*.md` (historial de implementación; no es estado actual).
- **Skill:** `polla-mundialera.skill`, `skills-lock.json`, `.agents/` (corridas de diseño, gitignored).
- **Seeds / cartones (raíz, no leídos en runtime):** `polla_secplan_2026_eliminatorias_seed.json`,
  `predicciones_<jugador>_<fecha>.json` (13 cartones originales → se compilan a `src/data/knockout-predictions.json`).
- **Build/secrets:** `dist/` (output, gitignored), `.env.local` (gitignored), `.env.example` (plantilla), `reference.png`.

---

## 🔧 Mantenimiento de este mapa

- Al cambiar **una ruta, una clave de `localStorage`, un JSON de `src/data/`, el flujo de navegación o un contrato
  compartido**, actualiza este `map.md` (y el `*.map.md` local de la sección) en el **mismo cambio**.
- Si agregas un asset nuevo, registra su carpeta en `public/assets/` y el `data/manifest` que lo referencia.
- Docs commiteados preferentemente en ASCII-safe (para que los greps de cierre queden limpios).

*Generado por mapeo automático del código real (workflow de 14 agentes sobre `src/`). Estado: V2 eliminatorias.*
