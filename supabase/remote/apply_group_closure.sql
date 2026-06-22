-- ============================================================================
-- APLICAR EN SUPABASE: cierre de grupo idempotente (DEFINICION SIMULTANEA)
-- ============================================================================
-- Proyecto: vsyamgdslgeinbxwofnu (Polla Mundialera SECPLAN 2026)
--
-- POR QUE: para oficializar la clasificacion (1o/2o) de cada grupo hace falta una
-- decision de cierre PERSISTIDA y reversible. Es lo unico nuevo que se guarda; el resto
-- (libro de partidos y de clasificados) se deriva. Sin esto, /tabla y /estadisticas no
-- pueden distinguir "proyectado" de "oficial".
--
-- COMO APLICAR (1 minuto):
--   1. Abrir https://supabase.com/dashboard -> proyecto -> SQL Editor.
--   2. Pegar este archivo COMPLETO y presionar RUN.
--   3. Listo. Es idempotente: re-ejecutarlo no rompe nada.
--
-- Requiere: rol owner del SQL Editor. Depende de public.polla_assert_admin
-- (migracion 20260608170000, ya aplicada).
--
-- VERIFICAR luego (REST con anon key; debe responder error de SESION, no de schema):
--   curl -s -X POST \
--     'https://vsyamgdslgeinbxwofnu.supabase.co/rest/v1/rpc/polla_close_group' \
--     -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
--     -d '{"p_token":"00000000-0000-0000-0000-000000000000","p_group_id":"A","p_first":"x","p_second":"y","p_standings":[]}'
--   -> {"code":"P0001","message":"invalid_or_expired_admin_session"}  (NO PGRST202)
-- ============================================================================

create table if not exists public.polla_group_closure (
  group_id text primary key,
  state text not null default 'pending'
    check (state in ('pending', 'in_definition', 'pending_close', 'final', 'reopened')),
  official_first_team text,
  official_second_team text,
  official_standings jsonb,
  version integer not null default 0,
  closed_at timestamptz,
  closed_by text,
  reopen_reason text,
  updated_at timestamptz not null default now()
);

alter table public.polla_group_closure enable row level security;
revoke insert, update, delete on public.polla_group_closure from anon, authenticated;
grant select on public.polla_group_closure to anon, authenticated;

drop policy if exists "Public can read group closures" on public.polla_group_closure;
create policy "Public can read group closures"
on public.polla_group_closure
for select
to anon, authenticated
using (true);

create or replace function public.polla_close_group(
  p_token uuid,
  p_group_id text,
  p_first text,
  p_second text,
  p_standings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.polla_group_closure;
begin
  perform public.polla_assert_admin(p_token);

  if nullif(trim(p_group_id), '') is null
    or nullif(trim(p_first), '') is null
    or nullif(trim(p_second), '') is null
    or (p_standings is not null and jsonb_typeof(p_standings) <> 'array')
  then
    raise exception 'invalid_group_closure_payload' using errcode = '22023';
  end if;

  insert into public.polla_group_closure (
    group_id, state, official_first_team, official_second_team,
    official_standings, version, closed_at, reopen_reason, updated_at
  )
  values (
    p_group_id, 'final', p_first, p_second,
    p_standings, 1, v_now, null, v_now
  )
  on conflict (group_id) do update
  set state = 'final',
      official_first_team = excluded.official_first_team,
      official_second_team = excluded.official_second_team,
      official_standings = excluded.official_standings,
      version = public.polla_group_closure.version + 1,
      closed_at = v_now,
      reopen_reason = null,
      updated_at = v_now
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.polla_reopen_group(
  p_token uuid,
  p_group_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.polla_group_closure;
begin
  perform public.polla_assert_admin(p_token);

  if nullif(trim(p_group_id), '') is null then
    raise exception 'invalid_group_id' using errcode = '22023';
  end if;

  insert into public.polla_group_closure (group_id, state, version, reopen_reason, updated_at)
  values (p_group_id, 'reopened', 1, nullif(trim(p_reason), ''), v_now)
  on conflict (group_id) do update
  set state = 'reopened',
      version = public.polla_group_closure.version + 1,
      reopen_reason = nullif(trim(p_reason), ''),
      updated_at = v_now
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.polla_close_group(uuid, text, text, text, jsonb) from public;
revoke all on function public.polla_reopen_group(uuid, text, text) from public;
grant execute on function public.polla_close_group(uuid, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.polla_reopen_group(uuid, text, text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'polla_group_closure'
  ) then
    alter publication supabase_realtime add table public.polla_group_closure;
  end if;
end$$;

notify pgrst, 'reload schema';
