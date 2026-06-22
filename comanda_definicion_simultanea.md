# Comanda "DEFINICION SIMULTANEA" — ventana de grupo en vivo + libro contable de puntos

Codename: DEFINICION SIMULTANEA (FABLE 6.0).
Proyecto: Polla Mundialera SECPLAN 2026 (Astro estatico + CSS Modules + JS por seccion + JSON versionado + Supabase Realtime).
Skill del proyecto (capa siempre-activa): `polla-mundialera` (`SKILL.md` + `references/gotchas.md`). Instalarla/cargarla ANTES de ejecutar esta comanda.
Mapa vivo de referencia: `mapa_sitio_trabajo_secciones_final.md`.
Workflows previos a respetar: `workflow_2026-06-12_modo_competencia_oficial.md`, `workflow_2026-06-13_grafico_carrera_de_puntaje.md`.

Esta comanda NO es "duplicar la tarjeta de Proximo Partido". Es fortalecer la
arquitectura (motor de grupo + plano oficial vs provisional + libro contable de
puntos) y, encima, montar la presentacion en vivo de la jornada final, donde se
juegan DOS partidos simultaneos por grupo y los puntos se mueven minuto a minuto,
incluyendo los puntos por primero y segundo del grupo.

Frase central del diseno (es el criterio para aceptar o rechazar cada vista):

> No mostrar solamente cuanto tiene cada jugador. Mostrar que acaba de ocurrirle a su carton.

Relacion con la skill del proyecto: la skill `polla-mundialera` es la capa durable
(invariantes, modelo de puntaje, ritual de cierre, gotchas). Esta comanda es el spec
puntual de ESTE cambio y se apoya en la skill: no repite los invariantes, los asume.
Si durante la jornada aparece un gotcha durable nuevo, va a `references/gotchas.md` de
la skill, no solo al workflow.

---

## 0. Resumen ejecutivo

Que cambia y por que:

1. "El proximo partido" (singular) deja de existir como concepto. Se reemplaza por
   una VENTANA ACTIVA = coleccion de 1..N partidos en juego, agrupados por grupo.
   En la jornada final son 2 partidos del mismo grupo a la misma hora.
2. Aparecen DOS planos de puntaje que nunca se mezclan en silencio:
   - Oficial acumulado (intocable, solo se mueve al cerrar/validar).
   - Provisional en vivo (proyeccion rotulada "en juego", desaparece o cambia con cada gol).
3. La clasificacion de grupo necesita su propio motor: standings vivo desde
   oficiales + marcadores vivos, con la cadena de desempate completa y una maquina
   de estados del grupo.
4. Los puntos por clasificados (primero +1, segundo +3) son una LIQUIDACION
   SEPARADA, no una suma silenciosa al total. Y durante la jornada final tambien
   viven, aparecen, desaparecen y alteran la carrera (esa inestabilidad es el espectaculo).
5. Cada punto tiene una linea auditable (LIBRO CONTABLE). El total se reconstruye;
   nunca se sobrescribe directamente una celda "tiene 35".
6. Se agrega la seccion "Clasificacion de grupos" en Estadisticas.
7. El Admin gana un cierre de grupo idempotente con reversion/correccion sin editar
   13 puntajes a mano.

Regla de oro transversal: **nunca sobrescribir solamente el total**. El total
oficial debe poder reconstruirse desde resultados oficiales + predicciones
bloqueadas + reglas de puntuacion + bonificaciones por clasificacion +
correcciones administrativas registradas.

---

## 1. Escala de puntaje consolidada (fuente unica, confirmada con el usuario)

Partido (ya vive en `lib/liveMatch/liveScoring.js`, modelo NO aditivo):

| Resultado | Puntos | Token |
| --- | --- | --- |
| Exacto unico / Lone Wolf | +5 | `lone_wolf` |
| Exacto compartido | +3 | `exact_shared` |
| Tendencia correcta (gano quien gano / empate) | +1 | `tendency` |
| Nada | 0 | `none` |

Clasificacion de grupo (NUEVO; el segundo vale mas porque es mas dificil de achuntar):

| Acierto | Puntos | Token |
| --- | --- | --- |
| Primero del grupo correcto | +1 | `group_first` |
| Segundo del grupo correcto | +3 | `group_second` |
| Error (primero o segundo) | 0 | `group_miss` |

Codigos visuales (no mezclar fuentes):

