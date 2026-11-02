-- =============================================================================
-- 012_security_sessions.sql — login sessions + login history (Security Logs)
-- =============================================================================
-- Every sign-in now creates a user_sessions row whose id travels inside the JWT
-- (`sid` claim). The auth middleware rejects tokens whose session was revoked
-- and stamps last_seen_at / last_ip, so admins can see where their accounts are
-- logged in right now. There is deliberately NO cap on sessions per user — one
-- agent login is commonly shared by dozens of PCs.
--
-- login_events records every sign-in attempt (success and failure) and is
-- pruned after 90 days by the backend.
-- =============================================================================

create table if not exists public.user_sessions (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.app_users(id) on delete cascade,
  ip                text,
  last_ip           text,
  user_agent        text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  revoked_at        timestamptz,
  revoked_by        uuid        references public.app_users(id) on delete set null,
  revoke_reason     text,
  -- Set only for sessions adopted from a token issued before sessions existed;
  -- sha256 of that token, so each pre-existing browser maps to one session.
  legacy_token_hash text        unique
);

create index if not exists idx_user_sessions_user_active
  on public.user_sessions (user_id, last_seen_at desc)
  where revoked_at is null;

create table if not exists public.login_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references public.app_users(id) on delete cascade,
  email       text,
  ip          text,
  user_agent  text,
  success     boolean     not null,
  reason      text,
  session_id  uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_login_events_user_created
  on public.login_events (user_id, created_at desc);
create index if not exists idx_login_events_created
  on public.login_events (created_at desc);
