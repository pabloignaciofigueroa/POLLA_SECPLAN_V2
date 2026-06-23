# Workflow 2026-06-22 - Desempate de grupos al criterio FIFA 2026

Comanda: arbol `comandas_desempate_grupos_2026/` (00_INDEX -> 10/11/12 referencias ->
20_pasoA -> 21_pasoB -> 22_pasoC -> 90_cierre). Correccion de FUNDACION (no UI).
Commiteado JUNTO con la fundacion F0-F5 en `44846b1` (main, sin push). Skill del
proyecto: `polla-mundialera`.

## Contexto y problema (verificado)

El codigo ordenaba los grupos con el criterio VIEJO (Mundiales 2018/2022): diferencia de
gol GLOBAL primero, head-to-head despues. El criterio OFICIAL Copa 2026 cambio: el
head-to-head SUBE de prioridad (va PRIMERO entre los empatados a puntos). Define quien
sale 1o/2o de cada grupo y, por lo tanto, los bonos de clasificacion +1/+3. Es lo mas
reclamable el dia del partido.

Es fuente unica: `compareRows` (+ `calculateGroupStandings`) en
`src/sections/04_predicciones/predicciones.standings.js`. Al corregir ahi se propaga solo
a la tabla oficial, al 1o/2o provisional en vivo y a los bonos (todo pasa por
`computeGroupSituation -> buildMergedGroupStandings -> calculateGroupStandings`).

## Orden vigente (FIFA 2026)

PTS > head-to-head(pts, DG, GF entre los empatados) > DG total > GF total > fair play
(NO DISPONIBLE: no hay datos de tarjetas en la polla) > fallback declarado (indice
original estable, nunca azar).

## Que se hizo

- **Paso A** (`compareRows`): reordenado para que el head-to-head mande ANTES de la DG/GF
  global. Resuelve el caso de 2 equipos. Comparador par-a-par; sigue exportado (lo usa el
  facade `groupTiebreakers.js`).
- **Paso B** (`rankGroupRows` NUEVO): ordenador por CLUSTERS con mini-tabla TRANSITIVA
  para empates de 3+ (el `.sort(compareRows)` par-a-par NO es transitivo en 3+).
  `calculateGroupStandings` ahora usa `rankGroupRows`. Los que siguen iguales en la mini
  caen al PASO 2 (DG total -> GF total -> fair play N/A -> fallback).
- **Paso C**: fair play N/A y fallback declarado documentados en el codigo; consumidores
  verificados por propagacion (sin cambios extra, fuente unica).

## Decision de datos (con el usuario; reclamable)

El clasificado del carton se DERIVA de los marcadores bajo 2026, NO del declarado en el
JSON (que se lleno con el criterio viejo). `predictions-importer.mjs` usa
`getAutomaticQualified` como fuente de verdad y registra `derivationWarnings` cuando
difiere; ya NO falla por mismatch declarado-vs-derivado. Caso real unico: **Humberto
Grupo D paso de 2o paraguay a 2o usa** (usa gano el head-to-head). `predictions.json` +
`public/data/community-predictions.json` regenerados con `npm run predictions:build`.

## Tests (7 casos del 12_testeo)

`tests/group-tiebreakers.test.mjs`: caso 1 (testigo: B 1o pese a peor DG global), 2 (h2h
empatado -> DG/GF total), 3 (3 empatados, mini transitiva b>c>a, distinta del orden por
DG global), 4 (mini separa a uno y deja dos -> PASO 2 DG total), 5 (determinismo,
barajar entrada), 6 (fallback determinista). Caso 7 (propagacion) en
`tests/group-merged-standings.test.mjs`. Suite 82/82 verde, build 11 paginas limpio.

## Borde conocido (NO implementado)

La regla FIFA re-aplica desde el PASO 1 (head-to-head) si tras el PASO 2 un subconjunto
vuelve a empatar (recursivo). La version cluster + fallback resuelve los casos practicos
de la polla; queda anotado como borde.

## Verificacion

```powershell
npm run predictions:build   # 13/13, 936, 312 (Humberto GD ya deriva usa)
npm test                    # 82/82
npm run build               # 11 paginas, limpio
```
Greps de cierre: `rg -n "compareRows|rankGroupRows|directStats|fair.?play|fallback" src/sections/04_predicciones/predicciones.standings.js`.

## Docs actualizados (mismo commit)

`mapa_sitio_trabajo_secciones_final.md` (entrada 07_fixture + historial), `gotchas.md`
(seccion 4: corregido el orden viejo + gotcha durable), `SKILL.md`,
`src/sections/04_predicciones/predicciones.map.md`, memoria
`desempate-grupos-fifa-2026.md`. Fuente del criterio: FIFA Copa 2026. **Supersede** la
cadena de desempate descrita en `comanda_definicion_simultanea.md` 6.1 (que listaba el
orden viejo).

## Relacion con las otras comandas

Esta correccion es BASE para F6/F7/F9/F11 de DEFINICION SIMULTANEA: el 1o/2o (y por ende
los bonos) ahora salen del orden correcto. Por eso se aplico antes/junto con esas.

Push: solo cuando el usuario lo pida.