- Partido: se conserva el color actual (morado +5, azul +3, verde +1, gris 0).
- Clasificacion: ADEMAS del color, una insignia/forma. `1.º` (o medalla) para
  primero +1, `2.º` (o medalla) para segundo +3. Pelota/marcador para puntos de partido.
- Ejemplo de lectura: `⚽ +5 Exacto unico`, `⚽ +1 Tendencia`, `1.º +1 Primero acertado`,
  `2.º +3 Segundo acertado`. Asi dos conceptos que dan +1 o +3 no se confunden.

Dato clave de arquitectura: las predicciones de primero/segundo de cada jugador YA
existen bloqueadas en `predictions.json` (312 posiciones = 13 jugadores x 24, donde
24 = 12 grupos x 2). La liquidacion de clasificados CONSUME ese dato; no lo inventa.

---

## 2. Modelo conceptual nuevo (las piezas)

### 2.1 Ventana activa (reemplaza "proximo partido")

- Estructura: coleccion de partidos activos (1..N), agrupados por `group_id`.
- En jornada final: por grupo hay 2 partidos `live` a la misma hora.
- La UI puede seguir diciendo "En juego ahora" / "Proximos partidos", pero el
  contrato interno es una lista, no un partido unico.
- Diseno para N, optimizado para 2 (dos cards compactas lado a lado en desktop,
  dos verticales en mobile). Pueden coexistir dos grupos solapados (hasta 4 partidos):
  el contrato lo admite, la UI agrupa por grupo.

### 2.2 Dos planos de puntaje

- `oficial`: suma de lineas del libro contable en estado `final`.
- `provisional`: lineas en estado `provisional` derivadas de marcadores vivos +
  proyeccion de clasificados. NUNCA entra al ranking oficial hasta que el grupo se
  cierra y valida.
- Cifra protagonista en vivo: total proyectado, SIEMPRE rotulado. Ej:
  `44 EN VIVO` con subtitulo `35 oficiales + 9 provisionales`. Al cerrar: `44 OFICIALES · Grupo A cerrado`.

### 2.3 Motor de clasificacion de grupo

- Standings calculados desde: partidos finalizados (oficiales) + marcadores vivos
  de los partidos activos del grupo.
- Reusa/extiende `lib/fixture/groupStandings.js` (adaptador sobre
  `calculateGroupStandings` de predicciones, hoy 3/1/0 con PTS > DG > GF > head-to-head).
- Cadena de desempate COMPLETA y determinista (ver seccion 6).
- Produce: tabla ordenada, primero y segundo provisional, y `groupState`.

### 2.4 Liquidacion de clasificados (evento separado)

- Al cerrar el grupo: por cada jugador, comparar prediccion bloqueada (1º/2º) vs
  oficial. Generar dos evaluaciones independientes (primero, segundo).
- Idempotente por construccion: es funcion pura de (cierre del grupo + prediccion
  bloqueada). Clave logica de cada bonificacion: `${group}:${playerId}:first` y
  `${group}:${playerId}:second`.
- En grupos abiertos: la misma evaluacion corre en modo PROYECTADO (provisional),
  rotulada, sin tocar el total oficial.

### 2.5 Libro contable (la fuente de verdad reconstruible)

- Cada punto es una linea: `{ playerId, origen, evento, regla, puntos, estado, group, ts }`.
  - `origen`: `match` | `group`.
  - `evento`: `matchId` (para partido) | `first` | `second` (para grupo).
  - `regla`: `lone_wolf|exact_shared|tendency|none|group_first|group_second|group_miss|admin_adjust`.
  - `estado`: `provisional` | `final` | `anulado`.
- Total oficial = suma de `puntos` de lineas `final`.
- Total proyectado = suma de lineas `final` + `provisional`.
- Decision de arquitectura (ver seccion 4): el libro de PARTIDOS se DERIVA (no se
  persiste como fuente unica), porque es funcion pura de (resultado oficial +
  prediccion bloqueada + regla). Lo unico que se PERSISTE nuevo es la decision de
  cierre de grupo (1º/2º oficial + estado) y las correcciones administrativas.

### 2.6 Maquina de estados del grupo

`pending` -> `in_definition` -> `pending_close` -> `final` -> (`reopened`) -> recalculo -> `final`.

Definiciones (ver seccion 6 para transiciones exactas):

