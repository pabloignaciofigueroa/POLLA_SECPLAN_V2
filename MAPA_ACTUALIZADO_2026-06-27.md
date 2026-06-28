# MAPA ACTUALIZADO — Polla Mundialera SECPLAN 2026

> Generado: 2026-06-27
> Fuente: inventario real del código (conteo de líneas por archivo).
> Estado de este archivo: **PASO 1 (inventario verificado)**. La sección de
> "Cohesión / dependencias" al final se completa con el análisis profundo en curso.

---

## ⬆ Actualización 2026-06-27 (PM) — Rediseño LLAVE (árbol espejo)

`/fixture` ("LLAVE") dejó de ser **columnas planas apiladas** y ahora renderiza un **bracket
espejo** (R32 izq + R32 der → Final central + Tercer puesto) con **conectores**, **trofeo** y
**leyenda de estados**; en móvil (<1080px) **colapsa a columnas**. `/predicciones` recibió un
toque premium (profundidad al interactuar). Base funcional lista y verificada (**build verde,
74 tests**). Pendiente: **fase de DISEÑO HARD** → ver `workflow_2026-06-27_diseno_llave_hard.md`.

**Archivos nuevos:**
- `src/lib/knockout/bracketTree.js` — topología LEFT/CENTER/RIGHT derivada SOLO de `winnerTo` (post-orden por `bracketSlot`). Puro, sin DOM.
- `tests/bracket-tree.test.mjs` — 5 tests del split (orden exacto vs referencia).
- `src/sections/07_fixture/BracketTree.astro` — layout flex anidado + capa SVG de conectores + centro Final/trofeo.
- `src/sections/07_fixture/bracket-tree.client.js` — mide nodos (offsetLeft/Top), dibuja elbows y **ajusta el árbol al ancho** (transform scale). Solo presentación.
- `src/sections/07_fixture/BracketLegend.astro` — leyenda de estados.

**Archivos modificados:**
- `BracketMatchCard.astro` — nueva prop `variant="node"` (nodo compacto solo-lectura) + profundidad en captura. **Conserva todos los hooks** de hidratación.
- `BracketColumn.astro` — acepta/reenvía `variant` (sigue siendo el path móvil/columnas y el de `/predicciones`).
- `FixtureSection.astro` — monta `BracketTree` + `BracketLegend`; **conserva** el payload `data-knockout-readonly` y los clientes.
- `fixture.map.md` — documentado.

**Contrato preservado:** `fixture.bracket.client.js` y `predicciones.knockout.client.js` siguen
hidratando por `[data-ko-match]` + selectores internos (equipos resueltos, ganadores, desbloqueo).
Estado-cero respetado: R16+ = "Ganador P##", nunca se pre-hornean ganadores. 100% local, sin commit.

---

## 0. Qué es el proyecto

- **Nombre:** `polla-mundialera-secplan-2026-clean-v2` (v`0.1.0-alpha.01`)
- **Tipo:** Sitio **Astro 6** + **GSAP 3.15**, modo **LOCAL sin backend remoto**.
- **Persistencia:** `localStorage` (no hay servidor de datos).
- **Descripción (package.json):** "Polla Mundialera SECPLAN 2026 (modo local, sin backend remoto)".
- **Scripts:** `dev` / `start` = `astro dev`, `build` = `astro build`, `preview` = `astro preview`, `test` = `node --test tests/*.test.mjs`.
- **Ubicación del código de la app:** `site/`
- **Raíz del repo (este archivo):** carpeta `...LOCAL_AISLADA/`

---

## 1. Estructura de alto nivel (`site/src/`)

```
src/
├─ pages/        → páginas Astro (delgadas, montan secciones)
├─ layouts/      → BaseLayout.astro
├─ sections/     → 11 secciones de UI numeradas (01_inicio … 11_podio)
├─ components/   → componentes compartidos (layout / ui / wireframe)
├─ lib/          → lógica pura (live match, scoring, predicciones, knockout, tabla, stats…)
├─ data/         → datasets JSON (fixture, equipos, predicciones, stat-cards…)
├─ scripts/      → moments/ (animaciones por sección) + motion.js
└─ styles/       → tokens, reset, animations, fonts, accessibility
```

---

## 2. Páginas y layout (`src/pages`, `src/layouts`)

