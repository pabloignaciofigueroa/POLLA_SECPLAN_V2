# Workflow 2026-06-23 - DEFINICION SIMULTANEA (continuacion: seam consumidores + UI)

Codename: DEFINICION SIMULTANEA (FABLE 6.0) - continuacion.
Proyecto: Polla Mundialera SECPLAN 2026 (Astro estatico + CSS Modules + JS por seccion
+ JSON versionado + Supabase Realtime).

> Este archivo es el PLAN MAESTRO de lo que falta. El runbook concreto (que comando
> correr, en que orden) esta en `comandas_2026-06-23_definicion_simultanea.md`.
> Documento hermano ya cerrado: `workflow_2026-06-22_definicion_simultanea.md` (fundacion
> F0-F5). Capa durable: skill `polla-mundialera` (`SKILL.md` + `references/gotchas.md`).
> Mapa vivo: `mapa_sitio_trabajo_secciones_final.md`. Comanda original:
> `comanda_definicion_simultanea.md` (secciones 7 = specs de UI, 9 = simulacion).

## 0. Como usar este archivo (sesion fresca)

1. Cargar la skill `polla-mundialera`. Leer su `SKILL.md` + `references/gotchas.md`,
   luego `gotchas.md`, este workflow, las comandas y la comanda original (seccion 7 UI).
2. NO re-derivar la fundacion: F0-F5 YA existe y esta testeada (ver Parte A). Reusar.
3. Ejecutar en el orden de la Parte B. Cada fase deja `npm test` verde + `npm run build`
   limpio antes de pasar a la siguiente. Push solo cuando el usuario lo pida.
4. Regla de oro transversal: nunca sobrescribir solo el total; reconstruirlo desde el
   libro contable. Lo provisional jamas entra al ranking oficial sin cierre validado.

---

# PARTE A - ESTADO ACTUAL (HECHO, 2026-06-22): fundacion F0-F5 + desempate FIFA 2026

Todo esto YA esta en el repo, con tests (82/82) y build limpio. Es la base reusable.
COMMITEADO en `44846b1` (main, SIN push), junto con la correccion del desempate de grupos
al criterio FIFA 2026 (head-to-head PRIMERO; fuente unica `compareRows`/`rankGroupRows` en
`predicciones.standings.js`; el clasificado del carton se DERIVA bajo 2026; Humberto Grupo
D paso de 2o paraguay a usa). Ver `workflow_2026-06-22_desempate_grupos_fifa_2026.md`. Ese
desempate es PREREQUISITO de F6/F7/F9/F11: el 1o/2o (y los bonos +1/+3) ya salen del orden
correcto.

## A.1 Decision de arquitectura ya tomada

`polla_live_match` era SINGLETON (`id text primary key check (id='current')`): no podia
sostener 2 partidos vivos. Se eligio **Opcion A**: generalizar a MULTI-FILA por
`match_id`, backward-compatible (1 vivo = N=1). Descartadas B (tabla paralela = doble
verdad) y C (event-sourced = reescribe el admin antes de jornada real).

## A.2 Libs puras nuevas (todas con tests; NO reimplementar)

- `src/lib/liveMatch/activeWindow.js`
  - `resolveActiveWindow({ fixture, official, live, now }) -> { matches[], byGroup, isSimultaneous }`.
    UNICO lugar que gatea fase (via `resolveLiveMatchPhase`) y mapea `*TeamScore -> *Score`.
  - `resolveEffectiveResults({ official, window }) -> { byMatch: Map<matchId,{homeScore,awayScore,official,ts}> }`.
- `src/lib/fixture/groupTiebreakers.js` (facade) - reexporta `compareRows`/`directStats`
  (ahora exportadas, puras) de `predicciones.standings.js` + `resolveFirstSecond`.
- `src/lib/fixture/groupStandings.js` (+) - `buildMergedGroupStandings({group,matches,official,live})`
  oficial+live (oficial pisa live; NO re-gatea fase). Convive con `buildOfficialGroupStandings`.
- `src/lib/fixture/groupState.js`
  - `GROUP_STATE`, `deriveGroupState(...)` (pending->in_definition->pending_close->final->reopened).
  - `computeGroupSituation(groupId, {group,fixture,official,live,closure}) -> GroupSituation`
    (congela 1o/2o si state==='final'; expone `liveFirst/liveSecond`, `closureStale`).
  - `isClosureStale(groupId, ...)` - true si una closure final ya no coincide con la realidad.