- `pending`: faltan partidos del grupo por jugar.
- `in_definition`: los dos encuentros del grupo estan activos (live).
- `pending_close`: uno termino y el otro continua (el grupo NO se cierra con uno solo).
- `final`: ambos finalizados y validados por Admin; bonificaciones oficiales.
- `reopened`: se corrigio/desfinalizo un partido del grupo; clasificacion definitiva
  invalidada, bonos a `anulado`/`provisional`, recalculo y recierre.

---

## 3. Tres niveles de informacion (criterio de UI para no saturar)

Toda vista en vivo se disena en tres capas. Nada de 20 numeros simultaneos.

- Nivel 1 (todos lo ven): dos marcadores, tabla del grupo, ranking vivo, cambio
  neto por jugador (delta rotulado en vivo).
- Nivel 2 (un toque): desglose rapido del cambio (`+5 Exacto`, `+1 Tendencia`,
  `0 Primero`, `+3 Segundo`).
- Nivel 3 (auditoria): cronologia con cada movimiento minuto a minuto
  (`56' +1 Tendencia en Partido 1`, `63' +3 Segundo acertado`, `71' +2 Tendencia pasa a exacto compartido`).

La fila principal del ranking nunca explica todo; la explicacion esta a un toque,
no escondida tres paginas mas alla.

---

## 4. Arquitectura de datos (decision y contratos)

### 4.1 Que se PERSISTE nuevo (minimo)

Tabla Supabase `polla_group_closure` (una fila por grupo A..L):

```
group_id            text  PK            -- "A".."L"
state               text                -- pending|in_definition|pending_close|final|reopened
official_first_team text  null          -- id de equipo
official_second_team text null          -- id de equipo
official_standings  jsonb null          -- snapshot ordenado al cerrar (auditoria)
version             int   default 0     -- +1 en cada recierre
closed_at           timestamptz null
closed_by           text  null          -- referencia de sesion admin
updated_at          timestamptz default now()
```

(Opcional, recomendado para late-joiners en la jornada final) Tabla append-only
`polla_match_event` para reconstruir la cronologia "Que cambio" aunque el usuario
entre tarde:

```
id          bigint identity PK
match_id    text                 -- matchNumber/id del fixture
minute      int  null            -- minuto declarado (o null)
team        text null            -- equipo que anota (o null para correccion)
home_score  int                  -- marcador resultante
away_score  int
kind        text                 -- goal|correction|finalize
created_at  timestamptz default now()
```

Reglas RLS y RPC (mismo patron que `polla_live_realtime`): lectura publica por RLS;
escritura SOLO por RPC `security definer` con sesion admin temporal. NO crear
policies publicas de INSERT/UPDATE.

RPCs nuevas (en `supabase/migrations/<timestamp>_group_closure.sql`):

- `polla_close_group(group_id, official_first, official_second, standings jsonb)`:
  upsert idempotente; setea `state='final'`, llena 1º/2º, guarda snapshot, bump de
  `version` si ya estaba `final` (recierre). Valida sesion admin.
- `polla_reopen_group(group_id, reason)`: setea `state='reopened'`, conserva 1º/2º
  como referencia pero marca bonos como no-oficiales hasta recierre. Loggea.
- (Si se adopta el log) `polla_record_match_event(match_id, minute, team, home, away, kind)`.

### 4.2 Que se DERIVA (no se persiste como verdad)

- Libro contable de PARTIDOS: funcion pura de (`polla_official_results` o marcador
  vivo) x (`predictions.json` bloqueado) x (`scoring-rules.json`) via
  `calculatePointsForPrediction` de `liveScoring.js`. Estado `final` si el resultado
  es oficial, `provisional` si viene del marcador vivo.
- Libro contable de CLASIFICADOS: funcion pura de (`polla_group_closure` para
  grupos `final`, o standings vivo proyectado para grupos abiertos) x (1º/2º
  bloqueado por jugador en `predictions.json`). `final` si el grupo esta `final`,
  `provisional` (proyectado) en cualquier otro estado.
- Total oficial y proyectado: sumas sobre el libro. Las cifras "X / 72",
  "% cargados", etc. siguen contando filas reales (ya existe el patron).

(Opcional) `point_ledger_snapshot` materializado: solo como cache/auditoria
exportable, NUNCA como fuente unica. Si se agrega, se regenera desde el builder puro.

Por que asi: respeta la regla de oro (todo reconstruible), evita un segundo origen
de verdad que se desincronice, hace la idempotencia trivial (cerrar un grupo es
upsert de una fila; los bonos se recomputan deterministas) y reusa la fuente unica
de calculo existente.