| Archivo | Líneas | Rol |
|---|---:|---|
| `pages/index.astro` | 11 | Home → sección Inicio |
| `pages/reglas.astro` | 11 | Página Reglas |
| `pages/jugador.astro` | 11 | Página Jugador |
| `pages/predicciones.astro` | 11 | Página Predicciones |
| `pages/equipos.astro` | 11 | Página Equipos |
| `pages/fixture.astro` | 11 | Página Fixture |
| `pages/podio.astro` | 11 | Página Podio |
| `pages/wireframe.astro` | 228 | Página de wireframe/prototipo |
| `layouts/BaseLayout.astro` | 63 | Layout base (head, header/footer, estilos globales) |

> Nota: las páginas son "delgadas" (11 líneas) → toda la UI vive en `sections/`.
> No se ven páginas para `tabla`, `proximo_partido`, `estadisticas` ni `admin` en
> `pages/` — probablemente se montan vía otra ruta/sección (a confirmar en cohesión).

---

## 3. Secciones de UI (`src/sections/`)

### 01_inicio — Landing / Hero
| Archivo | Líneas |
|---|---:|
| `InicioSection.astro` | 23 |
| `InicioSection.module.css` | 77 |
| `HeroCopy.astro` | 103 |
| `PrimaryCTA.astro` | 114 |
| `StepCards.astro` | 161 |
| `TrophyStage.astro` | 182 |
| `FlagMarquee.astro` | 179 |
| `TeamChip.astro` | 49 |
| `inicio.map.md` | 80 (mapa previo de la sección) |

### 02_reglas — Reglas / Puntajes / Fair Play
| Archivo | Líneas |
|---|---:|
| `ReglasSection.astro` | 103 |
| `ReglasSection.module.css` | 97 |
| `RulesHeroHeader.astro` | 113 |
| `RulesCardsGrid.astro` | 58 |
| `RuleCard.astro` | 154 |
| `RulesActionPanel.astro` | 107 |
| `ScoringPanel.astro` | 64 |
| `ScoringRow.astro` | 139 |
| `FairPlayFooter.astro` | 48 |
| `reglas.map.md` | 76 |

### 03_jugador — Identidad / Selección de jugador
| Archivo | Líneas |
|---|---:|
| `JugadorSection.astro` | 542 |
| `JugadorSection.module.css` | 462 |
| `PlayersGrid.astro` | 77 |
| `PlayerCard.astro` | 192 |
| `SelectedPlayerCard.astro` | 130 |
| `PlayerHeroPanel.astro` | 74 |
| `PlayerSelectionCTA.astro` | 85 |
| `PlayerResetAction.astro` | 55 |
| `PlayerWarningNote.astro` | 48 |
| `IdentityMessageCard.astro` | 76 |
| `OfficialPlayerModal.astro` | 54 |
| `jugador.map.md` | 138 |

### 04_predicciones — Carga de pronósticos + knockout
| Archivo | Líneas |
|---|---:|
| `PrediccionesSection.astro` | 187 |
| `PrediccionesSection.module.css` | 60 |
| `PredictionHeroHeader.astro` | 106 |
| `PredictionWorkspace.astro` | 64 |
| `MatchesPanel.astro` | 149 |
| `MatchPredictionRow.astro` | 201 |
| `ScoreInput.astro` | 92 |
| `ProgressCard.astro` | 217 |
| `ProgressSummaryGrid.astro` | 57 |
| `PlayerStatusCard.astro` | 187 |
| `PredictionStatusIcon.astro` | 33 |
| `PredictionSummaryLine.astro` | 35 |
| `PredictionBottomBar.astro` | 204 |
| `SaveAndContinueCTA.astro` | 120 |
| `OfficialPredictionAccessPanel.astro` | 267 |
| `predicciones.export.js` | 123 |
| `predicciones.knockout.client.js` | 244 |
| `predicciones.map.md` | 125 |

