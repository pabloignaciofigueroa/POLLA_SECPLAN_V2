# Workflow 2026-06-22 - DEFINICION SIMULTANEA (fundacion F0-F5)

Comanda: `comanda_definicion_simultanea.md` (FABLE 6.0). Este workflow cubre SOLO la
fundacion: logica pura + seam + migraciones, con tests verdes y build limpio. SIN UI
(F6-F13 quedan para incrementos siguientes). Skill del proyecto: `polla-mundialera`.

## Contexto y decision de fondo

La jornada final juega DOS partidos del mismo grupo en vivo a la vez. La trampa que la
comanda no marco: `polla_live_match` era SINGLETON (`id text primary key check
(id='current')`), el seam emitia un unico `liveMatch` y `finalize` avanzaba a UN
siguiente. Imposible sostener 2 vivos.

Decision (con el usuario): **Opcion A** - generalizar `polla_live_match` a MULTI-FILA
por `match_id`. Backward-compatible (1 vivo = N=1). Se descarto B (tabla paralela = doble
fuente de verdad) y C (event-sourced = reescribe el admin justo antes de jornada real).
Alcance acordado: **fundacion F0-F5**, sin UI.

## Que se construyo (todo logica pura + seam, con tests)

| Fase | Archivo(s) | Que hace |
| --- | --- | --- |
| F0 | `lib/liveMatch/types.ts`, `lib/scoring/types.ts` | Tipos: ActiveWindow, GroupSituation, PointLedgerLine, GroupClosure, GroupBonusLine, EffectiveResult. |
| F1 | `lib/liveMatch/activeWindow.js` | `resolveActiveWindow({fixture,official,live,now})` 1..N por grupo con estado REAL (gatea fase via `resolveLiveMatchPhase`, mapea *TeamScore->*Score) + `resolveEffectiveResults` (oficial pisa live). UNICA fuente de "que live cuenta". |
| F2b | `lib/fixture/groupTiebreakers.js` | Facade: reexporta `compareRows`/`directStats` de `predicciones.standings.js` (ahora exportadas; confirmadas puras) + `resolveFirstSecond` provisional-aware. |
| F2a | `lib/fixture/groupStandings.js` (+) | `buildMergedGroupStandings` oficial+live (no re-gatea fase). |
| F2c | `lib/fixture/groupState.js` | `deriveGroupState` (pending->in_definition->pending_close->final->reopened), `computeGroupSituation` (congela 1o/2o si final), `isClosureStale`. |
| F3 | `lib/scoring/buildPointLedger.js` | Libro contable: oficial=Σfinal, proyectado=Σ(final+prov), anulado=0. Reusa `calculatePointsForPrediction`. Consume la salida de F1 (no re-filtra crudo). |
| F4 | `lib/scoring/groupBonuses.js` | 1o +1 / 2o +3 / miss 0, idempotente por clave `group:G:player:first|second`, lleva `groupState` en cada linea. Solo grupos empezados/final. |
| F5a | `supabase/migrations/20260622120000_polla_live_match_multi.sql` (+ `remote/apply_*`) | Singleton -> multi-fila por match_id. RPCs `polla_set_live_score`/`polla_clear_live_score`; `polla_save_live_match` wrapper; `polla_finalize_match` limpia el live del finalizado. |
| F5b | `supabase/migrations/20260622120100_group_closure.sql` (+ `remote/apply_*`) | Tabla `polla_group_closure` + RPC `polla_close_group`/`polla_reopen_group` (version++). |
| F5c | `lib/liveMatch/liveMatchState.js` | `subscribeLiveData` emite `{ liveMatch (legado=mas nuevo), liveMatches[], officialResults, groupClosures }`; lectura schema-agnostica; `setLiveScore`/`clearLiveScore` (guardrail) + `closeGroup`/`reopenGroup`. |

Reusados sin reimplementar: `liveScoring.js` (`calculatePointsForPrediction`),
`predicciones.standings.js` (`calculateGroupStandings`, desempate), `matchSequence.js`,
`liveMatchPhase.js`, `buildOfficialGroupStandings`.

