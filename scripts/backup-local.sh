#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.staging}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mf-tea}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi
if [[ "$BACKUP_DIR" != /* ]]; then
  echo "BACKUP_DIR must be an absolute path" >&2
  exit 1
fi
BACKUP_DIR="$(realpath -m -- "$BACKUP_DIR")"
if [[ "$BACKUP_DIR" == "/" || "$BACKUP_DIR" == "$PROJECT_DIR" || "$BACKUP_DIR" == "$PROJECT_DIR/"* ]]; then
  echo "BACKUP_DIR must be a dedicated directory outside the project" >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! command -v flock >/dev/null 2>&1; then
  echo "This script requires docker compose and flock (util-linux)" >&2
  exit 1
fi

umask 077
mkdir -p -- "$BACKUP_DIR"
chmod 700 -- "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  echo "Another backup is already running" >&2
  exit 1
fi

timestamp="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
temporary_dir="$BACKUP_DIR/.mf-tea-$timestamp.partial"
final_dir="$BACKUP_DIR/mf-tea-$timestamp"
mkdir -m 700 -- "$temporary_dir"
cleanup() { rm -rf -- "$temporary_dir"; }
trap cleanup EXIT

compose=(docker compose --env-file "$ENV_FILE" --project-directory "$PROJECT_DIR" -f "$PROJECT_DIR/compose.yaml")

echo "Dumping PostgreSQL database..."
"${compose[@]}" exec -T db sh -ec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$temporary_dir/database.dump"

echo "Archiving uploaded tea photos..."
"${compose[@]}" exec -T app sh -ec 'tar -czf - -C /app/public/uploads/teas .' \
  > "$temporary_dir/tea-uploads.tar.gz"

(
  cd -- "$temporary_dir"
  sha256sum database.dump tea-uploads.tar.gz > SHA256SUMS
)

printf 'Created at (UTC): %s\n' "$timestamp" > "$temporary_dir/INFO.txt"
mv -- "$temporary_dir" "$final_dir"
trap - EXIT

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
  -name 'mf-tea-20??-??-??T??-??-??Z' -mtime "+$((RETENTION_DAYS - 1))" \
  -exec rm -rf -- {} +

echo "Backup completed: $final_dir"
du -sh -- "$final_dir"
