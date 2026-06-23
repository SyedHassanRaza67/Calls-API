#!/usr/bin/env sh
# deploy.sh — one-command deploy for the calls-api stack on the VPS.
#
# Flow: pull latest code -> build images -> (re)create containers -> prune dangling.
# Isolated under the Compose project name "calls-api" so other stacks are untouched.
#
# Usage (from the repo root on the VPS):
#   ./deploy.sh
#
# Requires: git, Docker Engine with the Compose v2 plugin (`docker compose`).

set -eu
# pipefail is not POSIX; enable it only when the shell supports it (bash/dash differ).
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

PROJECT="calls-api"
WEB_PORT_DEFAULT="8088"
API_PORT_DEFAULT="8080"

# Move to the directory this script lives in (repo root).
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "==> calls-api deploy"

# 1. Preconditions
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: the Docker Compose v2 plugin is required ('docker compose')." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "ERROR: root .env not found. Copy the template from DEPLOY.md and set secrets." >&2
  exit 1
fi

# 2. Pull latest code (skip if not a git checkout, e.g. CI tarball).
if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "==> no .git directory; skipping git pull"
fi

# 3. Build and (re)create containers in the background.
echo "==> docker compose up -d --build"
docker compose -p "$PROJECT" up -d --build --remove-orphans

# 4. Reclaim space from old image layers.
echo "==> pruning dangling images"
docker image prune -f >/dev/null 2>&1 || true

# 5. Report.
# Read the effective ports from .env (fall back to defaults).
WEB_PORT="$(grep -E '^WEB_PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2)"
API_PORT="$(grep -E '^API_PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2)"
[ -n "${WEB_PORT:-}" ] || WEB_PORT="$WEB_PORT_DEFAULT"
[ -n "${API_PORT:-}" ] || API_PORT="$API_PORT_DEFAULT"

echo ""
echo "==> Done. Stack '$PROJECT' is up."
echo "    Frontend (web): http://<this-host>:${WEB_PORT}/"
echo "    API:            http://<this-host>:${API_PORT}/api/"
echo ""
echo "    Logs:    docker compose -p $PROJECT logs -f"
echo "    Status:  docker compose -p $PROJECT ps"
echo "    Stop:    docker compose -p $PROJECT down"
