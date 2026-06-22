# Comandas a ejecutar - DEFINICION SIMULTANEA (2026-06-23)

Runbook concreto. Cada COMANDA es una unidad: PRECONDICION -> PASOS -> VERIFICACION ->
DONE. Ejecutar en orden. El "por que / como" detallado esta en
`workflow_2026-06-23_definicion_simultanea_continuacion.md`. NO re-derivar la fundacion
F0-F5 (ya existe y esta testeada). Comandos en PowerShell desde `site/`. Push SOLO cuando
el usuario lo pida; commits ASCII-safe (en PS 5.1 usar `git commit -F` con archivo).

---

## COMANDA 00 - Bootstrap de la sesion

PRECONDICION: sesion fresca.
PASOS:
1. Cargar skill `polla-mundialera`; leer `SKILL.md` + `references/gotchas.md`, `gotchas.md`,
   el workflow de continuacion, este runbook y `comanda_definicion_simultanea.md` (sec. 7 UI).
2. Confirmar estado base (no debe haber cambios sorpresa):
   ```powershell
   Set-Location site
   npm run predictions:build   # esperar: 13/13 cartones, 936 marcadores, 312 posiciones
   npm test                    # esperar: 77/77 verdes
   npm run build               # esperar: 11 paginas, limpio
   ```
VERIFICACION: 77/77 + build limpio.
DONE: base confirmada; continuar.

---

## COMANDA 01 - Aplicar SQL en remoto (MANUAL, ventana SIN partido vivo)

PRECONDICION: no hay partido en vivo en curso (las migraciones tocan la tabla viva).
PASOS:
1. Abrir https://supabase.com/dashboard -> proyecto vsyamgdslgeinbxwofnu -> SQL Editor.
2. (Ensayo recomendado) Pegar el contenido de
   `site/supabase/remote/apply_polla_live_match_multi.sql` precedido de `begin;` y seguido
   de `rollback;`. Correr. Debe terminar sin error (si aborta por "fila sin matchId",
   limpiar esa fila manualmente; NO borrar a ciegas).
3. Ejecutar de verdad (sin rollback): pegar y RUN
   `site/supabase/remote/apply_polla_live_match_multi.sql`.
4. Ejecutar `site/supabase/remote/apply_group_closure.sql`.
VERIFICACION (REST con la anon key de `site/.env.local`; reemplazar <KEY>):
   ```powershell
   $K = "<PUBLIC_SUPABASE_ANON_KEY de site/.env.local>"
   # debe responder P0001 (sesion invalida), NO PGRST202 (schema):
   curl -s -X POST "https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/rpc/polla_set_live_score" -H "apikey: $K" -H "Content-Type: application/json" -d '{"p_token":"00000000-0000-0000-0000-000000000000","p_payload":{"matchId":"x","homeTeamScore":"0","awayTeamScore":"0"}}'
   curl -s -X POST "https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/rpc/polla_close_group" -H "apikey: $K" -H "Content-Type: application/json" -d '{"p_token":"00000000-0000-0000-0000-000000000000","p_group_id":"A","p_first":"x","p_second":"y","p_standings":[]}'
   # debe responder un array (lectura publica):
   curl -s "https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/polla_group_closure?select=*" -H "apikey: $K"
   ```
5. Actualizar la memoria de estado remoto: marcar ambas migraciones como APLICADAS.
DONE: las dos RPC dan P0001, `polla_group_closure` responde, `polla_live_match` quedo
multi-fila (con tabla backup `polla_live_match_backup_20260622`).
NOTA: si NO hay ventana sin partido vivo hoy, SALTAR a COMANDA 02 (Stage 1 lectura no
necesita el SQL); volver a COMANDA 01 cuando haya ventana, antes de COMANDA 03.

---

## COMANDA 02 - Stage 1: migrar consumidores a liveMatches[] (lectura)

PRECONDICION: COMANDA 00 hecha. (No requiere COMANDA 01.)
OBJETIVO: que tabla/estadisticas/grafico/admin lean TODOS los vivos. Backward-compatible:
con N=1, comportamiento identico. NO habilitar multi-write todavia.
PASOS (por archivo; LEER el archivo antes de tocar y aplicar el patron):
1. `src/sections/05_tabla/tabla.client.js`: reemplazar el uso de `liveMatch` unico
   (`liveToResult`) por los resultados efectivos de TODOS los vivos. Preferido: construir
   `window = resolveActiveWindow({fixture, official: officialResults, live: liveMatches, now})`
   y puntuar con `buildPointLedger` (oficial = solo `final`; provisional rotulado =
   `final+provisional`). Minimo viable: iterar `liveMatches` y sumar cada uno gateado por
   `resolveLiveMatchPhase`.
