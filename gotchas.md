# Catalogo de gotchas — Polla Mundialera SECPLAN 2026

Trampas que ya costaron tiempo y se van a repetir. Cada una trae el sintoma, el
porque y el patron de fix. Leer la seccion relevante antes de tocar CSS de nodos
runtime, el seam de Supabase, el orden del fixture o el puntaje. Cuando aparezca un
gotcha durable nuevo, agregarlo aqui (no solo al workflow de la jornada).

## Indice

1. CSS y nodos creados en runtime
2. Datos en vivo, seam y suscripcion
3. Puntaje y precision
4. Fixture, orden y cronologia
5. Storage e identidad
6. Supabase (RLS, RPC, migraciones)
7. Build, performance y chunks
8. Admin
9. Cards compartidas y borrado seguro
10. Documentos y greps

---

## 1. CSS y nodos creados en runtime

- Contenido inyectado por un `client.js` via `innerHTML` o SVG NO recibe el atributo
  scoped de Astro. Si se estila con CSS scoped normal, no se aplica.
  - Fix: `<style is:global>` anclado a un data-attribute contenedor (ej.
    `[data-score-race]`, `[data-rank-streak]`, `[data-group-standings-panel]`), o
    estilo inline en el string del innerHTML, o `.contentShell :global(...)` en el
    module.css.
- Re-render por suscripcion vuelve a pintar dots/filas: si el primer recompute
  "cambia" la UI sin motivo, suele ser que SSR y cliente producen formatos distintos.
  - Fix: SSR y cliente deben producir el MISMO formato (ej. racha con hitType y slice
    -5 igual en el calculo SSR y en `tabla.client.js`). Pintar primero el
    SSR/sincrono y dejar que el snapshot repinte.
- Pintar dots de racha sin destruir el DOM: usar un `renderStreakDots` que actualice
  en vivo sin `innerHTML` completo, para no perder estado ni parpadear.

## 2. Datos en vivo, seam y suscripcion

- `subscribeLiveData` emite el primer snapshot de forma async. Si se bloquea el
  primer paint esperandolo, la UI llega tarde.
  - Fix: pintar el SSR/sincrono primero y dejar que el snapshot re-pinte.
- Un solo dueno del dataset/realtime por pagina. Dos suscripciones = doble canal,
  doble fetch y estados que se pelean.
  - Fix: un unico `subscribeLiveData` (ej. `estadisticas.client.js` o
    `tabla.client.js` es el dueno); las piezas (`createScoreRace`, etc.) reciben
    `{dataset, liveSnapshot}` y NO se suscriben solas.
- Depender solo del live deja la UI vacia hasta el primer handshake.
  - Fix: sembrar de un baseline commiteado (`official-results.json`, generado con
    `npm run results:snapshot`) y overlayar el vivo por `matchId` (el vivo gana /
    agrega partidos nuevos). Asi nunca queda vacia.
- El payload oficial usa `homeTeamScore/awayTeamScore`, no `homeScore/awayScore`.
  - Fix: mapear `*TeamScore` -> `*Score` en el seam ANTES de pasar al builder (como
    `officialToResults`). Olvidarlo deja marcadores en 0 o undefined.
- Intervals acumulados: si un render se re-ejecuta por suscripcion, los
  `setInterval` (countdown de proximo partido) se duplican.
  - Fix: guardar el id del interval y limpiarlo antes de re-crear.
- Cache local (`polla:liveMatchState`, `polla:officialResults`) solo tolera cortes
  breves; ya NO es fuente compartida. La verdad esta en Supabase.
- El marcador vivo dejo de ser singleton (DEFINICION SIMULTANEA). `polla_live_match` es
  multi-fila por `match_id`; `subscribeLiveData` emite `liveMatches[]` ADEMAS del
  `liveMatch` legado (= el mas nuevo por `updatedAt`) y de `groupClosures[]`. La lectura
  del seam es schema-agnostica (`select payload, updated_at` SIN filtrar por id) para
  funcionar pre y post migracion.
  - GUARDRAIL: no usar `setLiveScore`/`clearLiveScore` (multi-write) en produccion hasta
    migrar los consumidores a `liveMatches[]` (constante `MULTI_LIVE_WRITE_ENABLED`). Con
    2 vivos a la vez, el ranking publico (que aun lee solo el `liveMatch` legado)
    subcontaria.
