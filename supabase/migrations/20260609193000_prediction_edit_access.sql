create table if not exists public.polla_prediction_edit_codes (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.polla_prediction_edit_sessions (
  token uuid primary key default gen_random_uuid(),
  player_id text not null,
  source_code_id uuid not null references public.polla_prediction_edit_codes(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists polla_prediction_edit_codes_player_idx
  on public.polla_prediction_edit_codes (player_id, expires_at desc);

create index if not exists polla_prediction_edit_sessions_player_idx
  on public.polla_prediction_edit_sessions (player_id, expires_at desc);

alter table public.polla_prediction_edit_codes enable row level security;
alter table public.polla_prediction_edit_sessions enable row level security;

revoke all on public.polla_prediction_edit_codes from anon, authenticated;
revoke all on public.polla_prediction_edit_sessions from anon, authenticated;

create or replace function public.polla_create_prediction_edit_code(
  p_token uuid,
  p_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_expires_at timestamptz := now() + interval '30 minutes';
  v_index integer;
begin
  perform public.polla_assert_admin(p_token);

  if nullif(trim(p_player_id), '') is null then
    raise exception 'invalid_player_id' using errcode = '22023';
  end if;

  update public.polla_prediction_edit_codes
  set revoked_at = now()
  where player_id = p_player_id
    and redeemed_at is null
    and revoked_at is null
    and expires_at > now();

  update public.polla_prediction_edit_sessions
  set revoked_at = now()
  where player_id = p_player_id
    and revoked_at is null
    and expires_at > now();

  for v_index in 1..8 loop
    v_code := v_code || substr(
      v_alphabet,
      (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)) + 1,
      1
    );
  end loop;

  insert into public.polla_prediction_edit_codes (
    player_id,
    code_hash,
    expires_at
  )
  values (
    p_player_id,
    encode(digest(v_code, 'sha256'), 'hex'),
    v_expires_at
  );

  return jsonb_build_object(
    'playerId', p_player_id,
    'code', v_code,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.polla_redeem_prediction_edit_code(
  p_player_id text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_code_id uuid;
  v_token uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '2 hours';
begin
  if nullif(trim(p_player_id), '') is null
    or coalesce(trim(p_code), '') !~ '^[A-Za-z0-9]{8}$'
  then
    raise exception 'invalid_or_expired_edit_code' using errcode = 'P0001';
  end if;

  select id
  into v_code_id
  from public.polla_prediction_edit_codes
  where player_id = p_player_id
    and code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
    and redeemed_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if v_code_id is null then
    raise exception 'invalid_or_expired_edit_code' using errcode = 'P0001';
  end if;

  update public.polla_prediction_edit_codes
  set redeemed_at = now()
  where id = v_code_id;

  insert into public.polla_prediction_edit_sessions (
    token,
    player_id,
    source_code_id,
    expires_at
  )
  values (
    v_token,
    p_player_id,
    v_code_id,
    v_expires_at
  );

  return jsonb_build_object(
    'token', v_token,
    'playerId', p_player_id,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.polla_prediction_edit_session_is_valid(
  p_player_id text,
  p_token uuid
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.polla_prediction_edit_sessions
    where token = p_token
      and player_id = p_player_id
      and revoked_at is null
      and expires_at > now()
  );
$$;

create or replace function public.polla_revoke_prediction_edit_access(
  p_token uuid,
  p_player_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codes integer := 0;
  v_sessions integer := 0;
begin
  perform public.polla_assert_admin(p_token);

  update public.polla_prediction_edit_codes
  set revoked_at = now()
  where player_id = p_player_id
    and revoked_at is null
    and expires_at > now();
  get diagnostics v_codes = row_count;

  update public.polla_prediction_edit_sessions
  set revoked_at = now()
  where player_id = p_player_id
    and revoked_at is null
    and expires_at > now();
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'playerId', p_player_id,
    'revokedCodes', v_codes,
    'revokedSessions', v_sessions
  );
end;
$$;

create or replace function public.polla_list_prediction_edit_access(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.polla_assert_admin(p_token);

  return jsonb_build_object(
    'codes',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', player_id,
        'expiresAt', expires_at
      ) order by expires_at desc)
      from public.polla_prediction_edit_codes
      where redeemed_at is null
        and revoked_at is null
        and expires_at > now()
    ), '[]'::jsonb),
    'sessions',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', player_id,
        'expiresAt', expires_at
      ) order by expires_at desc)
      from public.polla_prediction_edit_sessions
      where revoked_at is null
        and expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.polla_create_prediction_edit_code(uuid, text) from public;
revoke all on function public.polla_redeem_prediction_edit_code(text, text) from public;
revoke all on function public.polla_prediction_edit_session_is_valid(text, uuid) from public;
revoke all on function public.polla_revoke_prediction_edit_access(uuid, text) from public;
revoke all on function public.polla_list_prediction_edit_access(uuid) from public;

grant execute on function public.polla_create_prediction_edit_code(uuid, text) to anon, authenticated;
grant execute on function public.polla_redeem_prediction_edit_code(text, text) to anon, authenticated;
grant execute on function public.polla_prediction_edit_session_is_valid(text, uuid) to anon, authenticated;
grant execute on function public.polla_revoke_prediction_edit_access(uuid, text) to anon, authenticated;
grant execute on function public.polla_list_prediction_edit_access(uuid) to anon, authenticated;