---

## 5. Fases de ejecucion (orden obligatorio: logica pura -> seam -> SSR -> cliente -> navegacion)

Mismo principio que las jornadas previas: data y logica pura primero (con tests),
seams compartidos despues, visual al final, wiring de ultimo. Cada fase deja tests
verdes y build limpio antes de pasar a la siguiente.

| Fase | Objetivo | Archivos principales | Entregable / criterio |
| --- | --- | --- | --- |
| F0 | Diagnostico + contratos | (lectura) mapa, workflows; `lib/liveMatch/*`, `lib/fixture/groupStandings.js`, `lib/statistics/types.ts`, `predictions.json`, `official-results.json` | Verificado estado remoto (REST anon key) y dataset (`predictions:build`/`results:snapshot` en seco). Tipos nuevos definidos. |
| F1 | Ventana activa (1..N) | NUEVO `lib/liveMatch/activeWindow.js` (+ tipos); reusa `liveMatchPhase.js` | `resolveActiveWindow({fixture, official, live})` agrupa por grupo y devuelve partidos activos. Tests. |
| F2 | Motor de grupo completo | `lib/fixture/groupStandings.js` (extender) + NUEVO `lib/fixture/groupTiebreakers.js` + `lib/fixture/groupState.js` | Standings vivo (oficiales+vivos), cadena de desempate completa determinista, `groupState`. Tests de empates complejos. |
| F3 | Libro contable (builder puro) | NUEVO `lib/scoring/buildPointLedger.js` (+ tipos) | Lineas por jugador (match+grupo, final/provisional) reusando `calculatePointsForPrediction`. Totales oficial/proyectado y desglose por origen. Tests. |
| F4 | Liquidacion de clasificados | NUEVO `lib/scoring/groupBonuses.js` | Evalua 1º/2º (acierto/error) por jugador, idempotente, con clave logica. Modo `final` y `proyectado`. Tests. |
| F5 | Seam: oficial vs provisional + cierre | `lib/liveMatch/liveMatchState.js` (extender): `subscribeLiveData` entrega ambos planos + estados de grupo; `closeGroup()`, `reopenGroup()` (RPC) | El callback entrega `{official, live, groupClosures}`. Cierre/reapertura por RPC. Cache local tolerante. |
| F6 | UI: Centro de definicion de grupo | `06_proximo_partido/` (`ProximoPartidoSection.astro`, `proximo-partido.client.js`, nuevas piezas `GroupDefinitionCenter`, `LiveMatchMini`, `LiveGroupStandings`, `YourImpactCard`) | "GRUPO X · EN DEFINICION · 71'": 2 marcadores compactos + tabla viva + tarjeta "Tu impacto". Desktop 2 cols, mobile vertical. |
| F7 | UI: Ranking vivo explicable | `05_tabla/` (`tabla.client.js`, nuevas piezas de fila expandible y formula) | Cada fila muestra delta neto rotulado; un toque abre la formula (oficial + cada partido + primero + segundo + neto). 3 niveles. |
| F8 | UI: "Que cambio" (cronologia) | `06_proximo_partido/` o `05_tabla/` (pieza `WhatChangedFeed` + `EventQueue`) | Cronologia por gol, filtros Todos/Mi jugador, cola "2 cambios nuevos", historial desde el inicio de la jornada. |
| F9 | UI: Seccion "Clasificacion de grupos" | `09_estadisticas/` (`EstadisticasSection.astro`, `estadisticas.client.js`, nuevas piezas `GroupQualificationTab`/`GroupQualificationCard`) | Nueva pestana: por jugador, 12 grupos, prediccion vs oficial/proyeccion, +1/+3/0, total por grupo. Estados DEFINITIVO/EN DEFINICION rotulados. |
| F10 | UI mobile: tarjeta fija personal | `06_proximo_partido/` y/o layout (`LivePersonalCard`) | Tarjeta inferior fija desplegable "TU PUNTAJE EN VIVO / 35 oficiales + 2 en juego / Ver por que cambio". |
| F11 | Admin: cierre + reversion | `10_admin/` (`AdminSection.astro`, `admin.client.js`, pieza `GroupClosePanel`) + `lib/liveMatch/liveMatchState.js` | "GRUPO X LISTO PARA CERRAR" con standings, bonos a generar y "VALIDAR Y CERRAR". Confirmacion inline de doble paso. Reabrir/corregir recalcula sin duplicar. |
| F12 | Grafico carrera determinista | `lib/statistics/buildScoreRaceTimeline.js` (orden por numero oficial de partido) | Historico cerrado se reconstruye por orden estable de partido, NO por el segundo en que se apreto finalizar. Vivo puede mostrar en orden de evento. Tests. |
| F13 | Cierre integral + simulacion | `tests/*`, build, greps, node checks, simulacion, mapas, commits | Suite verde, build limpio, simulacion completa OK, mapa principal + `*.map.md` actualizados en el mismo commit. Push solo cuando el usuario lo pida. |