2. `src/sections/09_estadisticas/estadisticas.client.js`: usar `liveMatches[]` y
   `groupClosures` del snapshot; alimentar a las piezas con la ventana resuelta.
3. `src/sections/09_estadisticas/score-race.client.js`: `resolveLive` debe devolver N
   puntos live (uno por partido vivo), no uno.
4. `src/sections/10_admin/match-progress.client.js`: `liveFor(match)` busca en
   `liveMatches[]` por `matchId`.
5. `src/sections/10_admin/admin.client.js`: revisar que el KPI no asuma un solo live.
6. `src/sections/06_proximo_partido/proximo-partido.client.js`: NO tocar el live (solo lee
   officialResults).
VERIFICACION:
   ```powershell
   npm test
   npm run build
   ```
   Simulacion 2-vivos en local (sin remoto): en la consola del navegador (npm run preview),
   inyectar dos marcadores y disparar el evento:
   ```js
   localStorage.setItem('polla:liveMatches', JSON.stringify([
     {matchId:'<idA>',homeTeamScore:1,awayTeamScore:0,updatedAt:new Date().toISOString()},
     {matchId:'<idB>',homeTeamScore:0,awayTeamScore:2,updatedAt:new Date().toISOString()}
   ]));
   window.dispatchEvent(new CustomEvent('polla:live-score-updated'));
   ```
   (usar dos matchId reales del mismo grupo, ya pasada su hora). Confirmar que `/tabla` y
   `/estadisticas` cuentan AMBOS; quitar la key y confirmar que con N=1 nada cambio.
DONE: con 2 vivos se cuentan los dos; con N=1 identico; cifra viva rotulada; oficial quieto.
COMMIT sugerido: `feat(live): consumidores leen liveMatches[] (stage 1, sin multi-write)`.

---

## COMANDA 03 - Stage 2: habilitar multi-write + control admin multi-marcador

PRECONDICION: COMANDA 01 (SQL aplicado) y COMANDA 02 (Stage 1) verdes.
PASOS:
1. En `src/lib/liveMatch/liveMatchState.js` poner `MULTI_LIVE_WRITE_ENABLED = true`.
2. Admin: extender el control de marcador para N partidos (reusar patron
   `MiniLiveScoreControl`/`match-progress.client.js`); escribir con `setLiveScore({matchId,...})`,
   limpiar con `clearLiveScore(matchId)`. En jornada final: 2 controles lado a lado.
3. Confirmaciones criticas inline de doble paso (nunca alert/confirm/prompt).
VERIFICACION: `npm test`; `npm run build`. Probar en preview con sesion admin: poner 2
marcadores vivos a la vez; cada uno puntua; finalizar uno NO borra el otro (RPC limpia solo
el finalizado).
DONE: 2 marcadores vivos simultaneos funcionando punta a punta.
COMMIT sugerido: `feat(admin): multi-marcador vivo + habilitar multi-write (stage 2)`.

---

## COMANDA 04 - F6: Centro de definicion de grupo (/proximo-partido)