- `src/lib/scoring/buildPointLedger.js`
  - `buildPointLedger({players,predictions,qualifiedPredictions,groups,fixture,official,live,window,closuresByGroup,invalidatedKeys,now})`
    -> `{ lines[], byPlayer:{ [id]:{ official, projected, match:{}, group:{}, lines[] } } }`.
    oficial=Σ`final`, proyectado=Σ(`final`+`provisional`), `anulado`=0. Reusa
    `calculatePointsForPrediction`. Mapea hitType `exact`->`exact_shared`.
- `src/lib/scoring/groupBonuses.js`
  - `GROUP_BONUS={first:1,second:3}`; `buildGroupBonuses(...) -> { lines[], byGroup }`.
    Clave logica `group:G:player:first|second`; lleva `groupState` en cada linea; solo
    grupos empezados/final.
- Tipos: `src/lib/liveMatch/types.ts`, `src/lib/scoring/types.ts`.

## A.3 Seam extendido (ADITIVO; ningun consumidor actual cambio aun)

`src/lib/liveMatch/liveMatchState.js`:
- `subscribeLiveData(cb)` ahora emite `{ liveMatch (legado = el mas nuevo), liveMatches[],
  officialResults, groupClosures }`. Lectura schema-agnostica (sirve pre y post migracion).
- Nuevas: `readLiveMatches()`, `readGroupClosures()`, `setLiveScore(payload,{allowMultiWrite})`,
  `clearLiveScore(matchId,{allowMultiWrite})`, `closeGroup(groupId,first,second,standings)`,
  `reopenGroup(groupId,reason)`.
- Helpers puros exportados: `pickNewestLiveMatch`, `dedupeClosuresByVersion`, `mapClosureRow`.
- **GUARDRAIL** `MULTI_LIVE_WRITE_ENABLED=false`: `setLiveScore`/`clearLiveScore` lanzan
  salvo override explicito. El admin sigue escribiendo UN vivo via `saveLiveMatchState`.
- `subscribeLiveData` agrega canal Realtime para `polla_group_closure`.
- `supabaseClient.js`: `import.meta.env` envuelto en try/catch (node-safe; sin romper el
  reemplazo estatico de Vite).

## A.4 SQL nuevo (escrito; PENDIENTE de aplicar en remoto - ver Parte B paso 0)

- `supabase/migrations/20260622120000_polla_live_match_multi.sql` (+ `remote/apply_polla_live_match_multi.sql`).
- `supabase/migrations/20260622120100_group_closure.sql` (+ `remote/apply_group_closure.sql`).

## A.5 Tests nuevos (35; suite total 77)

`tests/{group-tiebreakers,group-merged-standings,group-state,active-window,group-bonuses,point-ledger,seam-snapshot-shape}.test.mjs`.

## A.6 Invariantes ya respetados (no romper)

Fuente unica de puntaje `liveScoring.js`; mapeo `*TeamScore->*Score` solo en F1; dos
planos oficial/provisional; idempotencia de cierre/bonos; `fixture.json` intacto;
`matchNumber` no cronologico (usar `dateUtc`).

---

# PARTE B - ESTADO (orden de ejecucion)

> ESTADO 2026-06-23 (cierre F13): la Fase 3 esta IMPLEMENTADA EN CODIGO y commiteada en `main`
> (SIN push). Stage 1 (lectura multi) + F6 (centro de definicion) + F7 (ranking vivo) + F8
> (cronologia "Que cambio") + F9 (clasificacion por grupo) + F10 (barra personal mobile) + F12
> (grafico determinista) + F11 (admin cierre/reapertura idempotente + `closureStale`) + Stage 2
> (control multi-marcador detras del guardrail) + F13 (simulacion integral + cierre de docs).
> Suite 135 verde, build 11 paginas, sim `npm run sim:group` 117 asserts verdes.
>
> PENDIENTE (NO codigo: PASOS MANUALES REMOTOS del operador, acoplados, en ventana SIN partido
> vivo + backup): (1) PASO 0 - aplicar `supabase/remote/apply_polla_live_match_multi.sql` y
> `apply_group_closure.sql`; (2) recien entonces flipear `MULTI_LIVE_WRITE_ENABLED=true` y
> desplegar (Stage 2 real). Hasta eso, el multi-write sigue bloqueado por el guardrail (`false`)
> y F11 (cierre) responde PGRST202 si la RPC no esta aplicada (no es bug del cliente).

