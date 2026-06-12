# Workflow 2026-06-12 — Modo competencia oficial (comandas 01-09)

Registro de la jornada de trabajo que llevo la Polla Mundialera de "modo
apertura" a "modo competencia oficial", y guia reutilizable para futuras
jornadas de comandas multiples.

- Commit principal: `9d8528d` ("Modo competencia oficial: nomina cerrada a 13
  + resultados oficiales en todas las secciones").
- Comandas fuente: `01..09_comanda_*.md` en la carpeta raiz del proyecto
  (fuera del repo), una por cambio.
- Mapa vivo actualizado en el mismo cambio: `mapa_sitio_trabajo_secciones_final.md`.

---

## 1. Contexto de entrada

- El Mundial ya habia empezado: 2 resultados oficiales jugados
  (Mexico 2-0 Sudafrica, Corea del Sur 2-1 Chequia) y Canada vs Bosnia
  preparado en `pending`.
- Sintomas reportados: Admin con error de RPC y KPI "0 / 72", tabla ilegible
  (tipografia y barras), ranking mobile gigante, jugadores fantasma
  (Gonzalo/Ratinha), fixture sin marcadores, estadisticas con 0/72 falso en
  dispositivos nuevos.

## 2. Diagnostico previo (antes de tocar codigo)

Paso clave que ordeno toda la jornada: **verificar el estado remoto real de
Supabase con la anon key** (lectura publica por RLS), en vez de asumir:

```text
GET  /rest/v1/polla_official_results  -> los 2 resultados YA estaban guardados
GET  /rest/v1/polla_live_match        -> match-003 pending 0-0 (correcto)
POST /rest/v1/rpc/polla_list_prediction_edit_access (token dummy)
     -> PGRST202 = la migracion prediction_edit_access NUNCA se aplico
```

Conclusiones que cambiaron el plan:

1. No habia que insertar resultados: el "0/72" del Admin era bug frontend
   (leia un mock JSON en vez de Supabase).
2. El error de RPC era de infraestructura (migracion sin aplicar), no de
   codigo: el fix correcto era un script SQL para el SQL Editor.
3. Hallazgo extra: `fonts.css` (importado despues de `tokens.css`) redefinia
   `--font-score` con Barlow primero, asi que **Rajdhani nunca se uso** hasta
   esta jornada.

## 3. Orden de ejecucion (fases)

El orden importa: primero data (todo lo demas la consume), despues el
pipeline de resultados oficiales (compartido por 4 secciones), al final lo
visual de tabla.

| Fase | Comanda | Que se hizo |
| --- | --- | --- |
| F0 | 05.1 | Script `supabase/remote/apply_prediction_edit_access.sql` (migracion idempotente + `notify pgrst, 'reload schema'`) + manejo del error PGRST202 en `predictionEditAccess.js` y degradacion del panel en `admin.client.js` |
| F1 | 04 | Cierre de nomina a 13: `players.json`, `table-predictions.mock.json`, assets borrados, `npm run predictions:build` (13/13, 936, 312), storage version `production-reset-2026-06-12-roster-13`, limpieza de identidad invalida en `/jugador`, test migrado a fixture sintetico |
| F2 | 05 | KPI "Resultados oficiales" en vivo (`initOfficialResultsKpi` + `subscribeLiveData`); racha por hitType (`StreakDot.astro`, slice -5, fix del re-render en vivo `renderStreakDots`); colores del panel derecho alineados |
| F3 | 07 | Fixture fusiona oficiales client-side (fila con marcador, hero con badge, fila "Resultado oficial"); Proximo Partido salta oficializados (+ fix de intervals acumulados); fallback en `getLiveOrRelevantMatch.ts` |
| F4 | 08 | `GroupStandingsPanel.astro` + `lib/fixture/groupStandings.js` (adaptador sobre `calculateGroupStandings` de predicciones) reemplazan a `DayAgendaPanel` (legacy sin montar) |
| F5 | 06 | `MissingPlayerIdentityModal.astro`, estado `no-identity` (distinto de `locked`), retorno dirigido `polla:returnAfterPlayerSelect`, copy del hero diferenciado |
| F6 | 09 | Tabs MI PERFIL > PARTIDOS > COMUNIDAD > CLASIFICADOS; listado con marcadores y gris palido; detalle con titulo-marcador, badge RESULTADO FINAL, columna SUMA con score-dots y leyenda |
| F7a | 02 | Barras eliminadas: `PreseasonPulse` (borrado) y banner "Tabla provisional" (markup + CSS + `toggleProvisional`) |
| F7b | 01 | Tipografia por rol en tabla: display (headers), ui (nombres, incl. podio), score (numeros, Rajdhani activado en `fonts.css`), ui 600 (estados) |
| F7c | 03 | Ranking mobile = lista compacta de una linea (38px / 1fr / 48px / 52px / 44px), header unico en thead, sin labels por fila |
| F8 | — | `npm test` (33/33), `npm run build`, greps de cierre, verificacion del dist, mapas actualizados, commit + push |

## 4. Decisiones tomadas (con el usuario)

- **Mapeo de color unico en toda la app**: morado +5 Lone Wolf / azul +3
  exacto / verde +1 tendencia / gris 0. Se alinearon tambien los colores del
  panel derecho de la tabla (antes exacto=verde y tendencia=azul, invertido).
- **SQL de Supabase**: el usuario lo aplica en el SQL Editor (no hay service
  key en el repo, y no debe haberla). Aplicado y verificado el mismo dia.
- **Desempate de la tabla de grupo**: PTS > DG > GF > head-to-head > indice
  original (regla FIFA real del motor reutilizado, en vez del "nombre" que
  sugeria la comanda).

## 5. Gotchas que hay que recordar (se repetiran)

1. **Scoped CSS vs nodos creados por JS**: todo lo que un `client.js` pinta
   en runtime (dots de racha, tbody de la tabla de grupo, pestana Partidos,
   filas del fixture) NO recibe el scope de Astro. Patrones usados:
   `<style is:global>` anclado a un data-attribute contenedor
   (`[data-rank-streak]`, `[data-group-standings-panel]`) o
   `.contentShell :global(...)` en el module.css.
2. **Payload oficial usa `homeTeamScore/awayTeamScore`** (no `homeScore`):
   siempre mapear campos al cruzar el seam (como `officialToResults`).
3. **SSR y cliente deben producir el mismo formato** (ej. streak con hitType
   y slice -5 en `calculatePlayerStandings.ts` Y en `tabla.client.js`), o el
   primer recompute "cambia" la UI sin motivo.
4. **`ensurePollaStorageVersion()` preserva identidad**: subir la version de
   storage NO limpia un `selectedPlayerId` de un jugador eliminado; la
   validacion contra `players.json` debe ser explicita (hoy vive en
   `/jugador` y `/estadisticas`).
5. **`subscribeLiveData` emite el primer snapshot async**: pintar primero el
   SSR/sincrono y dejar que el snapshot re-pinte; no bloquear el primer paint.
6. **Intervals en re-render**: si un render se re-ejecuta por suscripcion,
   los `setInterval` deben guardarse y limpiarse (countdown de proximo
   partido).
7. **Orden de imports CSS**: `fonts.css` se importa despues de `tokens.css`
   en `BaseLayout` y sus variables ganan; ambos deben declarar lo mismo.

## 6. Verificacion ejecutada

```powershell
npm run predictions:build  # 13/13 cartones, 936 marcadores, 312 posiciones
npm test                   # 33/33
npm run build              # 11 paginas, limpio
```

Mas greps de cierre (cero apariciones productivas de gonzalo/ratinha,
PRETEMPORADA, TABLA PROVISIONAL, contadores X/15) y conteos sobre `dist/`
(13 cards de jugador, 13 filas de ranking, panel de grupo presente, agenda
ausente, modal de identidad presente, tabs en orden).

Verificacion remota post-SQL: la RPC `polla_list_prediction_edit_access`
responde `invalid_or_expired_admin_session` ante token dummy (existe y
valida), ya no `PGRST202`.

## 7. Estado final

```text
Polla Mundialera SECPLAN 2026
Nomina cerrada — 13 jugadores oficiales — competencia en curso
Resultados oficiales: fuente unica polla_official_results, mandan en
Fixture, Proximo Partido, Tabla, Estadisticas y Admin.
Supabase remoto: ambas migraciones aplicadas.
```

## 8. Playbook para una proxima jornada de comandas

1. Leer el mapa vivo + todas las comandas antes de tocar nada.
2. Verificar el estado remoto real (Supabase via REST con anon key) y el
   estado del dataset (`npm run predictions:build` en seco) antes de planear.
3. Ordenar fases: data primero, seams compartidos despues, visual al final.
4. Una comanda puede estar ya medio resuelta por otra via (aqui: los
   resultados ya estaban en Supabase); confirmar sintoma vs causa.
5. Cerrar siempre con: tests + build + greps de las comandas + revision del
   dist + actualizacion de mapas (`mapa_sitio_...` y `*.map.md` locales) en
   el mismo commit.