Nota de alcance/MVP: si la semana aprieta, el orden de valor es F1->F2->F3->F4->F5
(arquitectura), luego F6/F7/F9 (lo que el usuario ve), luego F8/F10 (cronologia y
mobile), F11 (cierre admin) y F12 (historico). El log `polla_match_event` (F8) puede
empezar como diffing en cliente y promoverse a tabla persistida para el dia real.

---

## 6. Motor de grupo: cadena de desempate y maquina de estados (detalle de F2)

### 6.1 Cadena de desempate (determinista, sin azar)

Aplicar en este orden hasta romper el empate (reglas tipo FIFA del motor reutilizado):

1. Puntos (3/1/0).
2. Diferencia de gol global.
3. Goles a favor global.
4. Entre los equipos empatados: puntos en los partidos entre ellos.
5. Entre los empatados: diferencia de gol en esos partidos.
6. Entre los empatados: goles a favor en esos partidos.
7. (Si persiste) indice original estable del equipo (reemplaza el "sorteo"; NUNCA
   un valor aleatorio, para que el resultado sea reproducible y testeable).

Implementar en `lib/fixture/groupTiebreakers.js` como funcion pura y total
(determinista ante datos incompletos: si faltan partidos, ordena con lo que hay y
marca la tabla como provisional). Tests obligatorios con al menos: triple empate,
empate que solo se rompe en paso 4-6, y empate que cae al paso 7.

### 6.2 Estados del grupo y transiciones

| Desde | Evento | Hacia |
| --- | --- | --- |
| pending | ambos partidos del grupo pasan a `live` | in_definition |
| in_definition | uno finaliza oficial, el otro sigue `live` | pending_close |
| pending_close | el segundo finaliza oficial | (sigue) pending_close hasta validar |
| pending_close | Admin valida y cierra (RPC) | final |
| final | Admin reabre/corrige un partido del grupo | reopened |
| reopened | recalculo + Admin recierra | final |

Regla dura: el grupo NO pasa a `final` por finalizacion automatica; requiere la
validacion explicita del Admin. Y NO se considera cerrado si solo termino uno de
los dos partidos.

### 6.3 Que produce el motor

`computeGroupSituation(groupId, {fixture, official, live})` devuelve:
`{ standings[], first, second, state, finishedCount, totalMatches, isProvisional }`.

---

## 7. Especificacion de superficies (detalle de UI)

Layouts de referencia (respetar la jerarquia, no el ASCII literal). Mantener el CSS
de nodos pintados en runtime en `<style is:global>` anclado a un data-attribute
contenedor (gotcha conocido del scoped CSS).

### 7.1 Centro de definicion de grupo (F6, en `/proximo-partido`)

```
GRUPO A · EN DEFINICION · 71'
  MEXICO 1-1 CANADA          SUDAFRICA 2-1 COREA
  Partido 1 · EN VIVO        Partido 2 · EN VIVO

CLASIFICACION EN VIVO            TU IMPACTO
1. Sudafrica  6 pts  +2  ↑      Felipe
2. Mexico     5 pts  +1  ↓      35 oficiales
3. Canada     4 pts   0  ↑      +2 en juego
4. Corea      1 pt   -3         37 proyeccion

           RANKING VIVO DE LA POLLA
```

- La tabla del grupo se rotula "Clasificacion con los marcadores actuales", NO
  "oficial".
- "Tu impacto" usa el jugador de identidad local (`polla:selectedPlayerId`).
- Cards de partido compactas: priorizar marcador, estado, equipos, minuto y acceso
  al detalle (no la card gigante actual).

### 7.2 Ranking vivo explicable (F7, en `/tabla`)

Fila compacta:

```
3.º FELIPE                          37   ▲ +2 EN VIVO
MEX-CAN +3   RSA-COR +1   1.º +1   2.º -3
```

Al tocar (Nivel 2/3):

