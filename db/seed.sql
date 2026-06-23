-- =============================================================================
-- seed.sql — bootstrap the first super_admin account.
-- =============================================================================
-- Creates ONE super_admin so you can log in immediately after migrating.
-- Idempotent: re-running does nothing (ON CONFLICT DO NOTHING + fixed UUID).
--
--   email:    admin@calls-api.local
--   password: ChangeMe!2026   <-- TEMPORARY. Change it immediately after first
--             login (or replace the hash below before first boot).
--
-- The password_hash below is a real bcrypt hash (cost 10) of "ChangeMe!2026".
-- It exists only so you can log in once; rotate it right away in production.
--
-- HOW TO GENERATE A NEW BCRYPT HASH:
--   Node (matches the backend's bcrypt):
--     node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"
--   or with the `bcrypt` package:
--     node -e "console.log(require('bcrypt').hashSync('YourNewPassword', 10))"
--   Then paste the result in place of the hash below and re-run, OR (preferred
--   after first boot) change the password through the app / an admin endpoint.
--
-- NOTE: the hash is computed in the backend (bcrypt), NOT in SQL — there is no
-- pgcrypto bcrypt call here, so this seed has no dependency on crypt()/gen_salt().
-- =============================================================================

-- Fixed UUID so the seed is repeatable and FKs line up across the three inserts.
-- (Generated once; keep it stable.)
--   d0000000-0000-4000-8000-000000000001

insert into public.app_users (id, email, password_hash)
values (
  'd0000000-0000-4000-8000-000000000001',
  'admin@calls-api.local',
  -- bcrypt hash (cost 10) of "ChangeMe!2026" — CHANGE THIS PASSWORD after first login.
  '$2a$10$CkGIskgRSIGfobUZMVMojO80Q89QzaYCGaZTEw7Q2VZwryYtvW2Ii'
)
on conflict (id) do nothing;

insert into public.profiles (user_id, email, full_name)
values (
  'd0000000-0000-4000-8000-000000000001',
  'admin@calls-api.local',
  'Super Admin'
)
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
values (
  'd0000000-0000-4000-8000-000000000001',
  'super_admin'
)
on conflict (user_id, role) do nothing;
