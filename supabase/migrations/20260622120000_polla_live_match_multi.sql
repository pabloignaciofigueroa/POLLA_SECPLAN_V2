-- Generaliza polla_live_match de SINGLETON (id='current') a MULTI-FILA por match_id.
-- Permite >=2 partidos vivos a la vez (DEFINICION SIMULTANEA). Backward-compatible:
-- 1 partido vivo = N=1 (el flujo diario sigue igual). Aditivo y re-ejecutable.
--
-- SEGURIDAD (addendum A1): corre contra la tabla viva. Aplicar en ventana SIN partido
-- vivo. Hace BACKUP, BACKFILL defensivo que ABORTA (no borra) si alguna fila quedaria
-- sin match_id, swap de PK idempotente y REPLICA IDENTITY FULL. Ensayar antes dentro de
-- `begin; ... rollback;` (ver supabase/remote/apply_polla_live_match_multi.sql).

-- 1) Backup de la tabla viva (idempotente).
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

-- 2) Columna match_id + backfill desde el payload.
alter table public.polla_live_match add column if not exists match_id text;
update public.polla_live_match set match_id = payload ->> 'matchId' where match_id is null;

-- 3) ABORTA (no borra) si alguna fila quedaria huerfana sin match_id.
do $$
begin
  if exists (select 1 from public.polla_live_match where match_id is null) then
    raise exception
      'polla_live_match_multi abortado: % fila(s) sin matchId derivable. No se borro nada; limpiar manualmente y reintentar.',
      (select count(*) from public.polla_live_match where match_id is null)
      using errcode = 'P0001';
  end if;
end$$;

-- 4) Soltar el check singleton (id='current') y mover el PK a match_id (idempotente).
do $$
declare
  r record;
begin
  -- El unico check de esta tabla es id='current'; lo soltamos para permitir multi-fila.
  for r in
    select conname from pg_constraint
    where conrelid = 'public.polla_live_match'::regclass and contype = 'c'
  loop
    execute format('alter table public.polla_live_match drop constraint %I', r.conname);
  end loop;

  -- Soltar el PK existente solo si no esta ya sobre match_id.
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

-- Fix 2026-06-24 (aplicado en remoto via hotfix; aqui para repo == DB): la PK vieja era `id`;
-- al dropear la PK, Postgres NO le quita el NOT NULL a `id`, y la RPC inserta sin `id` (columna
-- ya vestigial). Sin esto, la 2a/N-esima fila multi (INSERT nuevo por match_id, sin on-conflict)
-- viola el NOT NULL: 'null value in column "id" ... violates not-null constraint'. Idempotente.
alter table public.polla_live_match alter column id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.polla_live_match'::regclass and contype = 'p'
  ) then
    alter table public.polla_live_match add constraint polla_live_match_pkey primary key (match_id);
  end if;
end$$;

-- 5) Realtime: REPLICA IDENTITY FULL para emitir el old-row completo en UPDATE/DELETE
--    (los clientes necesitan el match_id viejo para quitar la fila al limpiar un live).
alter table public.polla_live_match replica identity full;

-- 6) RPC: upsert de un marcador vivo por match_id (valida admin + scores enteros).
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

-- 7) RPC: limpiar (borrar) el marcador vivo de un partido (al finalizar en una ventana).
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

-- 8) polla_save_live_match: ahora WRAPPER fino sobre set_live_score (deriva match_id del
--    payload). El flujo diario (un vivo) sigue funcionando byte-igual.
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

-- 9) polla_finalize_match: tras escribir el oficial, LIMPIA la fila live de ese partido
--    y (si viene) setea el siguiente. Mantiene "avanzar al siguiente" para N=1.
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

  -- limpiar el live del partido recien finalizado (ya no es vivo).
  if nullif(p_result ->> 'matchId', '') is not null then
    delete from public.polla_live_match where match_id = p_result ->> 'matchId';
  end if;

  if p_next_live is not null
    and jsonb_typeof(p_next_live) = 'object'
    and nullif(p_next_live ->> 'matchId', '') is not null
  then
    v_next_live := public.polla_set_live_score(p_token, p_next_live);
  end if;

  return jsonb_build_object(
    'result', v_result,
    'liveMatch', v_next_live
  );
end;
$$;

revoke all on function public.polla_set_live_score(uuid, jsonb) from public;
revoke all on function public.polla_clear_live_score(uuid, text) from public;
grant execute on function public.polla_set_live_score(uuid, jsonb) to anon, authenticated;
grant execute on function public.polla_clear_live_score(uuid, text) to anon, authenticated;

-- 10) Confirmar que la tabla sigue en la publicacion Realtime (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polla_live_match'
  ) then
    alter publication supabase_realtime add table public.polla_live_match;
  end if;
end$$;
