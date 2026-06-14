# Workflow 2026-06-13 — GRAFICO "Carrera de Puntaje" + orden de fixture en PARTIDOS + limpieza del concepto coral

Registro de la jornada que sumo la vista GRAFICO a Estadisticas, la pulio a pedido
del usuario, ordeno el listado de PARTIDOS por fixture y elimino el concepto
"resultado/pronostico coral" de toda la app. Guia reutilizable para jornadas
parecidas.

- Commits de la jornada:
  - `58f9313` Tabla: el proximo partido se ordena por hora de inicio, no por matchNumber.
  - `aaf3883` Estadisticas: nueva vista GRAFICO "Carrera de Puntaje" + reorden del dashboard.
  - `2fe5014` Estadisticas: pulido del GRAFICO + orden de fixture en PARTIDOS + eliminar concepto coral.
- Comanda fuente principal: `tabla_grafico.md` (FABLE 5.0) en la raiz del proyecto.
- Mapa vivo actualizado en la misma jornada: `mapa_sitio_trabajo_secciones_final.md`.

---

## 1. Contexto de entrada

- App en modo competencia oficial: 13 cartones, 936 marcadores, puntaje 5/3/1/0,
  resultados oficiales en Supabase (`polla_official_results`), tabla dinamica viva.
- Estado remoto verificado por REST con la anon key (paso de diagnostico del
  proyecto): 4 resultados oficiales cerrados por Admin —
  `match-001 2-0`, `match-002 2-1`, `match-003 1-1`, `match-004 4-1` — y
  `polla_live_match` = `match-008 0-0 pending`. Cartones: 13 distintos, sin duplicados.

## 2. Pedidos de la jornada (en orden)

1. Tabla: el "proximo partido" mostraba Haiti-Escocia (matchNumber 5) cuando el
   siguiente por hora era Qatar-Suiza (matchNumber 8). El fixture manda.
2. Estadisticas: reordenar la vista desbloqueada (dashboard arriba, highlights/duelos
   al medio, cartas Data Arena al fondo).
3. GRAFICO (comanda FABLE 5.0): nueva primera pestana "Carrera de Puntaje".
4. El grafico salia vacio ("AUN NO HAY CARRERA"): que represente los datos guardados.
5. Pulir el grafico: ancho completo, POSICION a la izquierda con nombres, fichas
   pintadas por puntaje, numero oculto en mobile.
6. PARTIDOS: ordenar el listado por el fixture, no por grupo.
7. Eliminar el concepto "resultado/pronostico coral" de toda la UI (manteniendo JSON).

## 3. Orden de ejecucion (fases)

| Fase | Que se hizo |
| --- | --- |
| F1 | **Tabla / proximo partido**: `tabla.client.js` ordenaba `updateNextMatchCard`/`firstOpenMatch` por `matchNumber` (etiqueta fija, NO cronologica). Fix: comparador `byKickoff` por `dateUtc`. (`58f9313`) |
| F2 | **Reorden Estadisticas desbloqueada**: `EstadisticasSection.astro` pasa el dashboard ("Explorador detallado") arriba, `arena-universe` (Highlights+Duelos) al medio, cartas Data Arena (`data-data-arena`, unico, para el flip) al fondo. |
| F3 | **GRAFICO (lib pura primero)**: `lib/statistics/buildScoreRaceTimeline.js` (acumulado por jugador + clusters de empate por `matchId+cumulativePoints`, reusa `calculatePointsForPrediction`) y `buildScoreRaceNarrative.js` (relato por plantillas). 9 tests nuevos. |
| F4 | **GRAFICO (UI)**: `StatsGraphTab` + `ScoreRaceGraph/Legend/Narrative/Popup` + `score-race.client.js` (`createScoreRace`). Tabs nuevos GRAFICO/PARTIDOS/COMUNIDAD/MI PERFIL/COMPARAR; CLASIFICADOS se fusiona en COMPARAR (alias `?tab=clasificados`). GSAP lazy. |
| F5 | **Datos del grafico**: `estadisticas.client.js` (dueno unico del dataset + `subscribeLiveData`) alimenta el grafico con `{dataset, liveSnapshot}`. |
| F6 | **Baseline anti-vacio**: `scripts/snapshot-official-results.mjs` + `npm run results:snapshot` generan `src/data/official-results.json` desde Supabase; `mergeOfficials` fusiona baseline + live (vivo gana por matchId). Se ELIMINA el estado "AUN NO HAY CARRERA". |
| F7 | **Layout/geometria**: `geom()` dinamico que mide `el.canvas` y reparte columnas (llena con pocos partidos, comprime, scroll con muchos) + `ResizeObserver`; layout a ancho completo (narrativa/leyenda debajo); POSICION a la izquierda con NOMBRE legible; fichas pintadas por hitType del partido seleccionado; inset del eje Y; mobile oculta el numero de posicion. |
| F8 | **PARTIDOS por fixture**: `renderMatches` ordena `visible` por `dateChile` cronologico (desempate `matchNumber`), no por grupo. |
| F9 | **Eliminar coral**: ver seccion 5. |
| F10 | Cierre: `npm test` (42/42), `npm run build`, greps, mapas, commits + push. |

