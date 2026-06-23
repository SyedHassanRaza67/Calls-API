#!/usr/bin/env sh
# backup.sh — dump the calls-api Postgres database to a timestamped file.
#
# Usage (from the repo root on the VPS):
#   ./backup.sh                 # writes ./backups/calls_api_YYYYmmdd_HHMMSS.sql.gz
#   BACKUP_DIR=/mnt/x ./backup.sh
#
# Restore (see also DEPLOY.md):
#   gunzip -c backups/calls_api_20260623_120000.sql.gz \
#     | docker compose -p calls-api exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# Requires the stack's `db` container to be running.

set -eu
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

PROJECT="calls-api"

cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ ! -f .env ]; then
  echo "ERROR: root .env not found (needed for POSTGRES_USER / POSTGRES_DB)." >&2
  exit 1
fi

# Load DB credentials from .env without leaking them to the log.
# shellcheck disable=SC1091
set -a
. ./.env
set +a

POSTGRES_USER="${POSTGRES_USER:-calls}"
POSTGRES_DB="${POSTGRES_DB:-calls_api}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${POSTGRES_DB}_${STAMP}.sql.gz"

echo "==> Dumping database '$POSTGRES_DB' from the '$PROJECT' db container..."

# pg_dump runs inside the container; we pipe the plain-SQL dump out and gzip it on the host.
docker compose -p "$PROJECT" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip > "$OUT"

echo "==> Wrote $OUT ($(du -h "$OUT" 2>/dev/null | cut -f1))"
echo ""
echo "Restore with:"
echo "  gunzip -c \"$OUT\" | docker compose -p $PROJECT exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB"
