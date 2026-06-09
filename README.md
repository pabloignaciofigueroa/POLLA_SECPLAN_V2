# Polla Mundialera SECPLAN 2026

Aplicacion Astro para registrar predicciones del Mundial 2026, seguir el
marcador activo y recalcular la tabla de jugadores en vivo.

## Estado actual

- 10 rutas funcionales con interfaz responsive.
- Predicciones y seleccion de jugador conservadas en el navegador.
- Marcador y resultados oficiales compartidos mediante Supabase.
- `/admin` protegido por login RPC y sesion temporal de dos horas.
- `/tabla` conectada a Supabase Realtime para reflejar cambios sin recargar.
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

La migracion versionada se encuentra en:

```text
supabase/migrations/20260608170000_polla_live_realtime.sql
```

Incluye:

- `polla_live_match`
- `polla_official_results`
- `polla_admin_sessions`
- `polla_admin_config`
- RPC de login, validacion, actualizacion y finalizacion
- RLS de lectura publica y escritura protegida
- publicacion Realtime de marcador y resultados

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
| `/proximo-partido` | Partido relevante |
| `/fixture` | Calendario completo |
| `/equipos` | Album de selecciones |
| `/estadisticas` | Progreso del jugador |
| `/admin` | Control remoto del marcador |

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