- F1 `resolveActiveWindow` es el UNICO lugar que decide "que marcador vivo cuenta"
  (gating de fase via `resolveLiveMatchPhase`) y que mapea `*TeamScore` -> `*Score`.
  F2/F3/F4 (`buildMergedGroupStandings`, `buildGroupBonuses`, `buildPointLedger`)
  consumen su salida (ventana/resultados efectivos), NUNCA el payload crudo + `now`.

## 3. Puntaje y precision

- El modelo es NO aditivo. Un exacto unico es 5, no 5+3. En el pasado un exacto unico
  llego a dar 8 por sumar conceptos.
  - Fix: fuente unica `liveScoring.js` (`calculatePointsForPrediction`): Lone Wolf 5 /
    exacto compartido 3 / tendencia 1 / nada 0. No re-implementar en otra parte.
- Un exacto que quedaba en 0 por comparar string vs number.
  - Fix: coercion `Number()` en los marcadores antes de comparar.
- Precision % NO es puntaje. Mezclarlos corrompe el orden del ranking.
  - Fix: precision es lectura visual aparte (exacto alcanzable vs imposible: con 5-2,
    un 6-3 tiene mas % que un 4-1); el panel muestra Puntos y Precision en columnas
    separadas; precision nunca afecta el orden.
- Clasificados (primero +1, segundo +3) son una liquidacion SEPARADA del puntaje de
  partido. No sumarlos como si fueran el mismo calculo; cada bono debe ser una linea
  con su origen, y en vivo va rotulado como proyectado hasta el cierre del grupo.
- Gatillo del bono de grupo (F6): el bono 1o/2o se activa SOLO cuando >=1 de los DOS
  finales de 3a fecha del grupo esta live u oficial (o el grupo esta `final`), NO con
  cualquier partido de fechas 1-2. Antes el grupo va BLOQUEADO (sin bonos), no provisional.
  Fuente unica `isGroupDefinitionStarted` (+ `getGroupFinalMatches`) en `groupState.js`;
  `buildGroupBonuses` la usa para gatear (antes gateaba por `finishedCount+liveCount>0`, que
  activaba bonos con fechas 1-2). `computeGroupSituation` expone `definitionStarted`. F6/F7/F9
  lo heredan; no re-gatear en cada consumidor.
  - Forma del marcador: `isGroupDefinitionStarted` normaliza el payload a `*TeamScore` antes
    de `resolveLiveMatchPhase`, porque el live ya gateado por F1 viaja como `*Score` (el
    `gatedLive` que arma `buildPointLedger`). Sin esa normalizacion, el gating por la ruta del
    ledger no veria marcador y el bono quedaria en 0 con un final EN VIVO.
- Dos planos que NUNCA se mezclan: total oficial = suma de lineas `final`; total
  proyectado = suma de `final` + `provisional` (`anulado` aporta 0). El total nunca se
  guarda: se reconstruye desde el libro (`buildPointLedger`). Lo provisional jamas entra
  al ranking oficial hasta que el grupo esta `final` validado.
- Dos confianzas de "provisional": un bono en `in_definition` (vivo, volatil) NO es lo
  mismo que en `pending_close` (decidido, falta validar). Las lineas de origen `group`
  llevan `groupState` para que la UI rotule preciso ("en vivo" vs "en espera de cierre").

## 4. Fixture, orden y cronologia

- `matchNumber` NO es cronologico: el partido 08 puede jugarse antes que el 05. Usar
  `matchNumber` para "proximo" u orden del fixture muestra el partido equivocado.
  - Fix: ordenar/elegir por `dateUtc`/`dateChile` (comparador `byKickoff`). Mismo
    criterio en `/fixture`, `06_proximo_partido` y el listado de PARTIDOS de
    Estadisticas.