ARCHIVOS: `06_proximo_partido/` (+ piezas `GroupDefinitionCenter`, `LiveMatchMini`,
`LiveGroupStandings`, `YourImpactCard`). REUSO: `resolveActiveWindow.byGroup`,
`computeGroupSituation`, `buildPointLedger.byPlayer`, `polla:selectedPlayerId`.
CRITERIO: comanda 7.1 (2 marcadores compactos + tabla viva rotulada "con marcadores
actuales" + "Tu impacto"; desktop 2 cols, mobile vertical; CSS runtime via `<style is:global>`).
VERIFICACION: `npm test`; `npm run build`; revisar en preview. DONE: vista 7.1 OK.
COMMIT: `feat(ui): centro de definicion de grupo en /proximo-partido (F6)`.

## COMANDA 05 - F7: Ranking vivo explicable (/tabla)

ARCHIVOS: `05_tabla/` (fila expandible + formula). REUSO: `buildPointLedger.byPlayer[id].lines`.
CRITERIO: comanda 7.2 (delta neto rotulado; un toque abre la formula oficial+partidos+1o+2o+neto;
total proyectado protagonista con subtitulo; frase ante contradiccion; 3 niveles).
VERIFICACION: test+build+preview. COMMIT: `feat(ui): ranking vivo explicable con formula por jugador (F7)`.

## COMANDA 06 - F8: "Que cambio" (cronologia)

ARCHIVOS: `06_proximo_partido/` o `05_tabla/` (`WhatChangedFeed`+`EventQueue`). Opcional:
tabla append-only `polla_match_event` (empezar como diffing en cliente). CRITERIO: comanda 7.3
(narracion por gol; filtros Todos/Mi jugador; cola "N cambios nuevos"; explica el 0;
animacion legible respetando reduced-motion). VERIFICACION: test+build+preview.
COMMIT: `feat(ui): cronologia "Que cambio" + cola de eventos (F8)`.

## COMANDA 07 - F9: Clasificacion de grupos (/estadisticas)

ARCHIVOS: `09_estadisticas/` (`GroupQualificationTab`/`GroupQualificationCard`). REUSO:
`buildGroupBonuses.byGroup` (final/proyectado, `groupState`). CRITERIO: comanda 7.4 (por
jugador, 12 grupos, prediccion vs oficial/proyeccion, +1/+3/0, total por grupo; DEFINITIVO/
EN DEFINICION rotulados). Confirmar orden de tabs con el usuario. VERIFICACION: test+build.
COMMIT: `feat(stats): seccion Clasificacion de grupos (F9)`.

## COMANDA 08 - F10: Tarjeta personal fija mobile

ARCHIVOS: `06_proximo_partido/` y/o layout (`LivePersonalCard`). REUSO:
`buildPointLedger.byPlayer[selected]`. CRITERIO: comanda 7.5. VERIFICACION: build+preview mobile.
COMMIT: `feat(ui): tarjeta personal fija mobile en vivo (F10)`.

## COMANDA 09 - F11: Admin cierre + reversion (consume closureStale)

ARCHIVOS: `10_admin/` (`GroupClosePanel`). REUSO: `closeGroup`/`reopenGroup` (seam),
`computeGroupSituation` (standings + `closureStale`), `buildGroupBonuses` (preview de bonos).
CRITERIO: comanda 7.6 ("LISTO PARA CERRAR" con standings + bonos a generar + "VALIDAR Y
CERRAR"; confirmacion inline doble paso; idempotente; reabrir/corregir recalcula sin
duplicar; si `closureStale` es true, forzar reapertura). PRECONDICION: COMANDA 01 aplicada.
VERIFICACION: test+build; probar cierre/reapertura en preview con admin; re-cierre no duplica.
COMMIT: `feat(admin): panel de cierre de grupo + reversion (F11)`.

## COMANDA 10 - F12: Grafico carrera determinista

ARCHIVOS: `lib/statistics/buildScoreRaceTimeline.js` (+ tests). CRITERIO: historico cerrado
estable por numero oficial de partido, NO por el segundo de finalizacion; vivo en orden de
evento. VERIFICACION: `npm test` (caso de finalizaciones simultaneas). COMMIT:
`fix(graph): orden determinista del historico (F12)`.

## COMANDA 11 - F13: Simulacion + cierre integral

ARCHIVOS: `scripts/simulate-group-definition.mjs` + tests de integracion. CRITERIO: comanda
seccion 9 (grupo ficticio completo; goles uno a uno; standings/desempate; 1o/2o provisional;
libro por jugador partido+clasificacion; caso contradictorio; pending_close con uno
finalizado; cierre admin provisionales->oficiales sin duplicar; re-cierre idempotente;
reapertura/correccion; historico estable bajo distinto orden; bordes: 2 goles casi
simultaneos, 0 neto por compensacion, Lone Wolf que aparece/desaparece, 2 grupos solapados).
CIERRE DE DOCS (mismo commit): actualizar `mapa_sitio_trabajo_secciones_final.md` +
`*.map.md` (05,06,07,09,10) + cerrar el workflow del dia; agregar gotchas durables nuevos a
la skill. VERIFICACION: `npm test`; `npm run build`; greps de cierre (ver workflow Parte D).
COMMIT: `chore(sim): simulacion completa de jornada + cierre de docs (F13)`.

---

## Reglas transversales (toda comanda)
- No avanzar con tests rojos o build sucio.
- Un solo dueno del dataset/subscripcion por pagina (no abrir un 2o `subscribeLiveData`).
- Cifra viva SIEMPRE rotulada; oficial nunca se mueve sin cierre validado.
- Fuente unica de puntaje `liveScoring.js`; mapeo `*TeamScore->*Score` solo en F1.
- CSS de nodos runtime via `<style is:global>` anclado a data-attribute; limpiar intervals.
- Push SOLO cuando el usuario lo pida.