### 05_tabla — Ranking / Live match / Simultáneos
| Archivo | Líneas |
|---|---:|
| `TablaSection.astro` | 91 |
| `TablaSection.module.css` | 67 |
| `TablaHero.astro` | 127 |
| `RankingTable.astro` | 289 |
| `RankingRow.astro` | 364 |
| `PodiumStrip.astro` | 182 |
| `MovementIndicator.astro` | 77 |
| `StreakDot.astro` | 55 |
| `AccuracyBar.astro` | 60 |
| `AccuracyLegend.astro` | 122 |
| `LiveMatchCard.astro` | 220 |
| `NextMatchCard.astro` | 121 |
| `JornadaCard.astro` | 72 |
| `LastUpdateCard.astro` | 71 |
| `UpdateNote.astro` | 17 |
| `PlayerPredictionsPanel.astro` | 76 |
| `PlayerPredictionRow.astro` | 225 |
| `SimultaneousPredictions.astro` | 96 |
| `SimultaneousWindow.astro` | 153 |
| `tabla.client.js` | 1040 |
| `tabla.map.md` | 285 |

### 06_proximo_partido — Live personal / What-changed / Impacto
| Archivo | Líneas |
|---|---:|
| `ProximoPartidoSection.astro` | 147 |
| `ProximoPartidoSection.module.css` | 85 |
| `MatchHeroHeader.astro` | 109 |
| `MatchMetaStrip.astro` | 126 |
| `MatchContextPanel.astro` | 227 |
| `MatchReadingPanel.astro` | 117 |
| `FeaturedMatchLayout.astro` | 49 |
| `FeaturedPairLayout.astro` | 129 |
| `TeamMatchCard.astro` | 215 |
| `VersusCenter.astro` | 127 |
| `HistoricalMatchupCard.astro` | 78 |
| `LiveMatchMini.astro` | 165 |
| `LivePersonalCard.astro` | 391 |
| `YourImpactCard.astro` | 292 |
| `WhatChangedFeed.astro` | 294 |
| `NextActionPanel.astro` | 152 |
| `PredictionDeadlineNotice.astro` | 56 |
| `proximo-partido.client.js` | 1090 |
| `proximo-partido.logic.ts` | 89 |
| `proximo-partido.map.md` | 219 |

### 07_fixture — Lista / Bracket / Grupos
| Archivo | Líneas |
|---|---:|
| `FixtureSection.astro` | 80 |
| `FixtureSection.module.css` | 80 |
| `FixtureHero.astro` | 138 |
| `FixtureFilters.astro` | 191 |
| `FixtureSummaryCards.astro` | 150 |
| `FixtureListPanel.astro` | 338 |
| `FixtureDayGroup.astro` | 82 |
| `FixtureMatchRow.astro` | 262 |
| `DayAgendaPanel.astro` | 327 |
| `MatchInfoPanel.astro` | 262 |
| `SelectedMatchHero.astro` | 245 |
| `SelectedMatchPanel.astro` | 45 |
| `GroupStandingsPanel.astro` | 209 |
| `BracketColumn.astro` | 111 |
| `BracketMatchCard.astro` | 306 |
| `NotificationCTA.astro` | 83 |
| `TimezoneNotice.astro` | 57 |
| `fixture.client.js` | 464 |
| `fixture.bracket.client.js` | 60 |
| `fixture.logic.ts` | 280 |
| `fixture.map.md` | 127 |

### 08_equipos — Grid de equipos + detalle
| Archivo | Líneas |
|---|---:|
| `EquiposSection.astro` | 115 |
| `EquiposSection.module.css` | 60 |
| `EquiposHero.astro` | 128 |
| `ConfederationStrip.astro` | 88 |
| `TeamsSummaryStrip.astro` | 152 |
| `TeamCard.astro` | 358 |
| `TeamDetailModal.astro` | 331 |
| `equipos.client.js` | 183 |
| `equipos.logic.ts` | 102 |
| `equipos.map.md` | 120 |

