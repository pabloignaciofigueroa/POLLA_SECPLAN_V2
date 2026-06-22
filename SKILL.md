---
name: polla-mundialera
description: "Convenciones, arquitectura e invariantes para trabajar en la Polla Mundialera SECPLAN 2026 (app Astro estatica + CSS Modules + JS por seccion + JSON versionado + Supabase Realtime). Usa esta skill SIEMPRE que la tarea toque este proyecto: cualquier seccion (inicio, reglas, jugador, predicciones, tabla, proximo partido, fixture, equipos, estadisticas, admin), el puntaje (exacto unico 5, exacto compartido 3, tendencia 1, lone wolf, clasificados primero y segundo de grupo), el marcador en vivo o los resultados oficiales en Supabase (polla_live_match, polla_official_results), la tabla dinamica, el grafico Carrera de Puntaje, los standings de grupo, o cuando se ejecute o escriba una comanda, se actualice el mapa del sitio, o se cierre una jornada con tests/build/greps. Cargala aunque el pedido no nombre la skill: si menciona la Polla, SECPLAN, cartones, o archivos como predictions.json, fixture.json, liveScoring.js o liveMatchState.js, esta skill aplica."
---

# Polla Mundialera SECPLAN 2026

Skill de proyecto: la capa siempre-activa de convenciones, arquitectura e
invariantes. No reemplaza a los documentos vivos del repo; los ordena y dice como
trabajar sin romper nada. La idea es entrar a cualquier tarea del proyecto con el
mismo criterio con que se resolvieron las jornadas anteriores.

Que es el proyecto: una polla (prediccion) del Mundial para la oficina SECPLAN.
Sitio Astro estatico, CSS Modules, un `client.js` por seccion, datos en JSON
versionado y estado compartido del marcador en vivo + resultados oficiales en
Supabase (lectura publica por RLS, escritura solo por RPC con sesion admin
temporal). 13 cartones oficiales, 72 partidos de fase de grupos, puntaje no
aditivo.

## Documentos del proyecto y como se relacionan

Leer en este orden segun la tarea. Cada capa tiene un rol:

1. Esta skill: lo durable (invariantes, modelo de puntaje, ritual de cierre, donde
   vive cada cosa). Siempre activa.
2. `mapa_sitio_trabajo_secciones_final.md` (raiz del repo): mapa VIVO y detallado de
   cada ruta/seccion/archivo/storage/data. Es la fuente de detalle; esta skill solo
   resume. Si hay conflicto, el mapa manda para los detalles y se actualiza en el
   mismo commit del cambio.
3. `*.map.md` dentro de cada seccion: mapas locales mas especificos.
4. `comanda_*.md` / `NN_comanda_*.md`: especificacion de UN cambio concreto a
   implementar. Una comanda se ejecuta apoyada en esta skill + el mapa.
5. `workflow_<fecha>_*.md`: registro de cada jornada grande ya hecha (decisiones,
   fases, gotchas). Historia reutilizable.
6. `references/gotchas.md` (en esta skill): catalogo completo de trampas con su
   porque y el patron de fix. Leerlo antes de tocar CSS de nodos runtime, el seam de
   Supabase, el orden del fixture o el puntaje.

## Antes de tocar nada (orden de arranque)

Este paso ordeno todas las jornadas previas. No asumir; verificar.

1. Leer el mapa vivo + la(s) comanda(s) de la tarea + el ultimo `workflow_*.md`.
2. Verificar el estado remoto REAL de Supabase con la anon key (lectura publica por
   RLS), no de memoria: que hay en `polla_official_results` y `polla_live_match`. Un
   "0 / 72" en Admin suele ser bug de frontend, no datos faltantes.
3. Verificar el dataset en seco: `npm run predictions:build` (debe dar 13/13
   cartones, 936 marcadores, 312 posiciones) y `npm run results:snapshot` si el
   baseline del grafico puede haber cambiado.
4. Confirmar sintoma vs causa antes de planear. Una tarea puede estar medio resuelta
   por otra via (ej.: los resultados ya estaban en Supabase).

## Modelo de puntaje (fuente unica)

Calculo en `lib/liveMatch/liveScoring.js` (`calculatePointsForPrediction`), usado por
SSR y vivo. Modelo NO aditivo. No re-implementar puntaje en otra parte.

