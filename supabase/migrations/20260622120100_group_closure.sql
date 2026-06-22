-- Cierre de grupo idempotente (DEFINICION SIMULTANEA, F5b).
-- Una fila por grupo A..L. Es lo UNICO nuevo que se PERSISTE: el libro contable de
-- partidos y de clasificados se DERIVA. Lectura publica (RLS); escritura solo por RPC
-- security definer con sesion admin (mismo patron que polla_live_realtime).

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

-- Cierre validado por Admin: upsert idempotente, version + 1 en cada (re)cierre.
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

-- Reapertura: invalida la definitiva (conserva 1o/2o como referencia), version + 1.
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
