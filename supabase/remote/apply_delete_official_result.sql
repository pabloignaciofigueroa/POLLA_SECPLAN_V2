-- ============================================================================
-- APLICAR EN SUPABASE: RPC para des-finalizar (borrar) un resultado oficial
-- ============================================================================
-- Proyecto: vsyamgdslgeinbxwofnu (Polla Mundialera SECPLAN 2026)
--
-- POR QUE: el admin necesita poder revertir un partido oficializado por error
-- (volverlo a "pendiente"). No existia RPC de borrado; solo upsert. Sin esto,
-- el boton "Des-finalizar" del panel de avance de partidos no funciona en remoto.
--
-- COMO APLICAR (1 minuto):
--   1. Abrir https://supabase.com/dashboard -> proyecto -> SQL Editor.
--   2. Pegar este archivo COMPLETO y presionar RUN.
--   3. Listo. Es idempotente: re-ejecutarlo no rompe nada.
--
-- Requiere: rol owner del SQL Editor (el default del dashboard).
-- Depende de: public.polla_assert_admin (migracion 20260608170000, ya aplicada).
--
-- VERIFICAR luego (REST con anon key, debe responder sin token valido con error
-- de sesion, lo que confirma que la funcion existe):
--   curl -s -X POST \
--     'https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/rpc/polla_delete_official_result' \
--     -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
--     -d '{"p_token":"00000000-0000-0000-0000-000000000000","p_match_id":"x"}'
-- ============================================================================

create or replace function public.polla_delete_official_result(
  p_token uuid,
  p_match_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.polla_assert_admin(p_token);

  if nullif(p_match_id, '') is null then
    raise exception 'invalid_match_id' using errcode = '22023';
  end if;

  delete from public.polla_official_results
  where match_id = p_match_id;
end;
$$;

revoke all on function public.polla_delete_official_result(uuid, text) from public;
grant execute on function public.polla_delete_official_result(uuid, text) to anon, authenticated;