Partido:

| Resultado | Puntos | Token | Color |
| --- | --- | --- | --- |
| Exacto unico / Lone Wolf | +5 | `lone_wolf` | morado |
| Exacto compartido | +3 | `exact_shared` | azul |
| Tendencia correcta | +1 | `tendency` | verde |
| Nada | 0 | `none` | gris |

Clasificacion de grupo (el segundo vale mas: es mas dificil de achuntar):

| Acierto | Puntos | Token |
| --- | --- | --- |
| Primero del grupo correcto | +1 | `group_first` |
| Segundo del grupo correcto | +3 | `group_second` |
| Error | 0 | `group_miss` |

Codigos visuales: el color (morado/azul/verde/gris) es para PARTIDOS. Para
clasificados, ademas del color, usar insignia/forma (`1.º`, `2.º` o medalla) para
que no se confundan dos conceptos que dan +1 o +3 desde fuentes distintas.

Precision % es lectura visual aparte (exacto alcanzable vs imposible); NUNCA entrega
puntos ni afecta el orden.

## Invariantes que no se rompen

Estos son criterios de rechazo. El porque y mas casos estan en `references/gotchas.md`.

1. Fuente unica de puntaje: `liveScoring.js`. No duplicar la formula.
2. Nunca sobrescribir solo el total de un jugador. El total se reconstruye desde
   resultados oficiales + predicciones bloqueadas + reglas + bonos de clasificacion +
   correcciones registradas. Una celda "tiene 35" puede existir como cache, no como
   unica verdad.
3. Oficial vs provisional no se mezclan en silencio: toda cifra viva va rotulada
   ("EN VIVO"/"provisional"/"proyectado") y no entra al ranking oficial hasta cierre
   validado.
4. `fixture.json` es calendario fijo: no se modifica.
5. `matchNumber` NO es cronologico. Para "proximo"/orden de fixture usar
   `dateUtc`/`dateChile`. Para el HISTORICO del grafico, orden estable por numero
   oficial de partido (no por el segundo en que se apreto finalizar).
6. CSS de nodos creados en runtime por un `client.js` (innerHTML/SVG) NO recibe el
   scope de Astro: estilar con `<style is:global>` anclado a un data-attribute
   contenedor (ej. `[data-score-race]`, `[data-rank-streak]`), o inline en el string.
7. Un solo dueno del dataset/realtime por pagina: un unico `subscribeLiveData`; las
   piezas reciben `{dataset, liveSnapshot}` (sin doble fetch ni doble canal).
8. Mapear `homeTeamScore/awayTeamScore` -> `homeScore/awayScore` en el seam antes de
   cualquier builder (el payload oficial usa la forma `*TeamScore`).
9. El grafico/tabla se siembra de un baseline commiteado y el vivo solo overlaya:
   nunca depender solo del live (deja la UI vacia).
10. Acciones criticas de Admin: confirmacion inline de doble paso, nunca
    `alert`/`confirm`/`prompt`.
11. Escritura a Supabase solo por RPC `security definer` con sesion admin temporal.
    No crear policies publicas de INSERT/UPDATE. La service key no vive en el repo.
12. Storage local versionado (`resetPollaState.js`): subir version NO limpia una
    identidad de un jugador eliminado; validar el id contra `players.json` de forma
    explicita (nomina cerrada).

## Donde vive cada cosa (resumen; el detalle esta en el mapa)

Secciones (carpeta soberana: orquestador Astro + CSS Module + subcomponentes + map
local + `client.js`):

| Ruta | Carpeta | Que es |
| --- | --- | --- |
| `/` | `src/sections/01_inicio/` | Portada, copa, CTA |
| `/reglas` | `02_reglas/` | Reglas y puntajes |
| `/jugador` | `03_jugador/` | Seleccion de identidad |
| `/predicciones` | `04_predicciones/` | Captura de cartones + clasificados + descarga JSON |
| `/tabla` | `05_tabla/` (+ `src/lib/tabla/`) | Ranking competitivo / tabla dinamica |
| `/proximo-partido` | `06_proximo_partido/` | Partido(s) destacado(s) |
| `/fixture` | `07_fixture/` | Calendario + detalle + tabla de grupo |
| `/equipos` | `08_equipos/` | Album de selecciones |
| `/estadisticas` | `09_estadisticas/` (+ `src/lib/statistics/`) | Data center: GRAFICO, PARTIDOS, COMUNIDAD, MI PERFIL, COMPARAR |
| `/admin` | `10_admin/` | Dashboard admin + marcador en vivo, con gate |

