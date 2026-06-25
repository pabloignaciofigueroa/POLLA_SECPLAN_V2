# Workflow 2026-06-24 — DEFINICION SIMULTANEA: PUESTA EN PRODUCCION + UI + fixes en vivo

Codename: DEFINICION SIMULTANEA (FABLE 6.0) — dia de la jornada real con DOS partidos del mismo
grupo a la misma hora. Este doc narra lo ejecutado el 2026-06-24 (go-live + UI nueva + bugs
cazados en vivo). Documentos hermanos: `workflow_2026-06-22_definicion_simultanea.md` (fundacion
F0-F5), `workflow_2026-06-23_definicion_simultanea_continuacion.md` (plan F6-F13 + Stage1/2 +
PASO 0). Mapa vivo: `mapa_sitio_trabajo_secciones_final.md`.

> ESTADO FINAL 2026-06-24: TODO EN PRODUCCION y pusheado (HEAD `d74e826`). Suite 158 verde, build
> 11 paginas, `npm run sim:group` 117 asserts. `MULTI_LIVE_WRITE_ENABLED=true`. Las 2 migraciones
> remotas + el hotfix del `id` aplicados y verificados. Quedo PENDIENTE solo QA visual del usuario.

## 0. Cadena de commits del dia (sobre los 11 de F6-F13/Stage2 ya pusheados `9add0c6..73a7c9e`)

| Commit | Que |
| --- | --- |
| `5a372fb` | chore: flip `MULTI_LIVE_WRITE_ENABLED=true` (commit EXCLUSIVO; Stage 2 real go-live) |
| `080188d` | feat(admin): control DUAL (bootstrap) + "quien suma por grupo" + fix de los 2 GUARDRAIL A3 + fix CSS de ocultar el single |
| `3926a81` | feat(tabla): modo DUAL simultaneo (hero dual + matriz de predicciones) |
| `ad05d24` | fix(sql): liberar `polla_live_match.id` (NOT NULL huerfano) en las 2 migraciones (repo == DB) |
| `160a3ce` | fix(admin): el panel "quien suma/cierre" AVANZA al grupo actual + contenedor con scroll |
| `d74e826` | fix(scoring): consolidar bonos de grupo cerrado en /tabla y /proximo-partido (closuresByGroup) |

## 1. PUESTA EN PRODUCCION (PASO 0 + Stage 2 real) — con GPT paso a paso + Claude el flip

Orden ejecutado (ventana sin partido vivo; la fila `match-051` estaba `pending`, no `live`):

1. Verificacion local: tree limpio, 135 tests, build, sim — todo verde.
2. Backups manuales en Supabase (plan Free, sin backups automaticos): Table Editor -> Duplicate
   Table con "Duplicate table entries" -> `backup_polla_official_results_20260624` (48 filas) +
   `backup_polla_live_match_20260624` (1 fila).
3. Aplicadas las 2 migraciones en SQL Editor, cada una ENSAYADA primero entre `begin; ... rollback;`
   y luego de verdad (sin rollback):
   - `supabase/remote/apply_polla_live_match_multi.sql` -> `polla_live_match` multi-fila por
     `match_id`, backup interno `polla_live_match_backup_20260622`, RPC `polla_set_live_score`/
     `polla_clear_live_score`/`polla_save_live_match`/`polla_finalize_match`.
   - `supabase/remote/apply_group_closure.sql` -> tabla `polla_group_closure` + RPC
     `polla_close_group`/`polla_reopen_group`.
   - Verificado con `to_regprocedure`/`to_regclass` (todas existen).
4. Push de los 11 commits (F6-F13/Stage2) y luego del flip `5a372fb`. `MULTI_LIVE_WRITE_ENABLED=true`.
5. Los 2 GUARDRAIL A3 (en `live-multi-control.test.mjs` + `seam-snapshot-shape.test.mjs`) que
   asertaban `MULTI_LIVE_WRITE_ENABLED===false` QUEDARON ROJOS por el flip (se habia pusheado sin
   correr `npm test`). Reparados: ahora verifican el MECANISMO (override `allowMultiWrite:false`),
   desacoplados del valor global -> sirve de rollback de emergencia.

## 2. UI NUEVA habilitada hoy

