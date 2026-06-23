-- =============================================================================
-- 002_schema.sql — self-hosted Postgres schema (no Supabase auth/storage/RLS)
-- =============================================================================
-- This reproduces the FINAL state of the Supabase migrations, with one key
-- change: Supabase's `auth.users` table does not exist here. All columns that
-- referenced `auth.users(id)` now reference our own `app_users(id)`.
--
-- Authorization (formerly Postgres RLS) is enforced entirely in the backend.
-- No RLS policies, GRANT/REVOKE, or `authenticated`/`anon` roles are recreated.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum: app_role
-- Original migrations created ('admin','agent') then ALTER TYPE ADD 'super_admin'.
-- Final set of values (order is purely cosmetic):
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'admin', 'agent');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- app_users — replaces Supabase `auth.users`.
-- Holds login credentials; everything that pointed at auth.users(id) now FKs here.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id            uuid        primary key default gen_random_uuid(),
  email         citext      unique not null,
  password_hash text        not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles
--   user_id  -> app_users(id)  (was auth.users, ON DELETE CASCADE, UNIQUE)
--   managed_by -> app_users(id) (was auth.users, ON DELETE SET NULL)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null unique references public.app_users(id) on delete cascade,
  full_name     text,
  email         text,
  phone         text,
  company       text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  managed_by    uuid        references public.app_users(id) on delete set null,
  is_paused     boolean     not null default false,
  paused_at     timestamptz,
  paused_reason text
);

-- Case-insensitive email uniqueness guard (from migration 20260424210428).
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- user_roles
--   user_id -> app_users(id) (was auth.users, ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------------------------------------------------------------------------
-- api_configurations
--   created_by  -> app_users(id) (was auth.users, no ON DELETE rule originally)
--   assigned_to -> app_users(id) (was auth.users, ON DELETE SET NULL)
--   assigned_agents uuid[] holds app_users(id) values (no FK — array, matches original)
-- ---------------------------------------------------------------------------
create table if not exists public.api_configurations (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null,
  api_type             text        not null default 'retreaver',
  api_key              text,                       -- nullable since 20260121185105
  publisher_id         text        default '',     -- NOT NULL dropped + default '' (20260224173649)
  is_active            boolean     default true,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  created_by           uuid        references public.app_users(id),
  assigned_to          uuid        references public.app_users(id) on delete set null,
  api_mode             text        not null default 'rtb'
                         check (api_mode in ('rtb', 'ping-post', 'ping')),
  ping_url             text,
  post_url             text,
  api_provider         text        not null default 'retreaver'
                         check (api_provider in ('retreaver', 'trackdrive', 'ringba', 'custom', 'quotewizard')),
  trackdrive_number_id text,
  trackdrive_number    text,
  http_method          text        default 'POST'
                         check (http_method in ('GET', 'POST')),
  notes                text        default null,
  custom_fields        jsonb       default null,
  assigned_agents      uuid[]      not null default '{}',
  buyer                text,
  ping_id_source_key   text,
  ping_id_post_field   text
);

comment on column public.api_configurations.trackdrive_number is
  'The Trackdrive inbound forwarding phone number (e.g., 18441231234) required for webhooks using caller number forwarding';

-- ---------------------------------------------------------------------------
-- api_keys
--   user_id -> app_users(id) (was auth.users, ON DELETE CASCADE)
--   Plaintext api_key column was dropped (20260120151527); only hash + prefix remain.
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.app_users(id) on delete cascade,
  key_name     text        not null,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  api_key_hash text        not null,
  key_prefix   text        not null
);

-- ---------------------------------------------------------------------------
-- leads
--   user_id holds an app_users(id). Original table declared it `uuid NOT NULL`
--   WITHOUT an explicit FK to auth.users, so we keep it as a plain uuid column
--   (no FK) to match the original exactly.
--   api_configuration_id -> api_configurations(id).
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null,
  caller_number        text        not null,
  caller_state         text        not null,
  caller_zip           text        not null,
  returned_did         text,
  api_response         jsonb,
  status               text        not null default 'pending',
  created_at           timestamptz not null default now(),
  api_configuration_id uuid        references public.api_configurations(id),
  ping_response        jsonb,
  external_lead_id     text,
  submission_stage     text        not null default 'complete'
                         check (submission_stage in ('pending', 'ping', 'posted', 'complete'))
);

create index if not exists idx_leads_user_id   on public.leads (user_id);
create index if not exists idx_leads_created_at on public.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- transactions
--   user_id -> app_users(id) (was auth.users, ON DELETE CASCADE)
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.app_users(id) on delete cascade,
  api_type      text        not null,
  endpoint      text        not null,
  status        text        not null default 'success',
  credits_used  integer     not null default 1,
  request_data  jsonb,
  response_data jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- system_settings
--   updated_by -> app_users(id) (was auth.users, no ON DELETE rule originally)
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  id            uuid        primary key default gen_random_uuid(),
  setting_key   text        not null unique,
  setting_value jsonb       not null,
  description   text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid        references public.app_users(id)
);

-- ---------------------------------------------------------------------------
-- update_updated_at_column() — trigger function. Defined here (not in
-- 003_functions.sql) because the triggers below depend on it and each
-- migration file runs in its own transaction.
-- ---------------------------------------------------------------------------
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers.
-- These tables had update_updated_at_column triggers in the original schema:
--   profiles, system_settings, api_configurations.
-- ---------------------------------------------------------------------------
drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_system_settings_updated_at on public.system_settings;
create trigger update_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_api_configurations_updated_at on public.api_configurations;
create trigger update_api_configurations_updated_at
  before update on public.api_configurations
  for each row execute function public.update_updated_at_column();
