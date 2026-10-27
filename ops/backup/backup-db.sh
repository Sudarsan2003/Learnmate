#!/usr/bin/env bash
# Daily LearnMate database backup.
#
# Makes a compressed pg_dump of the database, encrypts it (if a passphrase
# is set), checks the file can actually be read back, and deletes backups
# older than BACKUP_KEEP_DAYS. Run it from cron or the GitHub Actions workflow
# in .github/workflows/db-backup.yml. See ops/backup/README.md.
#
# Connection (either one):
#   DATABASE_URL               postgresql://user:pass@host:5432/dbname?sslmode=require
#   SPRING_DATASOURCE_URL      the app's own jdbc:postgresql://... URL, with
#   SPRING_DATASOURCE_USERNAME / SPRING_DATASOURCE_PASSWORD
#
# Options:
#   BACKUP_DIR          where backups go (default ./backups)
#   BACKUP_KEEP_DAYS    delete backups older than this (default 14)
#   BACKUP_PASSPHRASE   encrypt with AES-256; strongly recommended, since the
#                       dump holds every student's details. Keep it somewhere
#                       safe: without it a backup cannot be restored.
#   BACKUP_NAME         label in the file name (default learnmate)
#   BACKUP_RCLONE_REMOTE  optional, e.g. "gdrive:LearnMate-backups"; copies each
#                       new backup there with rclone (Google Drive, S3, ...)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_NAME="${BACKUP_NAME:-learnmate}"

log() { printf '[backup] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

command -v pg_dump >/dev/null || fail "pg_dump not found. Install the PostgreSQL client tools."

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN="$DATABASE_URL"
elif [[ -n "${SPRING_DATASOURCE_URL:-}" ]]; then
  CONN="${SPRING_DATASOURCE_URL#jdbc:}"
  export PGUSER="${SPRING_DATASOURCE_USERNAME:-${PGUSER:-}}"
  export PGPASSWORD="${SPRING_DATASOURCE_PASSWORD:-${PGPASSWORD:-}}"
else
  fail "Set DATABASE_URL (or SPRING_DATASOURCE_URL with its username and password)."
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
dump="$BACKUP_DIR/$BACKUP_NAME-$stamp.dump"
tmp="$dump.partial"
trap 'rm -f "$tmp" "$tmp.enc"' EXIT

log "Dumping database..."
# Custom format: compressed, and pg_restore can restore all of it or single tables.
# --no-owner/--no-privileges so it restores cleanly into a database with different users.
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$tmp" "$CONN"

# A backup that can't be read is worse than none, so check it now.
pg_restore --list "$tmp" >/dev/null || fail "The dump could not be read back; not keeping it."
tables="$(pg_restore --list "$tmp" | grep -c ' TABLE DATA ' || true)"

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  command -v openssl >/dev/null || fail "openssl not found, but BACKUP_PASSPHRASE is set."
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$tmp" -out "$tmp.enc"
  mv "$tmp.enc" "$dump.enc"
  rm -f "$tmp"
  final="$dump.enc"
else
  log "WARNING: BACKUP_PASSPHRASE is not set, so this backup is NOT encrypted."
  mv "$tmp" "$dump"
  final="$dump"
fi
trap - EXIT

size="$(du -h "$final" | cut -f1)"
log "Saved $final ($size, $tables tables with data)."

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || fail "rclone not found, but BACKUP_RCLONE_REMOTE is set."
  rclone copy "$final" "$BACKUP_RCLONE_REMOTE" && log "Copied to $BACKUP_RCLONE_REMOTE."
fi

# Keep the last BACKUP_KEEP_DAYS days of backups made by this script.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "$BACKUP_NAME-*.dump*" -mtime +"$BACKUP_KEEP_DAYS" -print -delete \
  | sed 's/^/[backup] Deleted old backup: /' >&2 || true

echo "$final"