## 4. Decisiones tomadas (con el usuario)

- **El fixture manda = cronologico** (`dateUtc`/`dateChile`), no `matchNumber`
  (que no es secuencial en el tiempo: el 08 juega antes que el 05). Se uso para el
  "proximo partido" de la tabla y para el orden del listado de PARTIDOS.
- **Baseline commiteado + overlay en vivo**: el grafico nunca queda vacio. El
  baseline (`official-results.json`) se genera DESDE la base de datos (`results:snapshot`);
  el live solo actualiza encima. Asi "usa lo que tienes" sin depender del handshake.
- **El nodo agrupa por puntaje ACUMULADO** (no por lo que se sumo en ese partido):
  un jugador que saco 0 en el partido puede estar en el nodo si su total coincide.
  Se confirmo con datos reales que no habia bug (cartones distintos, empate legitimo).
- **Coral fuera, dato adentro**: se quita la UI del "resultado/pronostico coral" en
  todas las secciones pero se conserva `favoriteScore`/`favoriteScores` en
  `communityStatistics.js` (sin mostrarse) y el CONSENSO (Unanime/Dividido + barras).
  Asi no se rompen tests ni el modelo de datos. Los JSON no se tocan.

## 5. Eliminacion del concepto coral (multi-seccion)

El "marcador/pronostico coral" (marcador favorito de la oficina como pronostico)
vivia en 5 superficies, todas alimentadas por `communityStatistics.js`:

| Lugar | Que se quito |
| --- | --- |
| `09_estadisticas` detalle PARTIDOS | linea "Marcador coral: X-Y · promedio" |
| `09_estadisticas` listado PARTIDOS | `favoriteScore` de la meta -> solo consenso |
| `09_estadisticas` COMUNIDAD | bloque "El marcador de la oficina" |
| `07_fixture` + `06_proximo_partido` | card `CommunityMatchPulse` ("Pronostico coral") COMPLETA |
| `08_equipos` modal | bloque "Pronostico coral" (`data-modal-prediction-pulse`) |

Cierre limpio: se borro `components/statistics/CommunityMatchPulse.astro`, las
hidrataciones (`renderCommunityPulse` en fixture/proximo, bloque del modal en
`equipos.client.js`), los payloads SSR muertos (`communityPulses`, `teamSupport`)
y el CSS muerto (`.prediction-pulse`, `[data-community-pulse]`). Se MANTUVO el
consenso de la lista de fixture (`communityPulseByMatch`/`consensusLabel` se siguen
usando para el label de fila). `favoriteScore` queda en la lib sin mostrarse.

## 6. Gotchas que se repetiran

