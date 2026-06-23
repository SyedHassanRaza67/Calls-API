# calls-api — Deployment Guide

Self-hosted Docker stack: **Postgres + Node/Express backend + nginx-served Vite SPA**.
Designed to run on a shared VPS **without disturbing other projects** already there.

- Compose project name: **`calls-api`**
- Network: **`calls-api-net`** (isolated bridge)
- Volume: **`calls-api-pgdata`** (named, persistent)
- Default host ports: **web `8088`**, **API `8080`**; Postgres is **not** published.

---

## 1. Prerequisites (on the VPS)

- Docker Engine with the Compose v2 plugin (`docker compose version` works).
- `git`.
- Ports `8088` and `8080` free on the host (or pick others — see §6).

---

## 2. First-time deploy

```sh
# 1. Clone
git clone https://github.com/SyedHassanRaza67/Calls-API.git
cd Calls-API

# 2. Create the root .env from the template in §3 and fill in real secrets
nano .env          # paste the block from §3, set JWT_SECRET, POSTGRES_PASSWORD, seed admin

# 3. Deploy (build + start everything, idempotent)
./deploy.sh
```

`deploy.sh` will `git pull`, build the images, start the three services, prune dangling
layers, and print the URLs. When it finishes:

- Frontend: `http://<your-host>:8088/`
- API:      `http://<your-host>:8080/api/`

The first super_admin is seeded from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` by the
backend's migration/seed runner on first start.

---

## 3. Root `.env` template

> The repo ships a `.env.example`; this is the authoritative, ready-to-copy block for the
> **root** compose env. Copy it to `.env` (which is gitignored) and edit the values.
> Never commit `.env`.

```dotenv
# ---- Postgres (db service) ----
POSTGRES_USER=calls
POSTGRES_PASSWORD=CHANGE_ME_to_a_long_random_string
POSTGRES_DB=calls_api

# ---- Backend ----
# 32+ random chars. Generate: openssl rand -hex 32
JWT_SECRET=CHANGE_ME_openssl_rand_hex_32
NODE_ENV=production

# First-run super_admin bootstrap (used once, on an empty DB)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=CHANGE_ME_strong_password

# ---- Host ports (change if these clash with other projects) ----
WEB_PORT=8088          # frontend/nginx -> host
API_PORT=8080          # backend API   -> host

# ---- Frontend build-time API URL ----
# "/api" => same-origin; nginx in the frontend image proxies /api -> backend.
# To hit the backend port directly instead, use: http://YOUR_HOST:8080/api
VITE_API_URL=/api

# ---- Integration secrets (ports of the Supabase edge functions) ----
# Leave blank to disable the corresponding integration.
RETREAVER_PUBLISHER_ID=
RETREAVER_RTB_KEY=
RINGBA_API_TOKEN=
RINGBA_ACCOUNT_ID=
LEADSPEDIA_API_KEY=
LEADSPEDIA_API_SECRET=
TRACKDRIVE_API_KEY=
```

---

## 4. How it stays isolated from other projects

| Concern | What we do |
|---|---|
| Container/name collisions | Compose **project name `calls-api`** (`name:` in compose + `-p calls-api` in scripts). All containers, networks, and the default labels are namespaced under it. |
| Network bleed | A dedicated user-defined bridge **`calls-api-net`**. Services reach each other by name (`db`, `backend`) only on this network; nothing joins the default bridge. |
| Data persistence | Named volume **`calls-api-pgdata`** — survives `down`/redeploys, scoped to this project, won't touch another project's volumes. |
| Port clashes | Only **two** host ports are published (`WEB_PORT`, `API_PORT`), both configurable. **Postgres is never published** by default, so it can't collide with another Postgres on 5432. |

`docker compose -p calls-api down` removes only this stack. Add `-v` to also drop the
`calls-api-pgdata` volume (destroys data).

---

## 5. Database migrations

- **On every start**, the `backend` service runs `node db/migrate.mjs` (idempotent) before
  launching the API, so the schema and seed converge on each deploy. This is the
  authoritative path.
- **As a fallback**, `./db` is mounted at `/docker-entrypoint-initdb.d` in the `db`
  container. Postgres runs those ordered `*.sql` files **only on the very first boot of an
  empty `pgdata` volume**. On later boots they are ignored — so they never re-run
  destructively.

To wipe and rebuild the database from scratch:

```sh
docker compose -p calls-api down -v     # drops the pgdata volume
./deploy.sh                              # re-inits schema + reseeds super_admin
```

---

## 6. Changing ports (if 8088 / 8080 are taken)

Edit the root `.env`:

```dotenv
WEB_PORT=9090
API_PORT=9091
```

If you change `API_PORT` **and** the SPA talks to the backend directly (not same-origin),
also update `VITE_API_URL` to match, then rebuild: `./deploy.sh`. With the default
same-origin setup (`VITE_API_URL=/api`) you only need `WEB_PORT` open publicly — the API
port can stay internal/firewalled since nginx proxies `/api`.

---

## 7. Exposing Postgres on the host (optional)

Postgres is internal-only by default. To reach it from a desktop SQL client, create a
small override file (do **not** edit `docker-compose.yml`):

```yaml
# docker-compose.db-expose.yml
services:
  db:
    ports:
      - "127.0.0.1:55432:5432"   # bind to loopback; use an SSH tunnel to connect