### 2.1 ADMIN — control DUAL de marcadores (bootstrap) [`080188d`]

PROBLEMA: el panel Stage 2 (`MultiLiveScoreControls`) solo aparecia con `liveCount>=2`, pero no
habia forma de ARRANCAR el 2o partido (deadlock huevo/gallina; `resolveActiveWindow` solo arma la
ventana con lo YA vivo).
FIX: nuevo `lib/liveMatch/liveMultiControl.js::resolveAdminControlWindow({fixture,liveMatches,
officialResults})` resuelve el PAR simultaneo desde el FIXTURE (no solo lo vivo), reusando
`resolveCurrentMatch` (misma definicion de "partido actual" que el control single del hero, para no
divergir) y ANCLANDO al par en vivo hasta que ambos finalicen (no depende de la ventana de 2h).
Cada control: "Iniciar en vivo" (phase ready->live via `setLiveScore`), Actualizar, Finalizar
(`finalizeOfficialResult(result, null)` -> la RPC limpia SOLO la fila del finalizado), Quitar
(`clearLiveScore`). Lado a lado desktop / apilado mobile. Mientras el dual esta activo OCULTA el
control single del hero (sino, dos controles escriben el mismo match-051). `admin.client.js`:
`initMultiLiveControls` + `initLiveScoreControl` ahora devuelve `{setHidden, refresh}`.

### 2.2 ADMIN — "Quien suma por grupo" [`080188d`, mejorado en `160a3ce`/`d74e826`]

El `GroupClosePanel` ("Definicion oficial de grupos / Quien suma") muestra, por grupo, el desglose
POR JUGADOR del bono (1o +1 / 2o +3): `lib/admin/groupClosePreview.js::scorerRowsFor` (predicciones
SIEMPRE, con guion antes de empezar `started=false`; +1/+3 en vivo) + `groupsInPlay` (broadened) +
`gateLiveMatches` (gatea los vivos por fase: un 0-0 PREPARADO NO infla PJ/puntos). Layout apaisado
(resumen | tabla). `160a3ce`: `currentDefinitionGroupId` (el grupo del proximo partido no-final SI
es un final) hace que el panel AVANCE al grupo actual aunque no tenga fila live; orden actual-primero
+ contenedor con scroll (`.gc-grid` max-height/overflow). En fechas 1-2 da null -> panel oculto.

### 2.3 /tabla — modo DUAL simultaneo [`3926a81`]

El ranking ya contaba ambos vivos (F7). Lo nuevo es PRESENTACIONAL: `SimultaneousWindow.astro`
(hero dual = titulo | cards de los 2 partidos por `data-phase` | clasificacion viva del grupo via
`computeGroupSituation` con live GATEADO) + `SimultaneousPredictions.astro` (matriz por jugador:
Partido A/B + clasificados + "Pts en vivo"). Resolver puro `lib/tabla/resolveDisplayWindow.js`
(ancla en el partido actual, agrupa por dateUtc/groupId, 1..N) + `windowImpactForPlayer` (impacto
PROVISIONAL de la ventana: provisional del par + bono provisional del grupo ancla -> headline cuadra
EXACTO con desglose A/B/CLAS). Cascarones SSR `hidden`, CSS is:global (paleta CLARA). Gateado N>=2;
N<=1 byte-igual. Revisado adversarialmente (2 HIGH del desglose corregidos via windowImpactForPlayer).

### 2.4 /proximo-partido — HERO del PAR simultaneo (informativo)

Cuando lo que VIENE es el par del grupo a la misma hora, el hero de /proximo-partido muestra los DOS
partidos APILADOS (locales izq, visitas der, VS + cuenta regresiva COMPARTIDA al centro) en vez de un
solo destacado: aviso "ya no es 1 partido, son 2". Presentacional (no toca puntaje ni F6). Cascaron
nuevo `FeaturedPairLayout.astro` (oculto, CSS is:global anclado a `[data-featured-pair]`, paleta clara,
mismo gotcha `[hidden]` que el resto). `proximo-partido.client.js`: `renderMatch` ancla en
`primaryMatch.id` -> `resolveDisplayWindow` (reuso, cero formula nueva); si `isSimultaneous`,
`renderMatchPair` rellena las cards por innerHTML (`teamCardHtml`, escudo/bandera por team.id),
oculta el single (`toggleHeroPair` con `style.display` inline), copy/meta/estadios de par y UNA cuenta
regresiva compartida (`startCountdown(.., "[data-pair-countdown]")`). Con un solo partido = single de
siempre (byte-igual); se fuerza el primer render limpiando `dataset.primaryMatchId` para detectar el
par en load. Hooks nuevos `data-featured-single` (FeaturedMatchLayout) y `data-hero-lead`
(MatchHeroHeader). Revisado adversarialmente (4 dimensiones, 0 bugs). Verificacion VISUAL pendiente.

