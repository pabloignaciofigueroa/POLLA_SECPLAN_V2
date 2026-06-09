# Supabase - marcador global

La aplicacion usa:

- `polla_live_match`: marcador provisional actual.
- `polla_official_results`: resultados finalizados.
- RPC admin con sesiones de dos horas.
- Supabase Realtime para actualizar `/tabla` en todos los navegadores.
- `polla_prediction_edit_codes`: hashes de códigos de corrección de un solo uso.
- `polla_prediction_edit_sessions`: sesiones por jugador, revocables y de dos horas.

## Aplicar la migracion

Opcion recomendada:

1. Abrir el SQL Editor del proyecto `vsyamgdslgeinbxwofnu`.
2. Ejecutar completo:
   `supabase/migrations/20260608170000_polla_live_realtime.sql`.
3. Ejecutar después:
   `supabase/migrations/20260609193000_prediction_edit_access.sql`.
4. Confirmar que las cuatro tablas aparecen en Table Editor.

Opcion CLI, con una sesion Supabase autorizada:

```powershell
npx supabase login
npx supabase link --project-ref vsyamgdslgeinbxwofnu
npx supabase db push
```

## Variables de Vercel

Configurar para Production, Preview y Development:

```text
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
```

Luego disparar un nuevo deployment.

La publishable key puede estar en el bundle del navegador. La proteccion de
escritura vive en las RPC y no existe una policy publica de INSERT/UPDATE.

Los códigos nunca se guardan en texto plano: la base conserva SHA-256 y Admin
muestra el valor canjeable solo al crearlo. Ante un error remoto, Predicciones
mantiene el cartón oficial en modo lectura.
