# Polla Mundialera SECPLAN 2026

Aplicacion Astro para registrar predicciones del Mundial 2026, seguir el
marcador activo y recalcular la tabla de jugadores en vivo.

## Estado actual

- Competencia en curso con nomina cerrada: 13 jugadores oficiales, 13/13
  cartones, 936 marcadores y 312 posiciones clasificatorias.
- 10 rutas funcionales con interfaz responsive.
- Predicciones y seleccion de jugador conservadas en el navegador.
- Marcador y resultados oficiales compartidos mediante Supabase; los
  resultados oficiales mandan en Fixture, Proximo Partido, Tabla,
  Estadisticas y Admin.
- `/admin` protegido por login RPC y sesion temporal de dos horas; KPI de
  resultados oficiales en vivo y codigos temporales de edicion de cartones.
- `/tabla` conectada a Supabase Realtime: ranking, racha por colores
  (morado +5 Lone Wolf, azul +3 exacto, verde +1 tendencia, gris 0) y panel
  de predicciones se actualizan sin recargar.
- `/fixture` muestra marcadores finales y la tabla real del grupo del
  partido seleccionado.
- `/estadisticas` exige identidad de jugador y su pestana Partidos funciona
  como auditoria de puntaje partido a partido.
- Puntaje oficial: Lone Wolf 5, exacto compartido 3, tendencia 1, error 0.

`localStorage` conserva identidad, predicciones y una cache tolerante a cortes.
No es la fuente compartida del marcador ni de los resultados oficiales.

## Desarrollo local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Variables requeridas:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
```

La publishable key se incluye en el bundle cliente. Las escrituras permanecen
protegidas mediante RLS y funciones RPC; nunca debe usarse una `service_role`
en el frontend.

## Supabase

Las migraciones versionadas se encuentran en:

```text
supabase/migrations/20260608170000_polla_live_realtime.sql
supabase/migrations/20260609193000_prediction_edit_access.sql
```

La primera incluye:

- `polla_live_match`
- `polla_official_results`
- `polla_admin_sessions`
- `polla_admin_config`
- RPC de login, validacion, actualizacion y finalizacion
- RLS de lectura publica y escritura protegida
- publicacion Realtime de marcador y resultados

La segunda crea los codigos temporales de edicion de cartones oficiales
(`polla_prediction_edit_codes/sessions` + sus RPC). Ambas estan aplicadas en
el proyecto remoto (la segunda se aplico el 2026-06-12 con el script
re-ejecutable `supabase/remote/apply_prediction_edit_access.sql`).

El procedimiento de activacion y variables de Vercel esta en
[`supabase/README.md`](supabase/README.md).

## Rutas

| Ruta | Funcion |
| --- | --- |
| `/` | Inicio |
| `/reglas` | Reglas y puntajes |
| `/jugador` | Seleccion de jugador |
| `/predicciones` | Captura y descarga de predicciones |
| `/tabla` | Ranking y marcador compartido |
| `/proximo-partido` | Partido relevante (salta los ya oficializados) |
| `/fixture` | Calendario + resultados oficiales + tabla de grupo |
| `/equipos` | Album de selecciones |
| `/estadisticas` | Data center coral y auditoria de puntaje |
| `/admin` | Control remoto del marcador y resultados oficiales |

## Arquitectura

- `src/sections/`: vistas y componentes por ruta.
- `src/lib/liveMatch/`: contrato compartido, puntaje y suscripcion Realtime.
- `src/lib/supabase/`: cliente unico de Supabase.
- `src/data/`: fixture, jugadores y datos estaticos.
- `supabase/`: migracion y runbook de la base remota.
- `mapa_sitio_trabajo_secciones_final.md`: mapa operativo principal.

## Verificacion

```powershell
npm run build
npm run preview
```

La prueba critica consiste en abrir `/tabla` en un navegador y `/admin` en
otro, actualizar el marcador y confirmar que ambos muestran el mismo estado
sin recargar.