### 09_estadisticas — Data Arena / Stat cards / Score race
| Archivo | Líneas |
|---|---:|
| `EstadisticasSection.astro` | 229 |
| `EstadisticasSection.module.css` | 909 |
| `DataArenaHero.astro` | 124 |
| `StatsHeroLocked.astro` | 197 |
| `StatsDashboard.astro` | 582 |
| `StatsGraphTab.astro` | 314 |
| `StatsProgressCard.astro` | 240 |
| `CardDeck.astro` | 68 |
| `FeaturedCard.astro` | 200 |
| `PlayableStatCard.astro` | 322 |
| `ArenaHighlightsPanel.astro` | 192 |
| `ArenaDuelsPanel.astro` | 268 |
| `LockedPreviewPanel.astro` | 72 |
| `LockedPreviewCard.astro` | 265 |
| `LockOrbVisual.astro` | 62 |
| `UnlockBenefitsPanel.astro` | 91 |
| `UnlockBenefitCard.astro` | 110 |
| `UnlockedBanner.astro` | 66 |
| `AntiCopyNotice.astro` | 61 |
| `MissingPlayerIdentityModal.astro` | 201 |
| `ScoreRaceGraph.astro` | 11 |
| `ScoreRaceLegend.astro` | 19 |
| `ScoreRaceNarrative.astro` | 14 |
| `ScoreRacePopup.astro` | 20 |
| `estadisticas.client.js` | 1258 |
| `score-race.client.js` | 656 |
| `data-arena.client.js` | 17 |
| `estadisticas.logic.ts` | 44 |
| `estadisticas.map.md` | 300 |

### 10_admin — Panel de control
| Archivo | Líneas |
|---|---:|
| `AdminSection.astro` | 181 |
| `AdminSection.module.css` | 296 |
| `AdminHeroHeader.astro` | 125 |
| `AdminSidebar.astro` | 166 |
| `AdminSidebarItem.astro` | 83 |
| `AdminKpiGrid.astro` | 45 |
| `AdminKpiCard.astro` | 112 |
| `AdminActionButton.astro` | 99 |
| `SessionStatusCard.astro` | 113 |
| `SystemStatusPanel.astro` | 160 |
| `RegisteredPlayersPanel.astro` | 52 |
| `PredictionsLoadedPanel.astro` | 120 |
| `PendingRequestsPanel.astro` | 30 |
| `OfficialResultsPanel.astro` | 53 |
| `MatchProgressPanel.astro` | 235 |
| `MiniLiveScoreControl.astro` | 273 |
| `MultiLiveScoreControls.astro` | 270 |
| `ActivityLogPanel.astro` | 39 |
| `BackupExportPanel.astro` | 45 |
| `LocalCleanupPanel.astro` | 56 |
| `DangerousZone.astro` | 63 |
| `admin.client.js` | 1205 |
| `match-progress.client.js` | 356 |
| `admin.logic.ts` | 167 |
| `adminConfirm.js` | 117 |
| `admin.map.md` | 297 |

### 11_podio — Podio
| Archivo | Líneas |
|---|---:|
| `PodioSection.astro` | 244 |
| `podio.client.js` | 130 |

---

## 4. Componentes compartidos (`src/components/`)

### layout
| Archivo | Líneas |
|---|---:|
| `Header.astro` | 143 |
| `MobileMenu.astro` | 208 |
| `Footer.astro` | 62 |

### ui
| Archivo | Líneas |
|---|---:|
| `ArcadeButton.astro` | 187 |
| `ArcadeCard.astro` | 122 |
| `SectionTitle.astro` | 105 |
| `StatusPill.astro` | 121 |
| `LockedPanel.astro` | 69 |
| `EmptyState.astro` | 24 |
| `ConfederationLogo.astro` | 89 |
| `TeamCrest.astro` | 102 |
| `TeamFlag.astro` | 129 |
| `TeamCoverImage.astro` | 60 |

### wireframe
| Archivo | Líneas |
|---|---:|
| `WireframeBox.astro` | 39 |
| `WireframeGrid.astro` | 25 |
| `WireframeLabel.astro` | 33 |

---

## 5. Lógica (`src/lib/`)

### liveMatch — motor de partido en vivo
| Archivo | Líneas |
|---|---:|
| `liveMatchState.js` | 417 |
| `liveMultiControl.js` | 258 |
| `liveScoring.js` | 176 |
| `activeWindow.js` | 165 |
| `liveMatchPhase.js` | 73 |
| `types.ts` | 49 |

### scoring — puntaje
| Archivo | Líneas |
|---|---:|
| `buildPointLedger.js` | 146 |
| `types.ts` | 95 |

### predictions — acceso/edición de pronósticos
| Archivo | Líneas |
|---|---:|
| `predictionEditAccess.js` | 163 |
| `predictionAccess.js` | 149 |
| `types.ts` | 32 |