Principio: data/seam -> consumidores -> UI -> navegacion. Cada fase: tests verdes + build
limpio. El detalle copy-paste esta en el runbook de comandas.

## PASO 0 - Aplicar SQL en remoto (MANUAL, ventana SIN partido vivo)

Bloqueante para Stage 2 y para el cierre admin (F11). Stage 1 (lectura) NO lo necesita
porque el seam lee schema-agnostico.

1. (Recomendado) Ensayar `apply_polla_live_match_multi.sql` entre `begin;` y `rollback;`.
2. Ejecutar en SQL Editor `supabase/remote/apply_polla_live_match_multi.sql`.
3. Ejecutar `supabase/remote/apply_group_closure.sql`.
4. Verificar (REST anon key, ver runbook): `polla_set_live_score` y `polla_close_group`
   con token dummy -> `P0001` (no `PGRST202`); `polla_group_closure` responde a `select`.
5. Tras aplicar, actualizar la memoria de estado remoto (la migracion paso de pendiente a
   aplicada).

Criterio: las RPC validan sesion; `polla_live_match` quedo multi-fila con backup creado.

## STAGE 1 - Migrar consumidores a liveMatches[] (lectura; sin habilitar multi-write)

Objetivo: que tabla/estadisticas/grafico/admin lean TODOS los vivos (no solo el legado),
para que con 2 vivos el ranking publico NO subcontia. Backward-compatible: con N=1 el
comportamiento es identico. Aun NO se habilita el multi-write.

Patron general por consumidor: hoy resuelven UN `liveMatch` -> resultado puntuable.
Cambiar a iterar `liveMatches[]`, gateando CADA uno por `resolveLiveMatchPhase` (o, mejor,
consumir `resolveActiveWindow` / `resolveEffectiveResults` de F1, que ya gatea y mapea).

Consumidores (leer cada archivo antes de tocar; aplicar el patron):
- `src/sections/05_tabla/tabla.client.js` - hoy `recompute({liveMatch, officialResults})`
  con `liveToResult` (un solo live). Cambiar a construir los resultados efectivos desde
  `resolveActiveWindow({fixture,official,live:liveMatches,now})` + `resolveEffectiveResults`,
  y puntuar con `buildPointLedger` (o, minimo, sumar los N live al recompute). El ranking
  oficial usa solo lo `final`; el provisional rotulado usa `final+provisional`.
- `src/sections/09_estadisticas/estadisticas.client.js` - hoy guarda
  `state.liveSnapshot.liveMatch`. Pasar a usar `liveMatches[]`/`groupClosures` y alimentar
  a las piezas (score-race) con la ventana resuelta.
- `src/sections/09_estadisticas/score-race.client.js` - hoy `resolveLive(liveMatch,...)`
  -> un punto live. Generalizar a N puntos live (uno por partido vivo).
- `src/sections/10_admin/match-progress.client.js` - hoy `liveFor(match)` compara contra
  el unico `liveMatch`. Cambiar a buscar en `liveMatches[]` por `matchId`.
- `src/sections/10_admin/admin.client.js` (KPI) - ya usa `officialResults`; revisar que
  no asuma un solo live.
- `src/sections/06_proximo_partido/proximo-partido.client.js` - solo lee `officialResults`;
  NO requiere cambio de live (su ventana visual sigue con `getRelevantMatches`).

Tests: agregar/ajustar tests de los recomputes donde haya logica pura extraible; los tests
de seam/ledger ya cubren el motor. Verificar build + que `tabla`/`estadisticas` siguen
pintando con N=1 igual que antes.

Criterio de aceptacion Stage 1: con un payload de 2 vivos del mismo grupo (simulado en
local/cache), `/tabla` y `/estadisticas` cuentan AMBOS; con N=1 nada cambia. Cifra viva
siempre rotulada; oficial nunca se mueve sin cierre.

Gotcha: un solo dueno del dataset por pagina (no abrir un segundo `subscribeLiveData`).
SSR y cliente deben producir el mismo formato (evitar el "salto" del primer recompute).

## STAGE 2 - Habilitar multi-write + control de marcador multi en Admin

Solo DESPUES de Stage 1 verde y SQL aplicado.
1. Flip `MULTI_LIVE_WRITE_ENABLED=true` en `liveMatchState.js`.
2. Admin: extender el control de marcador para N partidos (reusar el patron de
   `MiniLiveScoreControl`/`match-progress.client.js`), escribiendo por `setLiveScore(matchId)`
   y limpiando con `clearLiveScore(matchId)`. En jornada final: 2 controles lado a lado.