## Endurecimientos aplicados (feedback del usuario)

- **A1 migracion segura**: backup `polla_live_match_backup_20260622`; backfill que ABORTA
  (no borra) si quedaria una fila sin `match_id`; swap de PK idempotente en `do` blocks;
  `replica identity full`; instruccion de ensayo `begin; ... rollback;` en el apply file.
- **A2 isClosureStale**: detecta closure final que ya no coincide con la realidad (1o/2o
  congelado != recomputado, o partido desfinalizado) -> el panel admin (F11) forzara
  reapertura. `computeGroupSituation` expone `closureStale` + `liveFirst/liveSecond`.
- **A3 guardrail multi-write**: `MULTI_LIVE_WRITE_ENABLED=false`. `setLiveScore`/
  `clearLiveScore` lanzan si no se habilita; el admin sigue escribiendo UN vivo via
  `saveLiveMatchState`. No exponer multi-write hasta migrar consumidores.
- **A4 contrato del live**: F1 es el unico que gatea fase + mapea *TeamScore->*Score;
  F2/F3/F4 consumen su salida, nunca el payload crudo + now.
- **A5 dos confianzas de provisional**: `groupState` viaja en la linea origen `group`.
- **A6 ts best-effort**: el snapshot oficial no trae timestamp; `ts` queda nullable y F8
  NO se construye sobre el (espera a `polla_match_event`).
- **A7**: `compareRows`/`directStats` exportadas tras confirmar que son puras.
- Extra: `supabaseClient.js` node-safe (try/catch sobre `import.meta.env`, sin romper el
  reemplazo estatico de Vite).

## Verificacion

```powershell
npm run predictions:build   # 13/13 cartones, 936 marcadores, 312 posiciones
npm test                    # 77/77 (42 base + 35 nuevos: tiebreakers, merged-standings,
                            #         group-state, active-window, group-bonuses,
                            #         point-ledger, seam-snapshot-shape)
npm run build               # 11 paginas, limpio
```

Tests clave: head-to-head deterministico (sin ciclo), maquina de estados completa,
`isClosureStale`, ventana con 2 live simultaneos + sin fuga de *TeamScore, caso
CONTRADICTORIO (gana en el partido +1 pero pierde el 2o clasificado -3 = neto -2),
cierre idempotente, reapertura sin duplicar (1 anulado(0) + 1 fresca), guardrail A3.

## PENDIENTE: aplicar SQL en remoto (manual, en ventana SIN partido vivo)

Las migraciones NO se aplican solas (gotcha conocido). En el SQL Editor de Supabase,
en una ventana sin partido vivo:

1. (Recomendado) Ensayar `apply_polla_live_match_multi.sql` entre `begin;` y `rollback;`.
2. Ejecutar `supabase/remote/apply_polla_live_match_multi.sql` (hace backup + backfill que
   aborta si huerfano + swap PK + replica identity full).
3. Ejecutar `supabase/remote/apply_group_closure.sql`.
4. Verificar (REST anon key): `polla_set_live_score` y `polla_close_group` con token dummy
   responden `P0001` (sesion invalida), NO `PGRST202` (schema). `polla_group_closure`
   responde a `select` publico.

Hasta aplicarlas, el seam sigue funcionando contra la tabla singleton (lectura
schema-agnostica) y el flujo diario de un partido no cambia.

## Siguientes incrementos (no en esta jornada)

- Stage 1/2: migrar consumidores (`tabla.client.js`, `score-race.client.js`,
  `estadisticas.client.js`, admin) a `liveMatches[]`; luego flip `MULTI_LIVE_WRITE_ENABLED`.
- UI F6 (centro de definicion /proximo-partido), F7 (ranking explicable /tabla),
  F8 (cronologia "Que cambio" + opcional `polla_match_event`), F9 (clasificacion de grupos),
  F10 (tarjeta mobile), F11 (panel cierre admin que consume `closureStale`), F12 (grafico
  determinista), F13 (simulacion `scripts/simulate-group-definition.mjs`).

Push: solo cuando el usuario lo pida.