### knockout — fase eliminatoria
| Archivo | Líneas |
|---|---:|
| `validation.js` | 101 |
| `model.ts` | 65 |
| `podium.js` | 60 |
| `canPredict.js` | 58 |

### statistics — estadísticas comunitarias / stat cards / score race
| Archivo | Líneas |
|---|---:|
| `communityStatistics.js` | 389 |
| `buildChangeEvents.js` | 323 |
| `buildScoreRaceTimeline.js` | 252 |
| `statCardsRerank.ts` | 193 |
| `dataArenaBase.ts` | 184 |
| `statCards.ts` | 171 |
| `buildScoreRaceNarrative.js` | 149 |
| `types.ts` | 92 |

### tabla — ranking
| Archivo | Líneas |
|---|---:|
| `resolveDisplayWindow.js` | 132 |
| `calculatePlayerStandings.ts` | 120 |
| `types.ts` | 86 |
| `calculateCurrentMatchAccuracy.ts` | 69 |
| `getLiveOrRelevantMatch.ts` | 28 |
| `calculatePlayerMovement.ts` | 8 |
| `formatRankingRows.ts` | 8 |

### otros lib
| Archivo | Líneas |
|---|---:|
| `playerIdentity.js` | 124 |
| `fixture/matchSequence.js` | 36 |
| `stadiums/getStadiumAsset.ts` | 34 |
| `storage/resetPollaState.js` | 79 |
| `ui-assets/uiAssets.ts` | 88 |

---

## 6. Datos (`src/data/`)

| Archivo | Líneas | Nota |
|---|---:|---|
| `predictions.json` | 9525 | Pronósticos reales cargados |
| `stat-cards/data-arena-13.json` | 17078 | Dataset grande de Data Arena |
| `match-h2h-fifa-wikipedia.json` | 3193 | Head-to-head histórico |
| `fixture.json` | 1821 | Calendario de partidos |
| `equipos-info.json` | 926 | Info de equipos |
| `team-covers.assets.manifest.json` | 944 | Manifiesto de portadas de equipos |
| `stadiums-assets.json` | 342 | Assets de estadios |
| `confederations-assets.json` | 153 | Assets de confederaciones |
| `players.json` | 93 | Jugadores de la polla |
| `teams.json` | 61 | Equipos |
| `knockout-matches.json` / `knockout-teams.json` | 50 / 38 | Eliminatorias |
| `official-results.json` | 35 | Resultados oficiales |
| `scoring-rules.json` | 22 | Reglas de puntaje |
| `results.json` | 11 | Resultados |
| `admin-dashboard.json` | 31 | Dashboard admin |
| **mocks** (`*.mock.json`) | — | `admin-dashboard`, `match-info`, `match-preview`, `predictions`, `results`, `table-predictions` |
| `stat-cards/players/card_jugable_jugador_*.json` | ~600-730 c/u | 13 tarjetas jugables (1 por jugador) |

> ⚠️ Coexisten datasets **reales** y **mock** (`*.mock.json`). En cohesión se
> verifica cuáles siguen referenciados desde el código.

---

## 7. Scripts y estilos

### scripts
| Archivo | Líneas |
|---|---:|
| `motion.js` | 156 |
| `moments/inicio.js` | 82 |
| `moments/jugador.js` | 38 |
| `moments/proximo.js` | 36 |
| `moments/estadisticas.js` | 25 |

### styles
| Archivo | Líneas |
|---|---:|
| `tokens.css` | 421 |
| `animations.css` | 273 |
| `fonts.css` | 70 |
| `reset.css` | 61 |
| `accessibility.css` | 31 |

---

## 8. Archivos de proceso / documentación en `site/`

- `DESIGN.md`, `PRODUCT.md`, `README.md`, `SKILL.md`, `gotchas.md`
- Mapas previos: `mapa_sitio_trabajo_secciones_final.md` (80 KB, 2026-06-24)
- Workflows de trabajo: `workflow_2026-06-12_*` … `workflow_2026-06-24_definicion_simultanea_produccion.md`
- 13 `predicciones_<jugador>_*.json` (respaldos de pronósticos por jugador)

---

## 9. Cohesión / dependencias / flujos  ✅ VERIFICADO