```
PUNTOS DE FELIPE · GRUPO A
Partido 1               +3   Exacto compartido
Partido 2               +1   Tendencia
Primero del grupo       +1   Predijo Sudafrica
Segundo del grupo        0   Predijo Canada, actualmente 3.º
Cambio vivo del grupo   +5
```

- La cifra protagonista es el total proyectado, con subtitulo `oficiales + provisionales`.
- Frase explicativa cuando hay contradiccion: "Felipe gano precision en el partido,
  pero perdio su segundo clasificado. Neto: -1."

### 7.3 "Que cambio" (F8)

- Bloque/pestana con filtros: Todos / Mi jugador.
- Por gol, narracion encadenada:
  ```
  71' · GOL DE SUDAFRICA
  Sudafrica sube del 3.º al 1.º. Mexico baja del 1.º al 2.º. Canada momentaneamente eliminado.
  Felipe  +2 (exacto compartido)  -3 (Canada deja de ser 2.º)  NETO -1
  Humberto +5 (exacto unico)  +1 (mantiene primero)  NETO +6
  ```
- Mostrar primero a los mas afectados; el resto se despliega.
- Cola "2 CAMBIOS NUEVOS" + historial "Ver movimientos desde que comenzo la jornada".
- El "0" tambien se explica: "Eric no cambio su total: +3 por clasificacion, -3 en el partido".
- Animacion legible (no saltar todos los numeros a la vez): gol -> marcador ->
  reordenar grupo -> cambiar predicciones de clasificacion -> recalcular puntos de
  partido -> cambio neto por jugador -> mover ranking. Respetar `prefers-reduced-motion`.

### 7.4 Seccion "Clasificacion de grupos" (F9, en `/estadisticas`)

- Nueva pestana (orden de tabs a definir con el usuario; sugerido despues de PARTIDOS).
- Por jugador, 12 grupos en formato compacto:
  ```
  GRUPO A · DEFINITIVO
  Tu prediccion: 1.º Mexico · 2.º Senegal
  Oficial:       1.º Mexico  ✓ +1 · 2.º Canada ✕ 0
  Total del grupo: +1
  ```
- Grupo abierto: encabezado "EN DEFINICION" y bonos rotulados "+N proyectado", con
  aviso "Bonificacion todavia no oficial".
- Reusa el builder de clasificados (F4) en modo final/proyectado. Datos via
  `estadisticas.client.js` (dueno unico del dataset + `subscribeLiveData`).

### 7.5 Tarjeta personal fija mobile (F10)

```
TU PUNTAJE EN VIVO
Felipe                  37
35 oficiales + 2 en juego
Ver por que cambio  ↑
```
Al abrir: Partido 1 +3 / Partido 2 +1 / Primero +1 / Segundo -3 / Neto +2.

### 7.6 Panel de cierre Admin (F11, en `/admin`)

```
GRUPO A LISTO PARA CERRAR
1.º Mexico  2.º Canada  3.º Senegal  4.º Corea
Bonificaciones a generar:
  Primer lugar: 8 jugadores · 8 puntos
  Segundo lugar: 3 jugadores · 9 puntos
  Total distribuido: 17 puntos
[ VALIDAR Y CERRAR GRUPO ]
```

- El sistema calcula; el Admin verifica y confirma. Confirmacion inline de doble
  paso (no `alert`/`confirm`/`prompt`, gotcha conocido).
- Idempotente: apretar dos veces no duplica (clave unica por bono; cierre = upsert).
- Reabrir/corregir: invalida definitiva, bonos a `anulado`/`provisional`, recalcula,
  recierra regenerando sin duplicar, registra que cambio.

---

## 8. Invariantes (no romper; son criterios de rechazo)

1. Nunca sobrescribir solamente el total. El total se reconstruye desde el libro.
2. Lo provisional jamas entra al ranking oficial hasta que el grupo esta `final`
   validado. Toda cifra viva va rotulada ("EN VIVO"/"proyectado").
3. Idempotencia del cierre y de los bonos (clave logica `${group}:${player}:first|second`).
4. Desglose siempre presente: nunca "Humberto sumo 6"; siempre "+5 en X y +1 en Y".
5. `fixture.json` es calendario fijo, no se modifica.
6. `matchNumber` NO es cronologico: para "ventana"/orden de fixture usar
   `dateUtc`/`dateChile`. Para el HISTORICO del grafico, orden estable por numero
   oficial de partido (no por el segundo de finalizacion).
