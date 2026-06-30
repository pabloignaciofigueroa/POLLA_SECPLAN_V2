# Jornada 2026-06-29 — Consolidacion + Supabase cross-device

Sesion larga. Cuatro frentes (todo en POLLA_SECPLAN_V2 / carpeta (41) / Vercel polla-secplan-v2).

## 1. Fix scoring: LONE WOLF en el panel de /tabla
- Sintoma: Tanke con 2:1 (exacto UNICO) sumaba +3 en el panel "PREDICCIONES DE JUGADORES", no +5.
- Causa: `tabla.knockout.client.js` tenia una copia simplificada `matchPts` que daba +3 a cualquier
  exacto y NO recibia las predicciones de los demas (no podia saber si era unico).
- Fix: `matchPts` ahora delega en `scoreKnockoutMatch` (mismo scorer del ranking) y recibe
  `allForMatch` (todas las predicciones del cruce). Una sola fuente de reglas. Commit `e1285a5`.

## 2. Consolidacion de carpetas (el "majame")
- Habia ~12 copias-carpeta en el Desktop + un `site/site/` anidado. Se editaba un arbol y el
  commit/deploy salia de otro.
- Canonica = `clean_v2_alpha_01 - copia (41) LOCAL_AISLADA` (su `site/` es el repo git).
- Rescate ANTES de borrar: `motion-lab/` (estaba solo en copias 42/43), patch del trabajo sin
  commitear de la copia 46 (`_rescatado_46_*.patch`, experimento podio 8/5/3/1 abandonado).
- Se borraron 10 copias redundantes (verificado: sus HEAD eran ancestros de la canonica, sin
  trabajo unico). Se conservo la (48) como `_RESPALDO_hardcopy_2026-06-29` y `oldies` (36GB, historico).
- Quedo UNA carpeta. Regla nueva: no mas copias-carpeta, snapshotear con git.

## 3. Limpieza de codigo muerto era-grupos (61 archivos)
- Componentes huerfanos de 04/07/08/03 (solo los usaba /wireframe), `lib/tabla/*` (0 imports),
  `lib/admin/` (vacio), 15 JSON legacy + mocks, y la pagina dev `/wireframe` + sus componentes.
- Se conservo lo acoplado a tests: `lib/statistics/*`, `lib/liveMatch/*`, `lib/scoring/*`, `lib/predictions/*`.
- Verificado: build 10 paginas + 90 tests. Commit `647101d`.

## 4. Supabase = FUENTE DE VERDAD cross-device (lo del dia)
- Sintoma del usuario: cargaba resultados en /admin en su PC, se veian ahi pero NO en celular /
  incognito. Sentia que "no se grababa".
- Diagnostico real (verificado contra el SQL en vivo y el bundle del deploy):
  - Los datos SI estaban en Supabase (P73/P74/P76). La escritura del admin funcionaba.
  - Vercel SI tiene las env `PUBLIC_SUPABASE_*` (las agrego el usuario). El deploy lee Supabase.
  - El problema era CODIGO: SOLO `/tabla` leia Supabase. `/admin` sembraba el form de localStorage
    (vacio en otro equipo) y `/fixture` `/proximo` `/estadisticas` eran local-only.
- Fix: NUEVO `src/lib/knockout/remoteResults.js` (`attachRemoteResults` = pull + realtime, no-op si
  Supabase off). `/fixture` `/proximo` `/estadisticas` usan los resultados de SQL como `seed.results`.
  `/admin` siembra el form desde SQL al abrir + realtime, respetando ediciones en curso (`dirty`).
  Badge "modo local" -> "sincronizado (sql)". Build 10 + 90 tests. Commit `cd4c770`.
- Verificado por el usuario en incognito y celular: /admin muestra los finalizados, /fixture avanza
  el cuadro. Cross-device OK.
- Pendiente diferido: asignacion de slots a SQL (hoy no se usa: 16avos son equipos concretos).

## INCIDENTE GRAVE (leccion)
- En la consolidacion pushee a `git push origin main` ("por si Vercel usaba ese repo"). `origin` =
  repo VIEJO `polla_secplan_2026` = la pagina de FASE DE GRUPOS (2 meses de trabajo del usuario para
  promocionarse). Casi se la borro. El usuario la recupero el mismo (era fast-forward, restauro con
  `git reset --hard af8650b` + `git push --force origin main`; nada se perdio, pero el susto fue real).
- REGLA DURA establecida: en este proyecto SOLO se toca POLLA_SECPLAN_V2 (remoto `v2`),
  Vercel `polla-secplan-v2`, y la carpeta (41). NUNCA `origin`/`polla_secplan_2026`/`polla-secplan-2026`.
  Push SOLO a `v2`, nunca "a los dos", nunca por inferencia. Ver `gotchas.md` seccion 11 y memoria `hard-rule-allowed-scope`.

## Commits del dia (todos en v2/main)
`e1285a5` fix scoring lone-wolf · `2a8fbde` docs(map) · `647101d` limpieza 61 archivos · `cd4c770` Supabase cross-device.