> Esta sección la produjo un análisis cruzado de 17 lectores + 1 integrador, y
> **yo verifiqué en disco** las afirmaciones críticas:
>
> - **`npm run build` PASA** → 8 páginas generadas, sin errores (corrido el 2026-06-27).
> - Los 7 archivos "compartidos" señalados como faltantes **efectivamente no existen**
>   (comprobado con `ls` y con `grep` de sus imports).
>
> ⚠️ **Matiz importante que corrige el análisis automático:** las secciones 05/06/09/10
> importan esos archivos faltantes, pero **NO rompen el build** porque esas secciones
> **no tienen ruta** (no existe `tabla.astro`, `proximo-partido.astro`, `estadisticas.astro`
> ni `admin.astro`), así que Astro nunca las compila. El build es válido. Lo correcto es:
> **esas 4 secciones están huérfanas y no son funcionales; y si les agregas una ruta, el
> build se romperá** hasta restituir los 7 archivos.

### 9.1 Grafo de dependencias (sección → lib → datos)

| Sección (ruta) | lib que consume | datos JSON | Estado |
|---|---|---|---|
| 01_inicio (`/`) | — (`ui-assets`, `TeamFlag`) | `teams.json` | ✅ OK |
| 02_reglas (`/reglas`) | `ui-assets` | — (hardcoded) | ✅ OK |
| 03_jugador (`/jugador`) | `playerIdentity`, `storage/resetPollaState`, `predictions/predictionEditAccess` | `players.json`, `predictions.json` | ✅ OK |
| 04_predicciones (`/predicciones`) | `knockout/{validation,canPredict,model}` + reusa `07/BracketColumn` | `knockout-matches.json`, `teams.json` | ✅ OK |
| 05_tabla | `liveMatch/*`, `scoring/buildPointLedger`, `tabla/*`, `fixture/matchSequence`, **`fixture/groupState`** ❌, `statistics` | players/fixture/results/scoring-rules/predictions, **`groups.json`** ❌ | ⛔ sin ruta + imports faltantes |
| 06_proximo_partido | `liveMatch/*`, `scoring/buildPointLedger`, `statistics/buildChangeEvents`, `tabla/resolveDisplayWindow`, **`fixture/groupState`** ❌ | fixture/teams/h2h/predictions, **`groups.json`** ❌, **`GroupDefinitionCenter.astro`** ❌ | ⛔ sin ruta + imports faltantes |
| 07_fixture (`/fixture`, "Llave") | `knockout/{model,canPredict}` | `knockout-matches.json`, `teams.json` | ✅ OK (usa `fixture.bracket.client.js`) |
| 08_equipos (`/equipos`) | `equipos.logic`, `ui-assets` | `teams.json`, `equipos-info.json` | ✅ OK |
| 09_estadisticas | `statistics/*`, `liveMatch/*`, **`scoring/groupBonuses`** ❌, **`fixture/groupState`** ❌ | predictions/fixture/teams/players, **`groups.json`** ❌, `stat-cards/*` | ⛔ sin ruta + imports faltantes |
| 10_admin | `liveMatch/*`, `predictionEditAccess`, **`admin/groupClosePreview`** ❌, **`fixture/groupState`** ❌, **`GroupClosePanel.astro`** ❌ | players/fixture/admin-dashboard, **`groups.json`** ❌ | ⛔ sin ruta + imports faltantes |
| 11_podio (`/podio`) | `knockout/{podium,canPredict}` | `knockout-teams.json`, `teams.json` | ✅ OK |

**Cadenas internas de `lib`:** `tabla/*` y `scoring/buildPointLedger` → `liveMatch/{liveScoring,liveMatchPhase,activeWindow}`; `activeWindow` y `statistics/buildScoreRaceTimeline` → `fixture/matchSequence`; `liveMultiControl` reusa `activeWindow`.

### 9.2 Los 7 archivos faltantes (verificados ausentes en disco)