7. Fuente unica de calculo de puntaje: `lib/liveMatch/liveScoring.js`
   (`calculatePointsForPrediction`). No re-implementar puntaje en otra parte.
8. Mapear `homeTeamScore/awayTeamScore` -> `homeScore/awayScore` en el seam antes
   de cualquier builder (el payload oficial usa la forma `*TeamScore`).
9. CSS de nodos creados en runtime via `<style is:global>` anclado a data-attribute
   contenedor; los `client.js` siguen scoped a su seccion.
10. `subscribeLiveData` emite el primer snapshot async: pintar SSR/sincrono y dejar
    que el snapshot repinte; limpiar `setInterval` en re-render (countdown).
11. El grupo no se cierra con un solo partido finalizado.
12. Una correccion no puede obligar a editar 13 puntajes a mano.

---

## 9. Plan de simulacion (semana 22-26 jun, antes de la jornada real)

Crear `scripts/simulate-group-definition.mjs` (o tests de integracion) que ejecute
una prueba ficticia completa de un grupo, sin tocar produccion:

1. Estado inicial: 4 partidos del grupo ya jugados (oficiales), 2 partidos finales
   en `pending`.
2. Pasar ambos a `live` (estado `in_definition`).
3. Inyectar goles uno por uno y verificar en cada paso:
   - standings y desempate cambian correcto;
   - primero/segundo provisional cambian;
   - el libro contable de cada jugador recalcula partido + clasificacion;
   - aparece el caso contradictorio (gana en partido, pierde clasificado): neto correcto;
   - el ranking vivo se mueve y el delta queda rotulado.
4. Finalizar un partido antes que el otro (estado `pending_close`): el grupo NO se
   cierra; los bonos siguen provisionales.
5. Finalizar el segundo y CERRAR via Admin (estado `final`): los provisionales pasan
   a oficiales; bonos con clave unica; total reconstruido = suma del libro.
6. Re-ejecutar el cierre: NO duplica (idempotencia).
7. Reabrir/corregir un resultado: estado `reopened`, definitiva invalidada, bonos
   anulados/provisionales, recalculo, recierre sin duplicar, registro del cambio.
8. Verificar el grafico de carrera: el historico cerrado es estable bajo distinto
   orden de finalizacion.

Casos borde a cubrir: dos goles casi simultaneos (cola de cambios muestra estado B
intermedio, no solo A->C); jugador con 0 neto por compensacion; Lone Wolf que
aparece y desaparece con el marcador; dos grupos solapados (4 partidos activos).

---

## 10. Verificacion y criterios de aceptacion (F13)

Comandos:

```
npm run results:snapshot   # refresca baseline desde Supabase si cambiaron oficiales
npm run predictions:build  # 13/13 cartones, 936 marcadores, 312 posiciones
npm test                   # suite completa verde (sumar tests nuevos de F1-F4, F12)
npm run build              # 11 paginas, limpio (chunks lazy donde aplique)
npm run preview            # medir performance real (no dev server)
```

Greps de cierre (que no quede el concepto viejo "un solo proximo partido" donde
debe haber ventana, y que los rotulos provisional/oficial existan):

```
rg -n "proximo partido|getLiveOrRelevantMatch|liveMatchPhase|groupStandings" src
rg -n "EN VIVO|provisional|proyectad|group_first|group_second" src
rg -n "polla_group_closure|closeGroup|reopenGroup" src supabase
```

Node checks / QA manual (checklist):

- [ ] Ventana con 2 partidos del mismo grupo se ve y puntua independiente.
- [ ] Cifra viva siempre rotulada; oficial nunca se mueve sin cierre validado.
- [ ] Formula por jugador (oficial + cada partido + 1º + 2º + neto) correcta y a un toque.
- [ ] "Que cambio" narra cada gol y explica el 0; cola e historial funcionan.
- [ ] Seccion "Clasificacion de grupos": prediccion vs oficial/proyeccion, +1/+3/0, total por grupo.
- [ ] Tarjeta mobile fija desplegable.
- [ ] Admin: cierre idempotente + reapertura/correccion sin editar a mano; bonos por clave unica.
- [ ] Grafico historico estable bajo distinto orden de finalizacion.
- [ ] Tests de desempate complejo verdes.

Verificacion remota post-migracion (REST con anon key): las tablas/RPC nuevas
responden y validan sesion admin (token dummy -> error de sesion, no error de schema).

---