- El grafico/historico que se reordena segun el orden administrativo de
  finalizacion: si el Admin finaliza B antes que A, la curva cambia de forma.
  - Fix: para el HISTORICO cerrado, reconstruir con orden estable por numero oficial
    de partido. En vivo si se puede mostrar en orden de evento.
- Cronologia "Que cambio" (F8): la linea de tiempo confiable se arma por DIFERENCIA entre
  snapshots EN EL CLIENTE (snapshot anterior vs nuevo en cada recompute), NO por el `ts` del
  libro contable (`buildPointLedger` line.ts es best-effort: puede venir null o desordenado).
  - Fix: el motor `lib/statistics/buildChangeEvents.js` compara prev vs curr y el orden es el
    de LLEGADA de los snapshots (dentro de un snapshot: goles -> reordenamientos -> impactos).
    F8 es SOLO LECTURA: no recalcula puntaje (toda cifra sale del ledger/situations que el
    recompute ya produjo) y los eventos de 1o/2o solo se narran para grupos EN DEFINICION
    (gate heredado `isGroupDefinitionStarted`; los bloqueados ni siquiera entran a `situations`).
    No requiere Supabase nuevo (la tabla `polla_match_event` esta fuera de alcance).
- Desempate de tabla de grupo = criterio OFICIAL FIFA Copa 2026 (head-to-head PRIMERO,
  cambio central de 2026). Orden EXACTO: puntos -> head-to-head(pts, DG, GF entre los
  empatados) -> DG total -> GF total -> fair play (NO DISPONIBLE: no hay datos de
  tarjetas en la polla) -> fallback declarado (indice original estable, nunca azar).
  NO volver al orden viejo (2018/2022: DG global antes del head-to-head).
  - Fuente unica: `compareRows` (2 equipos) + `rankGroupRows` (3+ con mini-tabla
    TRANSITIVA por clusters; el `.sort` par-a-par NO es transitivo en empates de 3+) en
    `predicciones.standings.js`. Se propaga a `calculateGroupStandings`, tabla oficial,
    1o/2o en vivo (`computeGroupSituation`/`resolveFirstSecond`) y bonos +1/+3.
  - El clasificado del carton se DERIVA de los marcadores bajo 2026 (no del declarado):
    `predictions-importer.mjs` usa `getAutomaticQualified` como fuente de verdad y avisa
    si difiere del declarado (cartones llenados con el criterio viejo). Caso real:
    Humberto Grupo D paso de 2o paraguay (viejo) a 2o usa (2026, head-to-head).

## 5. Storage e identidad

- `ensurePollaStorageVersion()` preserva identidad: subir la version de storage NO
  limpia un `selectedPlayerId` de un jugador eliminado (nomina cerrada).
  - Fix: validar el id guardado contra `players.json` de forma explicita en
    `/jugador` y `/estadisticas`; si no existe, limpiar la identidad local.
- Estado `no-identity` es distinto de `locked`: sin jugador valido no mostrar un
  "0/72" falso.
  - Fix: progress card "Jugador no seleccionado" + `MissingPlayerIdentityModal` +
    `polla:returnAfterPlayerSelect` para volver tras elegir.
- Mantener sincronizados al cambiar el contrato de identidad: `playerIdentity.js`,
  `JugadorSection.astro`, `resetPollaState.js` y el mapa.
- Al cambiar el flujo final de predicciones, sincronizar
  `predicciones.validation.js`, `predicciones.export.js`, `predicciones.client.js`,
  `resetPollaState.js` y el mapa.

## 6. Supabase (RLS, RPC, migraciones)

- Una migracion puede estar en el repo pero NO aplicada en remoto. Sintoma: RPC
  responde `PGRST202` (schema cache) en vez del error de negocio.
  - Fix: verificar el estado remoto real con la anon key antes de planear. Aplicar el
    SQL idempotente en el SQL Editor (incluir `notify pgrst, 'reload schema'`). El
    archivo re-ejecutable queda en `supabase/remote/` por si vuelve el error.
- Escritura solo por RPC `security definer` con sesion admin temporal (2h). No crear
  policies publicas de INSERT/UPDATE. La service key no vive en el repo (y no debe).
