#!/usr/bin/env bash
# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only
# Restore a backup made by backup-db.sh into an EMPTY database, then check it.
#
#   TARGET_DATABASE_URL='postgresql://...' ./scripts/restore-db.sh galdus-20261127T120000Z.dump[.gpg]
#
# Never point TARGET_DATABASE_URL at the live database: restore into a new Supabase project or a
# local Postgres with pgvector, check it, then switch DATABASE_URL on the API (docs/OPERATIONS.md).
set -euo pipefail
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (an empty database)}"
FILE="${1:?Usage: restore-db.sh <backup file>}"
URL="${TARGET_DATABASE_URL/postgresql+asyncpg:/postgresql:}"
URL="${URL/ssl=require/sslmode=require}"
if [[ "$FILE" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE to decrypt}"
  PLAIN="$(mktemp)"; trap 'rm -f "$PLAIN"' EXIT
  gpg --batch --yes --decrypt --passphrase-fd 3 --output "$PLAIN" "$FILE" 3<<<"$BACKUP_PASSPHRASE"
  FILE="$PLAIN"
fi
EXISTING=$(psql "$URL" -Atc "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'users'")
if [ "$EXISTING" != "0" ]; then echo "The target database already has Galdus tables: refusing to overwrite." >&2; exit 1; fi
psql "$URL" -v ON_ERROR_STOP=1 -qc "create extension if not exists vector"
# Every entry except "CREATE SCHEMA public", which exists in any new database.
LIST="$(mktemp)"; trap 'rm -f "$LIST" "${PLAIN:-}"' EXIT
pg_restore --list "$FILE" | grep -v ' SCHEMA - public ' > "$LIST"
pg_restore --dbname="$URL" --no-owner --no-privileges --exit-on-error --use-list="$LIST" "$FILE"
echo "Restored. Checks:"
psql "$URL" -Atc "select 'migration ' || version_num from alembic_version"
psql "$URL" -Atc "select 'users ' || count(*) from users"
psql "$URL" -Atc "select 'workspaces ' || count(*) from organizations"
psql "$URL" -Atc "select 'tables without RLS: ' || count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