| Archivo faltante | Lo importan |
|---|---|
| `src/data/groups.json` | 05, 06, 07(client huérfano), 09, 10 |
| `src/lib/fixture/groupState.js` | 05, 06, 09, 10 |
| `src/lib/scoring/groupBonuses.js` | 09 |
| `src/lib/admin/groupClosePreview.js` | 10 (carpeta `lib/admin/` existe pero vacía) |
| `src/sections/10_admin/GroupClosePanel.astro` | 10 (`AdminSection.astro`) |
| `src/sections/06_proximo_partido/GroupDefinitionCenter.astro` | 06 (`ProximoPartidoSection.astro`) |
| `src/sections/06_proximo_partido/LiveGroupStandings.astro` | 06 |

> Causa probable: residuos de la migración **fase-de-grupos → eliminatorias** que no se
> copiaron al aislar este snapshot (`LOCAL_AISLADA`).

### 9.3 Claves de `localStorage` / `sessionStorage`

Versión de esquema (en `lib/storage/resetPollaState.js`): `POLLA_STORAGE_VERSION = 'production-reset-2026-06-27-knockout-v2'`.

| Clave | Escribe | Lee | Notas |
|---|---|---|---|
| `polla:selectedPlayerId` | 03, `playerIdentity` | 03,04,05,06,07,09,11 | Identidad central. Default `'luis'` hardcodeado. |
| `polla:playerConfirmed` | 03 | 03 | + espejo en sessionStorage. |
| `polla:selectedPlayerSnapshot` | 03 | 03,04,11 | ⚠️ Riesgo de desincronía id vs name en 04. |
| `polla:knockoutPredictions` | 04 (RW) | 04, 07 (solo lee) | Núcleo de pronósticos R32. |
| `polla:podiumPredictions` | 11 (RW) | 04 (completitud final) | Acopla 11→04. |
| `polla:favoriteTeams` | 08 | 08 | Aislada. |
| `polla:finalDownloaded*` / `polla:finalSubmissionPayload` | 04 | 04 | Bloqueo irreversible desde la UI. |
| `polla:predictions` / `polla:qualifiedPredictions` (legacy grupos) | — (purgadas) | 09, 05 | **Vestigiales** (la UI ya no las escribe). |
| `polla:liveMatchState` / `liveMatches` / `officialResults` / `groupClosures` | 10 (`liveMatch`) | 05,06,09,10 | Canal vivo. `groupClosures` **sin escritor** (closeGroup lanza Error). |
| `polla:adminSessionToken` (session) | `liveMatch` | 10 gate | `loginAdmin` lanza → token nunca se obtiene. |
| `polla:predictionEditSession` (session) | `predictionEditAccess` | `predictionAccess` | ⚠️ `validatePredictionEditSession` **siempre borra y devuelve false**. |

**Conflictos reales:** (1) doble escritura de identidad en 03 (`setStoredSelection` inline + `publishConfirmedPlayer`); (2) `fallbackHardReset` de 03 **no purga** `knockoutPredictions` ni `podiumPredictions`; (3) snapshot vs id divergentes en 04.

### 9.4 Eventos / CustomEvent

| Evento | Emite | Escucha |
|---|---|---|
| `polla:player-identity-confirmed` | `playerIdentity` (03) | (sin consumidor explícito) |
| `polla:live-score-updated` | `liveMatch` (10) | `subscribeLiveData` → 05,06,09,10 |
| `polla:official-results-updated` | `liveMatch` (10) | 05,06,09,10 |
| `polla:group-closures-updated` | (declarado) | (declarado) — **nunca disparado** (muerto) |
| `polla:prediction-edit-session-updated` | `predictionEditAccess` | `subscribePredictionEditSession` |
| `window 'storage'` | navegador | `liveMatch` (sync entre pestañas, 4 claves) |

### 9.5 Datos mock vs reales

- **Reales/productivos:** `teams.json` (48), `fixture.json` (72), `players.json` (13), `predictions.json` (schema 2.0: 13 envíos, 936 predicciones), `results.json`, `official-results.json` (4 finished), `scoring-rules.json` (3/1/5), `knockout-matches.json` (P73–P104), `knockout-teams.json` (32), `equipos-info.json`, manifests, `stat-cards/*`, `public/data/community-predictions.json` (193 KB, fetch en runtime).
- **Mocks presentes pero NO productivos:** `predictions.mock`, `results.mock`, `match-info.mock`, `match-preview.mock` (ya no se importa), `admin-dashboard.mock`, `table-predictions.mock`.
- **Doble fuente de verdad de resultados:** `results.json` (vacío) vs `official-results.json` (4 finished, `source:'Supabase'` — snapshot estático, no hay conexión real).