- Operaciones que deben ser idempotentes (cierre de grupo, bonos): clave logica unica
  (ej. `grupo-A + jugador + segundo-clasificado`); re-ejecutar actualiza la misma
  fila, no crea otra.
- Degradar con mensaje claro ante caida remota (ej. `data-remote-unavailable` +
  "Modulo no disponible"), nunca romper la pagina.
- Cambiar el PK de una tabla VIVA (singleton `id='current'` -> multi-fila por `match_id`)
  es el paso mas peligroso. Patron seguro: (a) aplicar en ventana SIN partido vivo; (b)
  BACKUP de la tabla antes; (c) backfill que ABORTA con `raise exception` si alguna fila
  quedaria sin `match_id` (NUNCA `delete`); (d) swap de PK idempotente en `do` blocks; (e)
  `replica identity full` (Realtime emite el old-row completo en UPDATE/DELETE); (f)
  ensayar con `begin; ... rollback;`. Ver `supabase/remote/apply_polla_live_match_multi.sql`.
- Closure de grupo congelada que MIENTE: si se corrige/desfinaliza un partido de un grupo
  ya cerrado (`state='final'`), el 1o/2o congelado deja de coincidir con la realidad y
  nadie se entera. `isClosureStale(groupId, ...)` lo detecta (1o/2o congelado != recomputado
  en vivo, o un partido del grupo dejo de ser oficial); el panel admin debe FORZAR
  reapertura. `computeGroupSituation` expone `closureStale` para eso.

## 7. Build, performance y chunks

- Medir performance con `npm run build && npm run preview`. El dev server compila bajo
  demanda y NO representa produccion.
- Animaciones/librerias pesadas (GSAP) en lazy: `import("gsap")` dinamico dentro de la
  vista que lo usa, omitido con `prefers-reduced-motion`, en su propio chunk (no
  global).
- `astro.config.mjs` usa `inlineStylesheets: "always"` y prefetch `hover`.
- Un lib importado por un test `node:test` NO debe romper al cargar por `import.meta.env`
  (en Node `import.meta.env` no existe y acceder a `.PUBLIC_*` lanza). Fix: envolver la
  lectura en `try/catch` SIN cambiar el patron textual `import.meta.env.PUBLIC_X` (Vite lo
  reemplaza estaticamente en build; cambiar la sintaxis romperia la inyeccion). Asi el
  seam (`liveMatchState.js`) es testeable en Node (helpers puros + shape del snapshot).

## 8. Admin

- Acciones criticas: confirmacion inline de doble paso. Nunca `alert`, `prompt` ni
  `confirm`.
- KPIs (X / 72, % cargados) deben contar filas reales via `subscribeLiveData`; el mock
  es solo el valor SSR inicial. Un "0 / 72" suele ser el frontend leyendo un mock en
  vez de Supabase, no datos faltantes.
- El gate de `/admin` renderiza bloqueo por defecto; el dashboard se habilita solo con
  sesion admin remota valida. Logout no existe: la sesion expira por tiempo (2h).

## 9. Cards compartidas y borrado seguro

- Borrar o mover una card compartida (ej. el viejo `CommunityMatchPulse`) NO es borrar
  un archivo: hay que limpiar TODOS sus consumidores.
  - Fix: rastrear y limpiar mounts + hidrataciones (los `render*` en cada seccion) +
    payloads SSR muertos + CSS muerto, en TODAS las secciones que la usaban.
- Quitar UI sin tocar datos: dejar el computo (ej. `favoriteScore`) en la lib evita
  romper tests; solo se deja de mostrar. Los JSON no se tocan.

## 10. Documentos y greps

- Cerrar la jornada en el mismo commit: tests + build + greps + node checks + mapa
  principal + `*.map.md` locales + `workflow_<fecha>_*.md`. Push solo cuando el usuario
  lo pida.
- Si cambia una ruta, storage key, JSON de data, flujo de navegacion o contrato
  compartido: actualizar el mapa en el mismo cambio. Si se agrega un asset nuevo:
  registrar su carpeta publica y el data/manifest que lo referencia.
- Docs commiteados en ASCII-safe (sin tildes ni enie) para que los greps de cierre
  queden limpios y no haya problemas de encoding.