Seam compartido (marcador vivo + resultados oficiales):

- `lib/liveMatch/liveMatchState.js`: login/sesion admin por RPC, guardado atomico,
  lecturas REST, cache y `subscribeLiveData` (Realtime). `saveLiveMatchState()`
  actualiza `polla_live_match`; `finalizeOfficialResult()` oficializa y avanza en una
  operacion atomica.
- `lib/liveMatch/liveMatchPhase.js`: fuente unica del tri-estado official/live/pending
  (gating de puntaje por hora de fixture + goles explicitos). Solo `live` puntua.
- `lib/liveMatch/liveScoring.js`: fuente unica de calculo (ver puntaje).
- `lib/fixture/groupStandings.js`: tabla real de grupo (adaptador sobre
  `calculateGroupStandings` de predicciones; 3/1/0, criterio FIFA 2026 = PTS >
  head-to-head(pts,DG,GF) > DG total > GF total > fair play N/A > fallback; fuente
  unica `compareRows`/`rankGroupRows`, mini-tabla transitiva para empates de 3+).
- `lib/statistics/buildScoreRaceTimeline.js` / `buildScoreRaceNarrative.js`: Carrera
  de Puntaje (puros; reusan `liveScoring`).

Data clave en `src/data/`: `players.json` (13), `teams.json` (48), `groups.json`
(A-L = 12), `fixture.json` (72), `predictions.json` (canonico: 936 marcadores, 312
posiciones), `official-results.json` (baseline commiteado del grafico),
`scoring-rules.json`. Los `predicciones_*.json` viven en la raiz y alimentan
`npm run predictions:build`.

## Orden de trabajo de una jornada (fases)

Mismo principio en todas las jornadas: el orden importa.

1. Logica pura primero (builders en `lib/` + tests). Nada de UI todavia.
2. Seams compartidos despues (el contrato en `lib/`, ej. `liveMatchState.js`).
3. Shells SSR (orquestador Astro + componentes).
4. Cliente (`client.js`) al final.
5. Navegacion/wiring de ultimo.
6. No avanzar de fase con tests rojos o build sucio.

Si un dato se quiere ocultar (favorito, consenso), quitar SOLO la UI y dejar el
computo en la lib: no romper tests ni el modelo. Si una card es compartida, rastrear
TODOS sus consumidores (mounts, hidrataciones, payloads SSR, CSS) antes de borrarla.

## Cierre de jornada (ritual obligatorio)

Cerrar SIEMPRE con, en el mismo commit:

```
npm run predictions:build   # 13/13, 936, 312 (si toco predicciones/datos)
npm run results:snapshot     # refresca baseline del grafico si cambiaron oficiales
npm test                     # suite verde (sumar tests nuevos)
npm run build                # paginas limpias, chunks lazy donde aplique
npm run preview              # medir performance real (NO el dev server)
```

Mas: greps de cierre (que no queden terminos obsoletos ni contadores viejos),
node checks de la logica nueva, y actualizar `mapa_sitio_trabajo_secciones_final.md`
(indice "quiero cambiar X", inventarios de data/helpers/storage, historial de
decisiones) + los `*.map.md` locales afectados. Escribir el
`workflow_<fecha>_<tema>.md` de la jornada. Si surgio un gotcha durable nuevo,
agregarlo tambien a `references/gotchas.md` de esta skill. Hacer push solo cuando el
usuario lo pida.

## Convencion de escritura de docs

Los documentos commiteados del repo (mapa, workflows, comandas) se escriben
ASCII-safe: sin tildes ni enie (usar "n" por "ñ"). Asi los greps de cierre quedan
limpios y no hay problemas de encoding en el pipeline. Mantener ese estilo al crear o
editar cualquier doc del proyecto.

## Para profundizar

- Catalogo completo de gotchas con porque y patron de fix: leer `references/gotchas.md`.
- Detalle exacto de archivos, storage keys y data: leer el mapa vivo del repo.
- Que se hizo y por que en jornadas previas: leer los `workflow_*.md`.
