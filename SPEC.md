# calls-api — Migration Spec (Supabase/Lovable → self-hosted)

## Goal
Remove all Lovable/Supabase dependencies and run the entire stack as self-contained,
portable Docker containers on the user's own VPS. Moving servers = `git pull` +
`docker compose up -d --build`. No third-party backend. Free, self-hosted Postgres.

## Decisions (locked)
- **Database**: self-hosted Postgres in a Docker container (named volume `pgdata`).
- **Data**: start fresh (no migration of old Supabase data). Seed one super_admin.
- **AI help-chat**: DISABLED (remove Lovable AI gateway dependency; stub the widget).
- **Backend**: Node.js + Express + TypeScript. DB access via `pg` (node-postgres).
- **Auth**: own JWT auth (bcrypt password hashing) replacing Supabase Auth.
- **Authorization**: enforced in the backend (replaces Postgres RLS).
- **Git**: fresh clean history; origin repointed to
  `https://github.com/SyedHassanRaza67/Calls-API`.
- **Deploy flow**: local dev → push to GitHub → `git pull` on VPS → compose up.

## Repository layout (target)
The existing Vite frontend STAYS AT THE REPO ROOT (minimal churn). New folders added:

```
calls-api/                     # repo root = frontend (Vite/React/TS)
├── src/ ...                    # frontend source (rewired off supabase)
├── index.html, vite.config.ts, package.json, tailwind.config.ts, ...
├── backend/                    # NEW — Node + Express + TS API
│   ├── package.json, tsconfig.json, Dockerfile, .env.example
│   └── src/
│       ├── index.ts            # express app + route mounting
│       ├── config.ts           # env loading
│       ├── db.ts               # pg Pool
│       ├── middleware/         # auth, error, requireRole
│       ├── lib/                # jwt, password, authz helpers, ssrf guard
│       └── routes/             # one module per resource + integrations/
├── db/                         # NEW — schema + migrations + seed
│   ├── 001_schema.sql ...      # tables, enum, indexes
│   ├── 0xx_functions.sql       # SQL functions ported off auth.* schema
│   ├── seed.sql                # super_admin bootstrap
│   ├── migrate.(sh|mjs)        # idempotent migration runner
│   └── README.md
├── docker-compose.yml          # postgres + backend + frontend(nginx)
├── Dockerfile.frontend         # build Vite, serve via nginx
├── nginx.conf                  # serve SPA + proxy /api → backend
├── deploy.sh                   # VPS one-command deploy
├── .env / .env.example         # frontend env (VITE_API_URL)
├── SPEC.md  (this file)
└── API_CONTRACT.md
```

## Current → target mapping
| Current (Supabase/Lovable) | Target |
|---|---|
| `@supabase/supabase-js` client | `src/lib/api.ts` REST client (fetch + JWT) |
| `supabase.auth.*` | `POST /api/auth/*`, JWT in localStorage |
| `supabase.from('t').select()...` | REST endpoints under `/api` (server enforces authz) |
| `supabase.rpc('fn')` | dedicated endpoints / SQL functions kept in `db/` |
| `supabase.functions.invoke('f')` | `POST /api/...` routes (see contract) |
| RLS policies | backend authz middleware/helpers (`lib/authz.ts`) |
| Supabase Auth users (`auth.users`) | `app_users` table (id uuid, email, password_hash) |
| Lovable AI gateway (`api-help-chat`) | removed / stubbed |
| `lovable-tagger`, `.lovable/`, README | removed / rebranded to calls-api |

## Database (7 tables, 1 enum, view, functions)
Authoritative current shape is in `src/integrations/supabase/types.ts` and
`supabase/migrations/*.sql`. Tables: `profiles`, `user_roles`, `api_configurations`,
`api_keys`, `leads`, `transactions`, `system_settings`. Enum `app_role`
= (`super_admin`,`admin`,`agent`). View `api_configurations_safe` (omits `api_key`).

KEY CHANGE: Supabase stores users in `auth.users` and `profiles.user_id` →
`auth.users.id`. Self-hosted has no `auth` schema, so add an `app_users` table:
`app_users(id uuid pk default gen_random_uuid(), email citext unique, password_hash text,
created_at timestamptz)`. `profiles.user_id`, `user_roles.user_id`, etc. reference
`app_users.id`. The signup trigger `handle_new_user` becomes backend logic
(create app_user → profile → default role `agent`, NOT `admin` — see `.lovable/plan.md`
fix A). The first/seed user is `super_admin`.

SQL functions to keep (translate `auth.uid()` → function arg, drop SECURITY DEFINER on
auth schema): `has_role`, `is_admin`, `is_super_admin`, `is_account_paused`,
`is_global_paused`, `manages_user`, `get_managing_admin`, `create_api_key`,
`verify_api_key`, `purge_old_leads`, `update_updated_at_column`. These may be implemented
as SQL functions OR as backend TypeScript — backend is the source of truth for authz.

## Authorization rules (replicating RLS — read migrations for exact policies)
- Roles: `super_admin` > `admin` > `agent`.
- `agent` is managed by an admin via `profiles.managed_by` (admin's user_id).
- `api_configurations` visible to: owner (`assigned_to`), assigned agents
  (`assigned_agents` array contains user_id), and the managing admin/super_admin.
  Non-owners must NOT receive the `api_key` field (use the `_safe` projection).
- `leads`/`transactions`: a user sees their own; an admin sees their managed agents';
  super_admin sees all.
- `system_settings.global_pause` is readable publicly (anon) for the global pause banner.
  Writable only by super_admin.
- Paused accounts: `is_account_paused` true → frontend shows PausedAccountScreen.

## Out of scope / removed
- `supabase/` directory is replaced by `backend/` + `db/`. Keep it until the backend
  fully ports the 8 functions, then it is deleted by the integration step.
- `api-help-chat` (Lovable AI) — removed. `ChatWidget` is stubbed/hidden.

## Security
- No secrets in git. `.env` is gitignored; `.env.example` documents vars.
- `proxy-request` keeps its SSRF host-blocklist.
- Passwords: bcrypt (cost ≥ 10). JWT signed with `JWT_SECRET` (env), ~7d expiry.
- API keys: stored hashed (`api_keys.api_key_hash` + `key_prefix`), shown in full once.
