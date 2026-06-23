# calls-api — API Contract

The single source of truth shared by the **backend** and **frontend** subagents.
Base path: **`/api`**. In dev the backend listens on **`http://localhost:8080`**
(`VITE_API_URL`). In Docker, nginx proxies `/api` → backend.

## Conventions
- JSON request/response bodies. `Content-Type: application/json`.
- **Auth**: `Authorization: Bearer <JWT>`. Token stored in `localStorage` under key
  **`calls_api_token`**. On `401`, frontend clears token and routes to `/auth`.
- Errors: `{ "error": "human message" }` with appropriate HTTP status
  (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict).
- Timestamps: ISO 8601 strings. IDs: uuid strings.
- All list endpoints enforce authorization server-side (see SPEC authz rules).

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email,password,full_name?}` | `{token, user:{id,email}}` (role defaults to `agent`) |
| POST | `/api/auth/signin` | `{email,password}` | `{token, user:{id,email}}` |
| POST | `/api/auth/signout` | — | `{ok:true}` (stateless; client drops token) |
| GET  | `/api/auth/me` | — | `{user, profile, roles:string[], isPaused, pausedReason, isGlobalPaused, globalPauseReason}` |

`user` = `{ id, email }`. `profile` = full `profiles` row. `roles` = array of `app_role`.

## Profiles
| Method | Path | Notes |
|---|---|---|
| GET | `/api/profiles/me` | current user's profile |
| PATCH | `/api/profiles/me` | `{full_name?,phone?,company?,avatar_url?}` |
| GET | `/api/profiles` | admin: managed agents; super_admin: all (joined with roles) |
| GET | `/api/profiles/:userId` | authz-scoped |
| PATCH | `/api/profiles/:userId` | admin: `{is_paused?,paused_reason?,managed_by?,full_name?,...}` |

## Users / admin (ports of edge functions create-agent, delete-user, reset-user-password)
| Method | Path | Replaces | Notes |
|---|---|---|---|
| GET | `/api/users` | — | list users+roles+profiles (scoped) |
| POST | `/api/users` | `create-agent` | admin only. `{email,password,full_name,role}` → creates app_user+profile+role, `managed_by`=caller |
| DELETE | `/api/users/:userId` | `delete-user` | admin only; cannot delete self/super_admin unless allowed |
| POST | `/api/users/:userId/reset-password` | `reset-user-password` | admin only; `{new_password}` |
| PATCH | `/api/users/:userId/role` | — | super_admin; `{role}` |
| PATCH | `/api/users/:userId/pause` | — | admin; `{is_paused, reason?}` |

> Backend MUST read the original edge functions under `supabase/functions/<name>/index.ts`
> and preserve their exact validation, role checks, and response field names.

## Roles
| GET | `/api/roles?user_id=` | returns `[{role}]` for a user (or embed in /users) |

## API configurations
| Method | Path | Notes |
|---|---|---|
| GET | `/api/api-configurations` | scoped; non-owners get the `_safe` projection (no `api_key`) |
| POST | `/api/api-configurations` | admin; create |
| PATCH | `/api/api-configurations/:id` | owner/admin |
| DELETE | `/api/api-configurations/:id` | owner/admin |

## Leads
| Method | Path | Notes |
|---|---|---|
| GET | `/api/leads?days=&limit=` | scoped to user/managed agents |
| POST | `/api/leads/ping-post` | port of `ping-post-lead` (the large lead flow) |
| POST | `/api/leads/submit` | port of `submit-lead` |

## Transactions
| GET | `/api/transactions?days=&limit=` | scoped |

## API keys
| Method | Path | Replaces | Notes |
|---|---|---|---|
| GET | `/api/api-keys` | — | current user's keys (no secret) |
| POST | `/api/api-keys` | `create_api_key` RPC | returns `{api_key, key_id}` — plaintext shown ONCE |
| DELETE | `/api/api-keys/:id` | — | deactivate/delete |

## System settings
| Method | Path | Notes |
|---|---|---|
| GET | `/api/system-settings/:key` | `global_pause` is PUBLIC (no auth); returns `{setting_key,setting_value}` |
| PUT | `/api/system-settings/:key` | super_admin; `{setting_value}` |

## Integration functions (ports of remaining edge functions)
| Method | Path | Replaces | Notes |
|---|---|---|---|
| POST | `/api/proxy-request` | `proxy-request` | authed; KEEP SSRF host blocklist; generic outbound proxy for the API tester |
| POST | `/api/parse-trackdrive-url` | `parse-trackdrive-url` | authed; parse a TrackDrive URL into fields |
| ~~POST~~ | ~~`/api/api-help-chat`~~ | `api-help-chat` | **REMOVED** (Lovable AI gateway dropped) |

> For every port, read `supabase/functions/<name>/index.ts` and reproduce request body,
> validation, external HTTP calls (Retreaver/Ringba/LeadsPedia/TrackDrive), and response
> shape EXACTLY so the frontend needs no behavioral change. Replace the Supabase
> auth/role checks with the backend JWT middleware + authz helpers. Replace
> `Deno.env.get(...)` with `process.env`. Secrets come from `backend/.env`
> (`RETREAVER_PUBLISHER_ID`, `RETREAVER_RTB_KEY`, plus any Ringba/LeadsPedia/TrackDrive).

## Frontend client contract (`src/lib/api.ts`)
Expose a small typed client so component/hook code changes stay mechanical:
```ts
api.auth.signUp/signIn/signOut/me()
api.get(path), api.post(path, body), api.patch(...), api.del(...)
// attaches Bearer token, throws ApiError on non-2xx, returns parsed JSON
```
`AuthContext` keeps the SAME exported interface (`useAuth()` shape: user, session→null
ok, profile, roles, isSuperAdmin, isAdmin, isAgent, isPaused, signIn, signUp, signOut,
refreshProfile, global pause fields) so consuming components are untouched. Replace the
`onAuthStateChange` machinery with: on mount, if token present → `GET /api/auth/me`;
poll `GET /api/system-settings/global_pause` every 30s.
