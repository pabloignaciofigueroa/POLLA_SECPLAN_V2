-- ============================================================================
-- APLICAR EN SUPABASE: generalizar polla_live_match a MULTI-FILA por match_id
-- ============================================================================
-- Proyecto: vsyamgdslgeinbxwofnu (Polla Mundialera SECPLAN 2026)
--
-- POR QUE: polla_live_match es singleton (id text primary key check (id='current')):
-- solo cabe UN partido vivo. DEFINICION SIMULTANEA juega 2 partidos del mismo grupo a
-- la vez. Esto lo vuelve multi-fila por match_id. Backward-compatible: 1 vivo = N=1.
--
-- PELIGRO (corre contra la tabla viva). HACERLO BIEN:
--   1. Aplicar en una ventana SIN partido vivo (no a mitad de jornada).
--   2. Este script HACE BACKUP (polla_live_match_backup_20260622) antes de tocar nada.
--   3. El backfill ABORTA (no borra) si alguna fila quedaria sin match_id.
--   4. ENSAYO recomendado primero: pegar TODO el bloque SQL de abajo entre
--        begin;
--        ... (todo el script) ...
--        rollback;
--      y confirmar que corre sin error; luego re-ejecutar de verdad (sin rollback).
--   5. Es idempotente: re-ejecutarlo no rompe nada.
--
-- Requiere: rol owner del SQL Editor. Depende de public.polla_assert_admin
-- (migracion 20260608170000, ya aplicada).
--
-- VERIFICAR luego (REST con anon key; debe responder error de SESION, no de schema):
--   curl -s -X POST \
--     'https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/rpc/polla_set_live_score' \
--     -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
--     -d '{"p_token":"00000000-0000-0000-0000-000000000000","p_payload":{"matchId":"x","homeTeamScore":"0","awayTeamScore":"0"}}'
--   -> {"code":"P0001","message":"invalid_or_expired_admin_session"}  (NO PGRST202)
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'polla_live_match'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'polla_live_match_backup_20260622'
  ) then
    execute 'create table public.polla_live_match_backup_20260622 as select * from public.polla_live_match';
  end if;
end$$;

alter table public.polla_live_match add column if not exists match_id text;
update public.polla_live_match set match_id = payload ->> 'matchId' where match_id is null;

do $$
begin
  if exists (select 1 from public.polla_live_match where match_id is null) then
    raise exception
      'polla_live_match_multi abortado: % fila(s) sin matchId derivable. No se borro nada; limpiar manualmente y reintentar.',
      (select count(*) from public.polla_live_match where match_id is null)
      using errcode = 'P0001';
  end if;
end$$;

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.polla_live_match'::regclass and contype = 'c'
  loop
    execute format('alter table public.polla_live_match drop constraint %I', r.conname);
  end loop;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.polla_live_match'::regclass and contype = 'p'
  ) and not exists (
    select 1
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.polla_live_match'::regclass and i.indisprimary and a.attname = 'match_id'
  ) then
    execute (
      select format('alter table public.polla_live_match drop constraint %I', conname)
      from pg_constraint
      where conrelid = 'public.polla_live_match'::regclass and contype = 'p'
      limit 1
    );
  end if;
end$$;

alter table public.polla_live_match alter column match_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.polla_live_match'::regclass and contype = 'p'
  ) then
    alter table public.polla_live_match add constraint polla_live_match_pkey primary key (match_id);
  end if;
end$$;

alter table public.polla_live_match replica identity full;

create or replace function public.polla_set_live_score(
  p_token uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_match_id text;
  v_now timestamptz := now();
begin
  perform public.polla_assert_admin(p_token);

  if jsonb_typeof(p_payload) <> 'object'
    or nullif(p_payload ->> 'matchId', '') is null
    or coalesce(p_payload ->> 'homeTeamScore', '') !~ '^[0-9]+$'
    or coalesce(p_payload ->> 'awayTeamScore', '') !~ '^[0-9]+$'
  then
    raise exception 'invalid_live_match_payload' using errcode = '22023';
  end if;

  v_match_id := p_payload ->> 'matchId';
  v_payload := p_payload || jsonb_build_object('updatedAt', v_now);

  insert into public.polla_live_match (match_id, payload, updated_at)
  values (v_match_id, v_payload, v_now)
  on conflict (match_id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at;

  return v_payload;
end;
$$;

create or replace function public.polla_clear_live_score(
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
  delete from public.polla_live_match where match_id = p_match_id;
end;
$$;

create or replace function public.polla_save_live_match(
  p_token uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.polla_set_live_score(p_token, p_payload);
end;
$$;

create or replace function public.polla_finalize_match(
  p_token uuid,
  p_result jsonb,
  p_next_live jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_next_live jsonb;
begin
  perform public.polla_assert_admin(p_token);
  v_result := public.polla_save_official_result(p_token, p_result);

  if nullif(p_result ->> 'matchId', '') is not null then
    delete from public.polla_live_match where match_id = p_result ->> 'matchId';
  end if;

  if p_next_live is not null
    and jsonb_typeof(p_next_live) = 'object'
    and nullif(p_next_live ->> 'matchId', '') is not null
  then
    v_next_live := public.polla_set_live_score(p_token, p_next_live);
  end if;

  return jsonb_build_object('result', v_result, 'liveMatch', v_next_live);
end;
$$;

revoke all on function public.polla_set_live_score(uuid, jsonb) from public;
revoke all on function public.polla_clear_live_score(uuid, text) from public;
grant execute on function public.polla_set_live_score(uuid, jsonb) to anon, authenticated;
grant execute on function public.polla_clear_live_score(uuid, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polla_live_match'
  ) then
    alter publication supabase_realtime add table public.polla_live_match;
  end if;
end$$;

notify pgrst, 'reload schema';
