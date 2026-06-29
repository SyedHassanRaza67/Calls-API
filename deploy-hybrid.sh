#!/usr/bin/env sh
# deploy-hybrid.sh — one-command HYBRID deploy for the calls-api stack on the VPS.
#
# Hybrid model (how calls-api actually runs in production):
#   - Backend + Postgres run in Docker as the `db` + `backend` compose services.
#   - The SPA is built here and published as STATIC files to a system-nginx webroot
#     (default /var/www/callsapi). The compose `frontend` service is NOT started.
#
# This script deliberately does NOT run `docker compose up` for ALL services
# (that is what deploy.sh does — full-compose — which is wrong for this box).
#
# Flow:
#   backup DB -> git pull -> rebuild+restart db/backend (runs migrations on boot)
#   -> verify the latest migration applied (HARD GATE) -> build SPA
#   -> atomically publish to the webroot (with a timestamped backup for rollback).
#
# Usage (from the repo root on the VPS):
#   ./deploy-hybrid.sh
#
# Optional overrides:
#   WEBROOT=/var/www/callsapi   # where system nginx serves the SPA from
#   NODE_IMAGE=node:20-alpine   # image used to build the SPA
#   REQUIRED_MIGRATION=006_company_domain.sql   # migration the new backend needs
#
# Requires: git, Docker Engine + the Compose v2 plugin, write access to WEBROOT.

set -eu
# pipefail is not POSIX; enable it only when the shell supports it.
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

PROJECT="calls-api"
WEBROOT="${WEBROOT:-/var/www/callsapi}"
NODE_IMAGE="${NODE_IMAGE:-node:20-alpine}"
REQUIRED_MIGRATION="${REQUIRED_MIGRATION:-006_company_domain.sql}"

ts()  { date +%Y%m%d_%H%M%S; }
log() { echo "==> $*"; }

# Move to the directory this script lives in (repo root).
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

log "calls-api HYBRID deploy (project=$PROJECT, webroot=$WEBROOT)"

# 1. Preconditions ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found on PATH." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: the Docker Compose v2 plugin is required." >&2; exit 1; }
[ -f .env ] || { echo "ERROR: root .env not found (secrets). See DEPLOY.md." >&2; exit 1; }
[ -d "$WEBROOT" ] || { echo "ERROR: webroot '$WEBROOT' does not exist (set WEBROOT=...)." >&2; exit 1; }

# 2. Back up the database BEFORE migrating (best-effort: needs the db container up).
if [ -x ./backup.sh ]; then
  log "backing up database (./backup.sh)"
  ./backup.sh || echo "WARN: backup.sh failed (continuing). Ensure the db container is running." >&2
else
  echo "WARN: ./backup.sh not found/executable; skipping DB backup." >&2
fi

# 3. Pull latest code -------------------------------------------------------
if [ -d .git ]; then
  log "git pull --ff-only"
  git pull --ff-only
else
  log "no .git directory; skipping git pull"
fi

# 4. Rebuild + (re)start ONLY db + backend.
#    The backend image bakes in db/, so its start command runs db/migrate.mjs
#    (idempotent) before the server boots — converging the schema on every deploy.
log "docker compose up -d --build db backend"
docker compose -p "$PROJECT" up -d --build --remove-orphans db backend

# 5. Show recent backend logs (migration output).
log "recent backend logs (look for: apply $REQUIRED_MIGRATION ... ok)"
sleep 3
docker compose -p "$PROJECT" logs --tail=40 backend || true

# 6. HARD GATE: confirm the migration the new backend code depends on is applied.
#    If it isn't, the backend is serving against a stale schema — do NOT publish
#    the SPA; stop so the operator can inspect the logs.
DBUSER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | tail -n1 | cut -d= -f2)"; [ -n "${DBUSER:-}" ] || DBUSER="calls"
DBNAME="$(grep -E '^POSTGRES_DB='   .env 2>/dev/null | tail -n1 | cut -d= -f2)"; [ -n "${DBNAME:-}" ] || DBNAME="calls_api"

log "verifying migration '$REQUIRED_MIGRATION' is applied"
ok=0; i=1
while [ "$i" -le 10 ]; do
  if docker compose -p "$PROJECT" exec -T db psql -U "$DBUSER" -d "$DBNAME" -tA \
       -c "select 1 from public._migrations where filename='$REQUIRED_MIGRATION' limit 1;" 2>/dev/null \
       | grep -q 1; then
    ok=1; break
  fi
  sleep 2; i=$((i + 1))
done
if [ "$ok" -ne 1 ]; then
  echo "ERROR: migration '$REQUIRED_MIGRATION' is not applied — the backend may have failed to start." >&2
  echo "       Inspect: docker compose -p $PROJECT logs --tail=80 backend" >&2
  echo "       Aborting BEFORE publishing the SPA (no webroot changes were made)." >&2
  exit 1
fi
log "migration '$REQUIRED_MIGRATION' confirmed applied."

# 7. Build the SPA (same-origin: VITE_API_URL empty) in a throwaway node container.
#    Note: this populates a root-owned node_modules/ in the repo on the VPS — harmless.
log "building SPA with $NODE_IMAGE (VITE_API_URL empty => same-origin /api)"
docker run --rm -e VITE_API_URL= -v "$PWD":/app -w /app "$NODE_IMAGE" \
  sh -lc "npm ci && npm run build"
[ -f dist/index.html ] || { echo "ERROR: SPA build produced no dist/index.html; aborting publish." >&2; exit 1; }

# 8. Publish dist/ -> webroot, keeping a timestamped backup for rollback.
BAK="${WEBROOT%/}.bak-$(ts)"
log "backing up current webroot -> $BAK"
cp -a "$WEBROOT" "$BAK"
log "publishing new SPA to $WEBROOT"
rm -rf "${WEBROOT:?}"/*
cp -a dist/. "$WEBROOT"/

log "Done. Backend rebuilt + migrated; SPA published to $WEBROOT."
echo ""
echo "    Verify:   curl -fsS https://callsapi.codebean.io/api/ >/dev/null && echo API-OK"
echo "    Logs:     docker compose -p $PROJECT logs -f backend"
echo "    Rollback SPA:  rm -rf $WEBROOT/* && cp -a $BAK/. $WEBROOT/"