3. Confirmaciones criticas: inline de doble paso (nunca `alert/confirm/prompt`).

Criterio: el admin puede poner 2 marcadores vivos a la vez; cada uno puntua independiente;
finalizar uno no borra el otro.

## F6 - Centro de definicion de grupo (en `/proximo-partido`)

Objetivo: "GRUPO X - EN DEFINICION - 71'": 2 marcadores compactos + tabla viva del grupo
("Clasificacion con los marcadores actuales", NO "oficial") + tarjeta "Tu impacto".
Archivos: `06_proximo_partido/` (`ProximoPartidoSection.astro`, `proximo-partido.client.js`,
nuevas piezas `GroupDefinitionCenter`, `LiveMatchMini`, `LiveGroupStandings`, `YourImpactCard`).
Reuso: `resolveActiveWindow` (byGroup), `computeGroupSituation`, `buildPointLedger` (byPlayer),
identidad local `polla:selectedPlayerId`. Desktop 2 cols, mobile vertical. Diseno para N,
optimizado para 2. CSS de nodos runtime via `<style is:global>` anclado a data-attribute.
Criterio: ver comanda 7.1.

## F7 - Ranking vivo explicable (en `/tabla`)

Objetivo: cada fila muestra delta neto rotulado ("+2 EN VIVO"); un toque abre la formula
por jugador (oficial + cada partido + 1o + 2o + neto). 3 niveles de informacion.
Archivos: `05_tabla/` (`tabla.client.js`, nuevas piezas de fila expandible + formula).
Reuso: `buildPointLedger.byPlayer[id].lines` (desglose listo). Cifra protagonista = total
proyectado con subtitulo "oficiales + provisionales". Frase ante contradiccion ("gano
precision en el partido pero perdio su segundo: neto -1"). Criterio: comanda 7.2.

## F8 - "Que cambio" (cronologia)

Objetivo: narracion por gol, filtros Todos/Mi jugador, cola "2 cambios nuevos", historial
desde el inicio de la jornada; el "0" tambien se explica.
Archivos: `06_proximo_partido/` o `05_tabla/` (`WhatChangedFeed` + `EventQueue`).
Aqui entra el OPCIONAL append-only `polla_match_event` (la cronologia confiable para
late-joiners; `ts` del libro es best-effort, NO construir sobre el la cronologia). Puede
empezar como diffing en cliente y promoverse a tabla persistida para el dia real.
Animacion legible (gol -> marcador -> reordenar grupo -> recalcular -> neto -> mover
ranking), respetando `prefers-reduced-motion`. Criterio: comanda 7.3.

## F9 - Seccion "Clasificacion de grupos" (en `/estadisticas`)

Objetivo: nueva pestana; por jugador, 12 grupos, prediccion vs oficial/proyeccion, +1/+3/0,
total por grupo; estados DEFINITIVO/EN DEFINICION rotulados.
Archivos: `09_estadisticas/` (`EstadisticasSection.astro`, `estadisticas.client.js`, piezas
`GroupQualificationTab`/`GroupQualificationCard`). Reuso: `buildGroupBonuses.byGroup`
(modo final/proyectado, `groupState` por linea). Datos via `estadisticas.client.js` (dueno
unico). Orden de tabs a confirmar (sugerido despues de PARTIDOS). Criterio: comanda 7.4.

## F10 - Tarjeta personal fija mobile

Objetivo: tarjeta inferior fija desplegable "TU PUNTAJE EN VIVO / 35 oficiales + 2 en juego
/ Ver por que cambio". Archivos: `06_proximo_partido/` y/o layout (`LivePersonalCard`).
Reuso: `buildPointLedger.byPlayer[selected]`. Criterio: comanda 7.5.

## F11 - Admin: panel de cierre + reversion

Objetivo: "GRUPO X LISTO PARA CERRAR" con standings, bonos a generar y "VALIDAR Y CERRAR";
reabrir/corregir recalcula sin duplicar; **consumir `closureStale`** para forzar reapertura
cuando se corrige un partido de un grupo ya cerrado.
Archivos: `10_admin/` (`AdminSection.astro`, `admin.client.js`, pieza `GroupClosePanel`).
Reuso: `closeGroup`/`reopenGroup` (seam), `computeGroupSituation` (standings + `closureStale`),
`buildGroupBonuses` (preview de bonos). Confirmacion inline de doble paso. Idempotente
(apretar dos veces no duplica; cierre = upsert, version++). Criterio: comanda 7.6.

## F12 - Grafico carrera determinista

Objetivo: el historico cerrado se reconstruye por orden estable de partido (numero oficial),
NO por el segundo en que se apreto finalizar; el vivo puede mostrarse en orden de evento.
Archivos: `lib/statistics/buildScoreRaceTimeline.js` (ya ordena por `dateUtc` via
`buildMatchSequence`; verificar/ajustar el caso de finalizaciones simultaneas). Tests.

## F13 - Cierre integral + simulacion  [HECHO 2026-06-23]

HECHO. `scripts/simulate-group-definition.mjs` (alias `npm run sim:group`): universo sintetico
determinista, mete goles uno por uno y corre la jornada sobre las MISMAS libs que la app (no
reimplementa puntaje/desempate/gating/cierre). 117 asserts (`node:assert/strict`), sale 0 si
verde. Cubre: A bloqueo->definicion (gatillo por final de 3a fecha), B desempate 2026
(head-to-head primero + mini-tabla), C libro (oficial=Sum final / proyectado=Sum
final+provisional), D contradictorio (+1 partido / -3 clasificado = -2), E pending_close (no se
cierra solo), F cierre idempotente (closure simulada con OBJETO, re-cierre sin duplicar), G
reapertura sin doble conteo + `closureStale`, H historico determinista (barajar el orden de
finalizacion -> mismo grafico), y los 4 bordes (goles casi simultaneos, 0 neto por compensacion
+3/-3, lone wolf <-> exacto compartido, 2 grupos solapados / 4 vivos aislados). NO toca Supabase
ni llama RPC (el cierre se modela con un objeto closure en `closuresByGroup`); determinista
(bloquea `Math.random`/`Date.now`). NO es `*.test.mjs` -> `npm test` sigue en 135.

Cierre de docs HECHO en el mismo commit: `mapa_sitio_trabajo_secciones_final.md` (entrada F13 +
estado de commits/remoto) + `*.map.md` (04,05,06,07,09,10) + este workflow + `gotchas.md` (gotcha
durable de la sim, seccion 10).

PENDIENTE conocido (proxima comanda / operador): los DOS pasos manuales remotos del PASO 0
(aplicar `apply_polla_live_match_multi.sql` + `apply_group_closure.sql`) y, recien despues,
flipear `MULTI_LIVE_WRITE_ENABLED=true` (Stage 2 real). La sim modela el efecto; el dia real
necesita la escritura. Push solo cuando el usuario lo pida.

---

# PARTE C - Invariantes, gotchas y riesgos

- Nunca sobrescribir solo el total (reconstruir desde el libro).
- Provisional jamas entra al ranking oficial sin cierre validado; cifra viva rotulada.
- Fuente unica de puntaje `liveScoring.js`; mapeo `*TeamScore->*Score` solo en F1.
- F1 es el unico que gatea fase; F2/F3/F4 consumen su salida, nunca crudo+now.
- Un solo dueno del dataset/subscripcion por pagina.
- CSS de nodos runtime via `<style is:global>` anclado a data-attribute; intervals
  guardados y limpiados en re-render.
- Idempotencia de cierre/bonos (clave `group:G:player:first|second`, version++).
- El grupo no se cierra con un solo partido finalizado; el `final` exige validacion admin.
- Closure congelada que miente -> `closureStale` -> forzar reapertura (F11).
- Riesgo mayor: la migracion multi-fila corre contra tabla viva (ver paso 0, backup +
  abort-not-delete + replica identity full + ensayo). Hasta aplicarla y migrar
  consumidores, NO habilitar el multi-write (guardrail).

# PARTE D - Verificacion global

```
npm run predictions:build   # 13/13, 936, 312
npm run results:snapshot    # refresca official-results.json
npm test                    # suite verde (sumar tests nuevos por fase)
npm run build               # 11 paginas, limpio
npm run preview             # performance real
```
Greps de cierre:
```
rg -n "liveMatches|resolveActiveWindow|buildPointLedger|computeGroupSituation" site/src
rg -n "MULTI_LIVE_WRITE_ENABLED|closeGroup|reopenGroup|closureStale" site/src
rg -n "polla_group_closure|polla_set_live_score" site/src site/supabase
```
Remoto post-aplicacion: RPC nuevas validan sesion (token dummy -> P0001, no PGRST202).
