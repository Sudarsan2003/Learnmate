#!/usr/bin/env bash
# Restore a LearnMate backup made by backup-db.sh.
#
#   ops/backup/restore-db.sh <backup file> <target database URL> [--replace]
#
# The target is a libpq URL (postgresql://user:pass@host:5432/dbname). It must
# already exist and have the pgvector extension available.
#
# Without --replace the target must be empty, so a typo can't wipe a live
# database. With --replace, existing LearnMate tables in the target are
# dropped and replaced by the backup. Always try a restore into a spare
# database first, then point the app at it or restore over the real one.
#
# Encrypted backups (*.enc) need BACKUP_PASSPHRASE set to the same passphrase.

set -euo pipefail

log() { printf '[restore] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

[[ $# -ge 2 ]] || fail "Usage: $0 <backup file> <target database URL> [--replace]"
file="$1"
target="$2"
replace="${3:-}"
[[ -f "$file" ]] || fail "No such file: $file"
command -v pg_restore >/dev/null || fail "pg_restore not found. Install the PostgreSQL client tools."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

dump="$file"
if [[ "$file" == *.enc ]]; then
  [[ -n "${BACKUP_PASSPHRASE:-}" ]] || fail "This backup is encrypted; set BACKUP_PASSPHRASE."
  dump="$work/backup.dump"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$dump" \
    || fail "Could not decrypt. Is BACKUP_PASSPHRASE the one used for this backup?"
fi
pg_restore --list "$dump" >/dev/null || fail "This file is not a readable LearnMate backup."

existing="$(psql "$target" -Atc "select count(*) from information_schema.tables where table_schema = 'public'")" \
  || fail "Could not connect to the target database."
if [[ "$existing" != "0" && "$replace" != "--replace" ]]; then
  fail "The target already has $existing tables. Restore into an empty database, or add --replace to overwrite it."
fi

log "Restoring $(basename "$file")..."
args=(--no-owner --no-privileges --exit-on-error --single-transaction --dbname="$target")
[[ "$replace" == "--replace" ]] && args+=(--clean --if-exists)
pg_restore "${args[@]}" "$dump"

users="$(psql "$target" -Atc "select count(*) from users" 2>/dev/null || echo "?")"
log "Done. The restored database has $users user accounts."