1. **`matchNumber` NO es cronologico**: para "proximo" / "orden del fixture" usar
   siempre `dateUtc`/`dateChile`. Mismo criterio que `/fixture` y `06_proximo_partido`.
2. **Depender solo del live deja la UI vacia**: el grafico se siembra de un baseline
   commiteado (`official-results.json`) y el live solo overlaya. Refrescar el baseline
   con `npm run results:snapshot` cuando el Admin cierre mas partidos.
3. **Nodos/SVG pintados en runtime** no reciben el scope de Astro: el estilo del
   grafico vive en `<style is:global>` anclado a `[data-score-race]` (mismo patron
   que `[data-rank-streak]`/`[data-group-standings-panel]`).
4. **El grafico no se suscribe solo**: `estadisticas.client.js` es el dueno unico del
   dataset + `subscribeLiveData`; `createScoreRace` solo recibe `{dataset, liveSnapshot}`
   (sin doble fetch ni doble canal).
5. **Mapear `homeTeamScore/awayTeamScore` -> `homeScore/awayScore`** en el seam antes
   del builder (el payload oficial usa la forma `*TeamScore`).
6. **GSAP lazy**: `import("gsap")` dinamico dentro de la vista, omitido con
   `prefers-reduced-motion`; queda en su propio chunk (no global).
7. **Geometria que llena**: medir `el.canvas.clientWidth` (riel de ancho fijo en CSS
   para que el calculo sea exacto) + `ResizeObserver` para re-llenar al redimensionar.
8. **Borrar una card compartida** (`CommunityMatchPulse`) implica limpiar mounts +
   hidrataciones + payloads SSR + CSS muertos en TODAS las secciones que la usaban.
9. **Quitar UI sin tocar datos**: dejar el computo (`favoriteScore`) en la lib evita
   romper tests; solo se deja de mostrar.

## 7. Verificacion ejecutada

```powershell
npm run results:snapshot   # 4 resultados desde Supabase -> src/data/official-results.json
npm test                   # 42/42 (9 nuevos en tests/score-race-timeline.test.mjs)
npm run build              # 11 paginas, limpio; gsap en chunk lazy aparte
```

Mas: node checks de geometria (llena con n=4, comprime/scroll con n=24, inset del eje),
validacion del builder contra el dataset real (Jaime 6 / Carlos 3 / Felipe 3, acumulado
monotono, clusters de empate), y greps de cierre (cero "Marcador/Pronostico coral" en UI;
solo quedan tokens de color CSS `--pm-*-coral` y el badge de persona "Estratega Coral").

## 8. Estado final

```text
Estadisticas: GRAFICO ("Carrera de Puntaje") como primera vista por defecto.
Tabs: GRAFICO · PARTIDOS · COMUNIDAD · MI PERFIL · COMPARAR.
Grafico a ancho completo, POSICION a la izquierda con nombres, fichas por puntaje,
mobile sin numero de posicion. Sembrado de official-results.json + overlay live.
PARTIDOS ordenado por fixture (cronologico).
Concepto coral eliminado de toda la UI; favoriteScore y consenso conservados; JSON intactos.
```

## 9. Playbook para una proxima jornada

1. Leer el mapa vivo + la(s) comanda(s) antes de tocar nada.
2. Verificar el estado remoto real (Supabase REST con anon key) y el dataset
   (`predictions:build` / `results:snapshot` en seco) antes de planear.
3. Logica pura primero (builders + tests), shells SSR despues, cliente al final,
   navegacion/wiring de ultimo.
4. Si un dato (favorito, consenso) se quiere ocultar, quitar SOLO la UI y dejar el
   computo en la lib: no romper tests ni el modelo.
5. Si una card es compartida, rastrear TODOS sus consumidores (mounts, hidrataciones,
   payloads, CSS) antes de borrarla.
6. Cerrar con: tests + build + greps + node checks + mapas (principal y `*.map.md`)
   en el mismo commit; push solo cuando el usuario lo pide.
