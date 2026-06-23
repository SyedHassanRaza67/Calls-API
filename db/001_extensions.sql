-- Extensions required by the self-hosted schema.
--
-- pgcrypto:
--   * gen_random_uuid()  -> default UUID primary keys
--   * gen_random_bytes() -> random API-key material in create_api_key()
--   * digest()           -> SHA-256 hashing of API keys (create_api_key/verify_api_key)
-- citext:
--   * case-insensitive email column on app_users
--
-- Postgres 16 ships gen_random_uuid() in core, but pgcrypto is still required
-- for gen_random_bytes()/digest(), so we enable it unconditionally.

create extension if not exists pgcrypto;
create extension if not exists citext;
