# Supabase — Polla ELIMINATORIAS (runbook)

La web es **100% local por defecto**. Supabase es **opcional y se activa por env**:
sin variables, todo sigue leyendo los JSON commiteados; con variables, la web lee
de Supabase en vivo y el script de carga escribe los cartones a la base.

## 1. Crear el proyecto

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. **Settings → API**, anotar:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `publishable` (o `anon`) → `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (lectura, se expone al browser)
   - `secret` (o `service_role`) → `SUPABASE_SECRET_KEY` (**SECRETO**, solo para el script; nunca PUBLIC_, nunca commit)

## 2. Crear el esquema

En **SQL Editor** de Supabase, pegar y correr:

```
supabase/migrations/0001_knockout_polla.sql
```

Crea las tablas `players`, `knockout_predictions`, `knockout_podium`,
`knockout_results`, activa RLS (lectura pública, escritura solo service_role) y
suma las tablas a Realtime. Es idempotente: se puede re-correr.

## 3. Configurar variables

```bash
cp .env.example .env.local   # y completar con tus keys
```

`.env.local` está gitignoreado. **Nunca** commitear la `service_role` key.

## 4. Cargar datos (jugadores + resultados + cartones)

1. Dejar los `.json` que mandan los jugadores en una carpeta (default `../cartones`).
2. Correr:

```bash
npm run supabase:sync             # sincroniza jugadores, resultados y cartones
npm run supabase:sync -- --dry-run   # ver qué haría, sin escribir
```

El script es idempotente (UPSERT por PK): re-corré cuando lleguen cartones nuevos.
Flags: `--dir=<carpeta>`, `--no-players`, `--no-results`, `--no-cartones`.

## 5. La web lee de Supabase

Con `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` seteadas (local en
`.env.local`, en deploy como env del hosting p.ej. Vercel), `/tabla` lee los
cartones y resultados desde Supabase y se actualiza en vivo (Realtime). Si fallan
o no están, cae automáticamente al dataset local. El resto de secciones se irán
conectando igual.

## Seguridad

- La `anon` key solo puede **leer** (RLS). Las escrituras requieren la
  `service_role` key, que vive solo en el entorno del script de carga.
- La `service_role` key jamás se expone al browser ni se commitea.