```

```sh
docker compose -p calls-api -f docker-compose.yml -f docker-compose.db-expose.yml up -d
```

Binding to `127.0.0.1` keeps it off the public internet; connect over an SSH tunnel.

---

## 8. Behind an existing reverse proxy (subdomain + TLS)

If the VPS already runs a front nginx / Caddy / Traefik terminating TLS, point a subdomain
at the published `WEB_PORT`. The frontend image already serves the SPA and proxies `/api`,
so the outer proxy just forwards everything to `WEB_PORT`.

**Caddy** (`/etc/caddy/Caddyfile`):

```caddy
calls.example.com {
    reverse_proxy 127.0.0.1:8088
}
```

**nginx** (a server block on the host):

```nginx
server {
    listen 443 ssl;
    server_name calls.example.com;
    # ssl_certificate / ssl_certificate_key via certbot

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Traefik** (labels) — add to the `frontend` service via an override file and join Traefik's
network:

```yaml
services:
  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.calls.rule=Host(`calls.example.com`)"
      - "traefik.http.routers.calls.entrypoints=websecure"
      - "traefik.http.routers.calls.tls.certresolver=le"
      - "traefik.http.services.calls.loadbalancer.server.port=80"
```

In all cases keep `VITE_API_URL=/api` so the SPA and API share the subdomain origin (no
CORS, one cert). You can then firewall the raw `WEB_PORT`/`API_PORT` from the public net.

---

## 9. Update flow

**Locally:** commit and push to GitHub.

```sh
git add -A && git commit -m "..." && git push
```

**On the VPS:**

```sh
cd Calls-API
./deploy.sh          # git pull --ff-only + rebuild + up -d + prune
```

Zero-config: `deploy.sh` reapplies migrations (idempotent) and only rebuilds changed
layers. Data in `calls-api-pgdata` is preserved.

---

## 10. Backups

```sh
./backup.sh          # -> ./backups/calls_api_YYYYmmdd_HHMMSS.sql.gz
```

Restore a dump:

```sh
gunzip -c backups/calls_api_20260623_120000.sql.gz \
  | docker compose -p calls-api exec -T db psql -U calls -d calls_api
```

Automate daily backups with cron on the VPS:

```cron
0 3 * * *  cd /path/to/Calls-API && ./backup.sh >> /var/log/calls-api-backup.log 2>&1
```

---

## 11. Common operations

```sh
docker compose -p calls-api ps            # status
docker compose -p calls-api logs -f       # tail all logs
docker compose -p calls-api logs -f backend
docker compose -p calls-api restart backend
docker compose -p calls-api down          # stop (keeps data)
docker compose -p calls-api down -v       # stop AND delete the database volume
```