## 3. BUGS cazados EN VIVO + fix (gotchas durables)

1. **`polla_live_match.id` NOT NULL** [`ad05d24`]: la migracion dropeo la PK vieja sobre `id` pero
   Postgres NO le quita el NOT NULL; la RPC inserta sin `id` (columna ya vestigial) -> la 2a fila
   (INSERT nuevo por match_id) fallaba: `null value in column "id" ... not-null constraint`. El 1er
   partido funciono porque actualizo la fila vieja `id='current'` por on-conflict. HOTFIX en remoto:
   `alter table public.polla_live_match alter column id drop not null;` + repo sincronizado
   (idempotente, en apply_ y migrations, tras `match_id set not null`).
2. **Ocultar el single (CSS `[hidden]`)** [`080188d`]: `setHidden(true)` no ocultaba el hero single
   porque `.live-control{display:flex}` (autor) le gana al UA `[hidden]{display:none}`. Fix: estilo
   inline `control.style.display = hidden ? 'none' : ''` + regla `.live-control[hidden]{display:none}`.
3. **El panel "quien suma" no AVANZABA** [`160a3ce`]: `groupsInPlay` exigia `hasFinalRow` (fila
   live/oficial). El grupo C aun sin fila no aparecia. Fix: `currentDefinitionGroupId` (ver 2.2).
4. **Bonos de grupo cerrado seguian "EN VIVO"** [`d74e826`]: `/tabla` y `/proximo-partido` llamaban
   `buildPointLedger` SIN `closuresByGroup` -> `buildGroupBonuses` no veia el cierre y dejaba los
   bonos `provisional`. Fix: extraer `closuresByGroup` del snapshot (`groupClosures`) y pasarlo a
   `buildPointLedger` + `computeGroupSituation` (tabla.client 4 sitios, proximo-partido 5 sitios).
   `estadisticas.client.js` ya lo pasaba. GOTCHA: el default `closuresByGroup={}` oculta el olvido.

## 4. ESTADO REMOTO (Supabase, proyecto vsyamgdslgeinbxwofnu)

- `polla_live_match`: multi-fila por `match_id`; `id` ya NULLABLE (hotfix). `replica identity full`.
- `polla_group_closure` + RPC de cierre/reapertura: aplicadas.
- Backups: `backup_polla_official_results_20260624`, `backup_polla_live_match_20260624`,
  `polla_live_match_backup_20260622` (interno de la migracion).
- Verificacion REST (anon key): RPC con token dummy -> `invalid_or_expired_admin_session` (no PGRST202).

## 5. PENDIENTE (del usuario / futuro)

- QA VISUAL en vivo: /tabla dual a 5 resoluciones; confirmar "finalizar uno deja el otro en vivo";
  al cerrar el Grupo C, confirmar que sus bonos consolidan y el panel avanza al D.
- Opcional futuro (ventana sin partidos): dropear la columna `id` vestigial; precision por-partido
  A/B en la matriz de /tabla (hoy omitida, fallback aprobado).

## 6. VERIFICACION GLOBAL

```
npm test                 # 158 verde (90 -> 158 a lo largo del proyecto)
npm run build            # 11 paginas
node scripts/simulate-group-definition.mjs   # 117 asserts, exit 0
```
Invariantes intactos: cero formula nueva en UI (todo de buildPointLedger/buildGroupBonuses/
computeGroupSituation/resolveActiveWindow); un solo `subscribeLiveData` por pagina; `resolveActiveWindow`
y el ranking F7 sin tocar; `calculatePlayerStandings.ts` (SSR) sin tocar; `fixture.json` intacto.
