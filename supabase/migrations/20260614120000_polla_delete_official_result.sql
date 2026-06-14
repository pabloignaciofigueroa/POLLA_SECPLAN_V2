-- ============================================================================
-- Des-finalizar un partido: borrar un resultado oficial (recuperacion ante error)
-- ============================================================================
-- Si el admin oficializa un partido por equivocacion no tenia como revertirlo.
-- Esta RPC permite borrar la fila de polla_official_results para ese partido,
-- dejandolo nuevamente como "pendiente". Los puntos no se almacenan: tabla,
-- grafico y estadisticas se recalculan solos desde predicciones + resultados.
--
-- Depende de public.polla_assert_admin (migracion 20260608170000).

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
