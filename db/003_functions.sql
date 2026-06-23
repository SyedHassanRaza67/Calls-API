-- =============================================================================
-- 003_functions.sql — SQL functions ported off the Supabase `auth` schema.
-- =============================================================================
-- Changes vs the original Supabase definitions:
--   * Every `auth.uid()` is replaced by an explicit `_user_id uuid` argument.
--     The backend passes the authenticated caller's id.
--   * SECURITY DEFINER and `authenticated`/`anon` GRANT/REVOKE machinery is
--     dropped — there is no RLS here; the backend enforces authorization and
--     connects as the schema owner.
--   * `update_updated_at_column()` lives in 002_schema.sql (its triggers need it).
--
-- DROPPED ON PURPOSE:
--   * handle_new_user() + the on_auth_user_created trigger are NOT recreated.
--     Signup (create app_user -> profile -> default 'agent' role) is now backend
--     logic; there is no auth.users table to trigger off of.
--   * The pg_cron schedule for purge_old_leads is dropped; run purge_old_leads()
--     from a backend cron/job instead. The function itself is kept below.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- has_role(_user_id, _role) -> boolean
-- ---------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- ---------------------------------------------------------------------------
-- is_super_admin(_user_id) -> boolean
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin(_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = 'super_admin'::public.app_role
  )
$$;

-- ---------------------------------------------------------------------------
-- is_admin(_user_id) -> boolean   (true for admin AND super_admin)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role in ('super_admin'::public.app_role, 'admin'::public.app_role)
  )
$$;

-- ---------------------------------------------------------------------------
-- manages_user(_manager_id, _user_id) -> boolean
-- True when _user_id's profile.managed_by = _manager_id.
-- ---------------------------------------------------------------------------
create or replace function public.manages_user(_manager_id uuid, _user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = _user_id
      and managed_by = _manager_id
  )
$$;

-- ---------------------------------------------------------------------------
-- get_managing_admin(_user_id) -> uuid  (the admin who manages this user)
-- ---------------------------------------------------------------------------
create or replace function public.get_managing_admin(_user_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select managed_by
  from public.profiles
  where user_id = _user_id
$$;

-- ---------------------------------------------------------------------------
-- is_global_paused() -> boolean
-- Reads system_settings.global_pause -> setting_value->>'enabled'.
-- ---------------------------------------------------------------------------
create or replace function public.is_global_paused()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select (setting_value->>'enabled')::boolean
     from public.system_settings
     where setting_key = 'global_pause'
     limit 1),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- is_account_paused(_user_id) -> boolean
-- True if: global pause is on and the user is NOT a super admin, OR the user's
-- own profile is paused, OR the user's managing admin's profile is paused.
-- ---------------------------------------------------------------------------
create or replace function public.is_account_paused(_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    (public.is_global_paused() and not public.is_super_admin(_user_id))
    or exists (
      select 1 from public.profiles p
      where p.user_id = _user_id and p.is_paused = true
    )
    or exists (
      select 1
      from public.profiles self
      join public.profiles mgr on mgr.user_id = self.managed_by
      where self.user_id = _user_id and mgr.is_paused = true
    );
$$;

-- ---------------------------------------------------------------------------
-- verify_api_key(provided_key, user_id_param) -> boolean
-- Hashes the provided key (SHA-256, hex) and compares to the user's active key.
-- ---------------------------------------------------------------------------
create or replace function public.verify_api_key(provided_key text, user_id_param uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  stored_hash   text;
  provided_hash text;
begin
  select api_key_hash into stored_hash
  from public.api_keys
  where user_id = user_id_param
    and is_active = true
  limit 1;

  if stored_hash is null then
    return false;
  end if;

  provided_hash := encode(digest(provided_key, 'sha256'), 'hex');

  return stored_hash = provided_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_api_key(key_name_param, user_id_param) -> (api_key, key_id)
-- Generates a random 'sk_live_...' key, stores only its SHA-256 hash + a
-- 12-char prefix, and returns the plaintext key ONCE.
-- ---------------------------------------------------------------------------
create or replace function public.create_api_key(key_name_param text, user_id_param uuid)
returns table(api_key text, key_id uuid)
language plpgsql
set search_path = public
as $$
declare
  new_key        text;
  new_key_hash   text;
  new_key_prefix text;
  new_key_id     uuid;
begin
  -- Generate a secure random key, URL-safe.
  new_key := 'sk_live_' || encode(gen_random_bytes(24), 'base64');
  new_key := replace(new_key, '/', '_');
  new_key := replace(new_key, '+', '-');
  new_key := replace(new_key, '=', '');

  new_key_hash   := encode(digest(new_key, 'sha256'), 'hex');
  new_key_prefix := concat(left(new_key, 12), '...');

  insert into public.api_keys (user_id, key_name, api_key_hash, key_prefix)
  values (user_id_param, key_name_param, new_key_hash, new_key_prefix)
  returning id into new_key_id;

  return query select new_key as api_key, new_key_id as key_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_old_leads() -> void   (delete leads older than 30 days)
-- Originally run daily via pg_cron. Schedule this from the backend instead.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_leads()
returns void
language sql
set search_path = public
as $$
  delete from public.leads where created_at < now() - interval '30 days';
$$;