### 9.6 Código muerto / inconsistencias destacadas

- **04_predicciones:** ~12 de 18 archivos huérfanos (legacy grupos); solo `ScoreInput.astro` sigue vivo en el flujo actual.
- **07_fixture:** ~14 archivos huérfanos (`fixture.client.js`, `fixture.logic.ts` y componentes lista/grupos/agenda). La ruta viva solo usa el bracket.
- **05_tabla:** `AccuracyLegend`, `UpdateNote`, `LastUpdateCard`, `JornadaCard` sin uso.
- **08_equipos:** `TeamsSummaryStrip.astro` huérfano (crashearía si se montara: espera `Props.stats`).
- **03_jugador:** `IdentityMessageCard.astro` muerto.
- **components/ui:** design-system completo (`ArcadeButton`, `ArcadeCard`, `StatusPill`, `LockedPanel`, `EmptyState`, `SectionTitle`) **sin uso**.
- **Inconsistencias lógicas reales:** `validatePredictionEditSession` autodestructiva; `MULTI_LIVE_WRITE_ENABLED = true` en código pero docs dicen `false`; modal oficial en 03 inevitable (los 13 jugadores son "oficiales"); feedback de reset en 10 cita versión vieja (`2026-05-31`).
- **Conteo "15 jugadores"** repetido en docs/comentarios, pero la realidad es **13**.
- **Los `.map.md` por sección están desincronizados** (describen el sistema viejo: fase de grupos + Supabase; el real es eliminatorias + 100% local).

### 9.7 Flujos de extremo a extremo

| # | Flujo | Estado |
|---|---|---|
| A | Onboarding → identidad (`/` → `/reglas` → `/jugador`, escribe identidad, emite evento, inyecta `?player=` en enlaces) | ✅ Funciona |
| B | Captura de pronóstico R32 (`/predicciones`, bracket editable, persiste `knockoutPredictions`) | ✅ Funciona |
| C | Captura de podio (`/podio`, 4 selects sin repetidos, persiste `podiumPredictions`) | ✅ Funciona |
| D | Descarga oficial + bloqueo irreversible (`/predicciones`, payload `2.0-knockout`, `lockAll()`) | ✅ Funciona |
| E | Consulta de la llave (`/fixture`, **árbol espejo** R32→Final con conectores+trofeo; colapsa a columnas en móvil; solo lectura desde `knockoutPredictions`) | ✅ Funciona (rediseñado 2026-06-27, ver banner arriba) |
| F | Álbum de equipos + favoritos (`/equipos`, modal, `favoriteTeams`) | ✅ Funciona |
| G | Ranking vivo competitivo (Admin → `liveMatch` → eventos → tabla/estadísticas) | ⛔ Inoperable (sin ruta + 7 archivos faltantes + login/closeGroup stubbeados) |
| H | Definición simultánea / "Qué cambió" (modo dual, `resolveDisplayWindow`, `buildChangeEvents`, impacto personal) | ⛔ Inoperable (depende de G; la lógica pura está completa, cae la UI) |

### 9.8 Síntesis ejecutiva

- **Mitad enrutada y sólida** (flujos A–F): identidad, R32, podio, descarga/bloqueo, llave, álbum. Cohesión limpia vía `lib/knockout/*` + claves `polla:knockout*`/`podium*`.
- **Mitad viva inoperable** (flujos G–H): 05/06/09/10 dependen de **7 artefactos ausentes** y **carecen de ruta**. La lógica pura subyacente (`liveMatch/*`, `scoring`, `statistics/*`, `tabla/*`) **está completa y bien factorizada**; el problema es **integración rota por archivos faltantes**, no diseño.
- **Build actual:** ✅ válido (8 páginas), porque las secciones rotas no están enrutadas.

**Prioridad para restaurar cohesión completa:**
1. Restituir los **7 archivos faltantes** (§9.2).
2. Crear las **4 rutas** faltantes (`/tabla`, `/proximo-partido`, `/estadisticas`, `/admin`).
3. Corregir `fallbackHardReset` (incluir claves knockout) y `validatePredictionEditSession`.
4. Limpiar legacy de 04/07 y sincronizar los `.map.md`.

