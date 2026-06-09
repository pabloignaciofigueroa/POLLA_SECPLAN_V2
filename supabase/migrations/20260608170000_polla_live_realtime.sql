create extension if not exists pgcrypto;

create table if not exists public.polla_admin_config (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.polla_admin_sessions (
  token uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.polla_live_match (
  id text primary key check (id = 'current'),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.polla_official_results (
  match_id text primary key,
  match_number integer not null check (match_number > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.polla_admin_config enable row level security;
alter table public.polla_admin_sessions enable row level security;
alter table public.polla_live_match enable row level security;
alter table public.polla_official_results enable row level security;

revoke all on public.polla_admin_config from anon, authenticated;
revoke all on public.polla_admin_sessions from anon, authenticated;
revoke insert, update, delete on public.polla_live_match from anon, authenticated;
revoke insert, update, delete on public.polla_official_results from anon, authenticated;
grant select on public.polla_live_match to anon, authenticated;
grant select on public.polla_official_results to anon, authenticated;

drop policy if exists "Public can read live match" on public.polla_live_match;
create policy "Public can read live match"
on public.polla_live_match
for select
to anon, authenticated
using (true);

drop policy if exists "Public can read official results" on public.polla_official_results;
create policy "Public can read official results"
on public.polla_official_results
for select
to anon, authenticated
using (true);

insert into public.polla_admin_config (id, password_hash)
values (
  1,
  '$2a$12$oYOdH2V3ksEv1HeF3FtPWO2iD7mJezumAaAjA05NKbHntdcbE.jai'
)
on conflict (id) do nothing;

create or replace function public.polla_assert_admin(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_token is null or not exists (
    select 1
    from public.polla_admin_sessions
    where token = p_token
      and expires_at > now()
  ) then
    raise exception 'invalid_or_expired_admin_session' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.polla_assert_admin(uuid) from public, anon, authenticated;

create or replace function public.polla_admin_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
  v_token uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '2 hours';
begin
  select password_hash
  into v_hash
  from public.polla_admin_config
  where id = 1;

  if v_hash is null or crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    raise exception 'invalid_admin_password' using errcode = 'P0001';
  end if;

  delete from public.polla_admin_sessions where expires_at <= now();

  insert into public.polla_admin_sessions (token, expires_at)
  values (v_token, v_expires_at);

  return jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.polla_admin_session_is_valid(p_token uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.polla_admin_sessions
    where token = p_token
      and expires_at > now()
  );
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
declare
  v_payload jsonb;
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

  v_payload := p_payload || jsonb_build_object('updatedAt', v_now);

  insert into public.polla_live_match (id, payload, updated_at)
  values ('current', v_payload, v_now)
  on conflict (id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at;

  return v_payload;
end;
$$;

create or replace function public.polla_save_official_result(
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
  v_match_number integer;
  v_now timestamptz := now();
begin
  perform public.polla_assert_admin(p_token);

  if jsonb_typeof(p_payload) <> 'object'
    or nullif(p_payload ->> 'matchId', '') is null
    or coalesce(p_payload ->> 'matchNumber', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_payload ->> 'homeTeamScore', '') !~ '^[0-9]+$'
    or coalesce(p_payload ->> 'awayTeamScore', '') !~ '^[0-9]+$'
  then
    raise exception 'invalid_official_result_payload' using errcode = '22023';
  end if;

  v_match_id := p_payload ->> 'matchId';
  v_match_number := (p_payload ->> 'matchNumber')::integer;
  v_payload := p_payload || jsonb_build_object('finishedAt', v_now);

  insert into public.polla_official_results (
    match_id,
    match_number,
    payload,
    updated_at
  )
  values (
    v_match_id,
    v_match_number,
    v_payload,
    v_now
  )
  on conflict (match_id) do update
  set match_number = excluded.match_number,
      payload = excluded.payload,
      updated_at = excluded.updated_at;

  return v_payload;
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
  v_next_live := public.polla_save_live_match(p_token, p_next_live);

  return jsonb_build_object(
    'result', v_result,
    'liveMatch', v_next_live
  );
end;
$$;

revoke all on function public.polla_admin_login(text) from public;
revoke all on function public.polla_admin_session_is_valid(uuid) from public;
revoke all on function public.polla_save_live_match(uuid, jsonb) from public;
revoke all on function public.polla_save_official_result(uuid, jsonb) from public;
revoke all on function public.polla_finalize_match(uuid, jsonb, jsonb) from public;

grant execute on function public.polla_admin_login(text) to anon, authenticated;
grant execute on function public.polla_admin_session_is_valid(uuid) to anon, authenticated;
grant execute on function public.polla_save_live_match(uuid, jsonb) to anon, authenticated;
grant execute on function public.polla_save_official_result(uuid, jsonb) to anon, authenticated;
grant execute on function public.polla_finalize_match(uuid, jsonb, jsonb) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polla_live_match'
  ) then
    alter publication supabase_realtime add table public.polla_live_match;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polla_official_results'
  ) then
    alter publication supabase_realtime add table public.polla_official_results;
  end if;
end;
$$;
