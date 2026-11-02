-- =============================================================================
-- 013_password_changed_at.sql — log out old-password devices on password change
-- =============================================================================
-- Changing a password revokes the user's sessions. Tokens minted before
-- sessions existed (no `sid`) have no session row to revoke, so the auth
-- middleware also rejects any such token issued before this timestamp.
-- =============================================================================

alter table public.app_users
  add column if not exists password_changed_at timestamptz;