## 11. Gotchas heredados que aplican (de los workflows previos)

1. `matchNumber` no es cronologico (usar `dateUtc`/`dateChile` para ventana/orden).
2. Depender solo del live deja UI vacia: sembrar de baseline commiteado
   (`official-results.json`) y overlayar el vivo; refrescar con `results:snapshot`.
3. Nodos/SVG pintados en runtime no reciben scope de Astro: `<style is:global>`
   anclado a data-attribute contenedor.
4. El consumidor del dataset es dueno unico (`estadisticas.client.js` /
   `tabla.client.js`): un solo `subscribeLiveData`, sin doble fetch ni doble canal.
5. Mapear `*TeamScore` -> `*Score` en el seam antes del builder.
6. GSAP/animaciones lazy (chunk aparte, solo la vista que lo usa, respeta reduced-motion).
7. SSR y cliente deben producir el mismo formato (evita el "salto" del primer recompute).
8. Intervals en re-render: guardar y limpiar (countdown de partido).
9. Quitar/mover UI sin romper datos: dejar el computo en la lib; solo cambia lo que se muestra.
10. Borrar/mover una card compartida implica limpiar mounts + hidrataciones +
    payloads SSR + CSS muertos en TODAS las secciones que la usaban.
11. Confirmaciones criticas de Admin: inline de doble paso, nunca `alert/confirm/prompt`.

---

## 12. Entregables y commits sugeridos

Un commit por fase (o por grupo de fases afines), con tests + build verdes en cada uno:

- `feat(live): ventana activa 1..N por grupo (lib pura + tests)` (F1)
- `feat(group): motor de standings vivo + cadena de desempate + estados (lib + tests)` (F2)
- `feat(scoring): libro contable derivado oficial/provisional (lib + tests)` (F3)
- `feat(scoring): liquidacion de clasificados 1º/2º idempotente (lib + tests)` (F4)
- `feat(seam): subscribeLiveData con dos planos + closeGroup/reopenGroup (RPC + migracion)` (F5)
- `feat(ui): centro de definicion de grupo en /proximo-partido` (F6)
- `feat(ui): ranking vivo explicable con formula por jugador` (F7)
- `feat(ui): cronologia "Que cambio" + cola de eventos` (F8)
- `feat(stats): seccion Clasificacion de grupos` (F9)
- `feat(ui): tarjeta personal fija mobile en vivo` (F10)
- `feat(admin): panel de cierre de grupo + reversion` (F11)
- `fix(graph): orden determinista del historico por numero oficial de partido` (F12)
- `chore(sim): simulacion completa de jornada final + cierre/reapertura` (F13)

Cierre obligatorio en el ultimo commit de la jornada: actualizar
`mapa_sitio_trabajo_secciones_final.md` (indice "quiero cambiar X", inventarios de
data/helpers/storage, historial de decisiones) y los `*.map.md` locales afectados
(05_tabla, 06_proximo_partido, 07_fixture, 09_estadisticas, 10_admin). Crear el
`workflow_<fecha>_definicion_simultanea.md`. Si surgio un gotcha durable nuevo (ej.
algo del manejo de la ventana, de los dos planos, del cierre idempotente), agregarlo
a `references/gotchas.md` de la skill `polla-mundialera` y revisar si el modelo de
puntaje/invariantes de la skill necesita una linea nueva (clasificados, estados de
grupo). Push solo cuando el usuario lo pida.

---

## 13. Playbook de arranque para Claude Code (orden literal de la primera sesion)

1. Cargar la skill `polla-mundialera` (queda en `available_skills`; si no, instalar el
   `.skill`). Leer su `SKILL.md` + `references/gotchas.md`. Luego el mapa vivo + esta
   comanda + los dos workflows.
2. Verificar estado remoto real (Supabase REST con anon key) y dataset
   (`predictions:build` y `results:snapshot` en seco). Confirmar 13/936/312.
3. Inventariar TODOS los supuestos de "un solo partido activo" en el codigo
   (`getLiveOrRelevantMatch`, `liveMatchPhase`, cards de proximo/tabla) antes de tocar.
4. Definir tipos nuevos (ventana, situacion de grupo, linea del libro, estado de
   grupo) en `lib/.../types`.
5. Ejecutar F1->F2->F3->F4 (todo lib pura con tests) sin tocar UI.
6. Recien entonces el seam (F5), luego la UI (F6+), navegacion al final.
7. No avanzar de fase con tests rojos o build sucio.
