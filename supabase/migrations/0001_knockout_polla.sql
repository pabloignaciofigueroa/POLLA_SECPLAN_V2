-- ============================================================================
-- Polla Mundialera SECPLAN 2026 — ELIMINATORIAS — esquema base (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- Idempotente: se puede re-ejecutar sin romper nada (IF NOT EXISTS + policies
-- recreadas). Modelo: jugadores + cartones (predicciones por cruce) + podio +
-- resultados oficiales. La WEB lee con la anon key (RLS: SELECT público); el
-- script de carga escribe con la service_role key (bypassa RLS).
-- Correr una vez en el SQL Editor de Supabase (o vía CLI).
-- ============================================================================

-- ---------- JUGADORES (nómina cerrada, espejo de src/data/players.json) ----------
create table if not exists public.players (
  id           text primary key,
  name         text not null,
  avatar       text,
  avatar_thumb text,
  status       text not null default 'available',
  updated_at   timestamptz not null default now()
);

-- ---------- CARTONES: predicción por jugador y por cruce ----------
create table if not exists public.knockout_predictions (
  player_id      text not null references public.players(id) on delete cascade,
  match_id       text not null,                 -- P73..P104
  home_score     integer,
  away_score     integer,
  advances       text check (advances in ('home','away') or advances is null),
  qualified_team text,                          -- code del equipo que el jugador hace avanzar
  locked         boolean not null default false,-- cruce ya jugado (no editable)
  points         integer,                       -- puntos del cruce (si está calculado)
  submitted_at   timestamptz not null default now(),
  primary key (player_id, match_id)
);
create index if not exists knockout_predictions_match_idx
  on public.knockout_predictions (match_id);

-- ---------- PODIO: un registro por jugador ----------
create table if not exists public.knockout_podium (
  player_id    text primary key references public.players(id) on delete cascade,
  champion     text,
  runner_up    text,
  third        text,
  fourth       text,
  submitted_at timestamptz not null default now()
);

-- ---------- RESULTADOS OFICIALES por cruce (los que el server publica) ----------
create table if not exists public.knockout_results (
  match_id   text primary key,                  -- P73..P104
  home_score integer,
  away_score integer,
  winner     text check (winner in ('home','away') or winner is null),
  status     text not null default 'final' check (status in ('live','final')),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- RLS: lectura PÚBLICA (anon + authenticated). Escritura SOLO service_role
-- (que bypassa RLS, así que no necesita policy). Sin policies de write => nadie
-- con anon key puede insertar/editar/borrar.
-- ============================================================================
alter table public.players              enable row level security;
alter table public.knockout_predictions enable row level security;
alter table public.knockout_podium      enable row level security;
alter table public.knockout_results     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','knockout_predictions','knockout_podium','knockout_results']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t
    );
  end loop;
end $$;

-- ============================================================================
-- GRANTS: además de la policy RLS, cada role necesita privilegio de TABLA.
-- anon/authenticated => SELECT (lectura web). service_role => ALL (script de carga).
-- (Idempotente; algunos proyectos no auto-otorgan estos grants al crear la tabla.)
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select on public.players, public.knockout_predictions, public.knockout_podium, public.knockout_results
  to anon, authenticated;
grant all on public.players, public.knockout_predictions, public.knockout_podium, public.knockout_results
  to service_role;

-- ============================================================================
-- Realtime opcional: que la web reciba cambios sin recargar (ranking en vivo).
-- (Si la publicación ya existe, ignora el error.)
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.knockout_predictions;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.knockout_results;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.knockout_podium;
exception when duplicate_object then null; when undefined_object then null;
end $$;
