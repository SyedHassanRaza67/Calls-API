# db/ — self-hosted Postgres schema

Standard PostgreSQL 16 schema that reproduces the project's former Supabase
database **without** the Supabase `auth`/`storage` schemas and **without RLS**.
Authorization is enforced by the backend, not the database.

## Files (run in this order — the runner sorts them automatically)

| File                  | Purpose |
|-----------------------|---------|
| `001_extensions.sql`  | `pgcrypto` (uuid/random/digest) + `citext` (email column) |
| `002_schema.sql`      | `app_role` enum, `app_users`, the 7 tables, indexes, `update_updated_at_column()` + triggers |
| `003_functions.sql`   | ported SQL functions (`has_role`, `is_admin`, `is_super_admin`, `is_account_paused`, `is_global_paused`, `manages_user`, `get_managing_admin`, `verify_api_key`, `create_api_key`, `purge_old_leads`) |
| `004_views.sql`       | `api_configurations_safe` view (omits `api_key`) |
| `seed.sql`            | one bootstrap `super_admin` (runs last) |
| `migrate.mjs`         | idempotent migration runner (Node + `pg`) |

### What changed vs Supabase
- All columns that referenced `auth.users(id)` now reference **`app_users(id)`**
  (`profiles.user_id`, `profiles.managed_by`, `user_roles.user_id`,
  `api_configurations.created_by`, `api_configurations.assigned_to`,
  `api_keys.user_id`, `transactions.user_id`, `system_settings.updated_by`).
  `leads.user_id` stays a plain `uuid` with **no** FK, matching the original.
- `auth.uid()` inside SQL functions became an explicit `_user_id uuid` argument
  (the backend passes the caller id).
- **No RLS.** Policies, `GRANT`/`REVOKE`, and `authenticated`/`anon` roles are
  not recreated — the backend's authz middleware enforces all access rules.
- `handle_new_user()` trigger is **dropped**; signup (create user → profile →
  default `agent` role) is backend logic.
- `purge_old_leads()` is kept as a function but the `pg_cron` schedule is dropped;
  schedule it from a backend job/cron instead.

## Run migrations locally

Requires Node 18+ and the `pg` package (available in `backend/`, or `npm i pg`).

```bash
export DATABASE_URL="postgres://USER:PASSWORD@localhost:5432/calls_api"
node db/migrate.mjs
```

Re-running is safe: applied files are tracked in a `public._migrations` table and
skipped on the next run.

## Run migrations in Docker

The Postgres container holds the data (named volume `pgdata`). Run the runner
from a container that has Node + `pg` and can reach Postgres on the compose
network. Example one-off against the compose `db` service:

```bash
# from the repo root, after `docker compose up -d db`
docker compose run --rm \
  -e DATABASE_URL="postgres://postgres:postgres@db:5432/calls_api" \
  backend node db/migrate.mjs
```

Or bake it into the backend container's startup (run `node db/migrate.mjs`
before `node dist/index.js`). Because the runner is idempotent, running it on
every boot is fine.

## Change the seed admin password

The seed inserts `admin@calls-api.local` with a **throwaway placeholder bcrypt
hash** (its plaintext is intentionally undocumented — do not rely on it). Set a
real password one of two ways:

1. **Before first migrate** — edit `seed.sql` and replace the `password_hash`
   value with a fresh bcrypt hash:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YourNewPassword', 10))"
   ```
   Paste the output into `seed.sql`, then run the migrations.

2. **After first boot (preferred)** — log in as the seed admin and change the
   password through the app, or have an admin endpoint reset it. The hash is
   produced by the backend's bcrypt, never by SQL.

> The seed uses a fixed UUID (`d0000000-0000-4000-8000-000000000001`) and
> `ON CONFLICT DO NOTHING`, so editing the hash and re-running will **not**
> update an already-seeded row — change the password via the app instead, or
> delete the row first if you really want to re-seed.

## Authorization note
This schema deliberately contains **no** row-level security. Every access rule
from the old RLS policies (role hierarchy, managed-agent scoping, the
`api_key` masking, public `global_pause` read, paused-account checks) is
enforced in the backend. The SQL helper functions in `003_functions.sql` exist
so the backend can reuse the same logic if it chooses.
