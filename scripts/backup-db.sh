#!/usr/bin/env bash
# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only
# Back up the Galdus.ai database (application schema "public") to a compressed, encrypted file.
#
#   DATABASE_URL='postgresql://...' ./scripts/backup-db.sh [output-directory]
#
# DATABASE_URL may use the API's form (postgresql+asyncpg://...); the driver suffix is removed.
# Use Supabase's *session* pooler or direct connection (not the transaction pooler on port 6543).
# The dump is encrypted with a passphrase (gpg, AES-256) when BACKUP_PASSPHRASE is set: do that for
# anything leaving your computer. Keep ENCRYPTION_KEY with the backup: without it, stored provider
# keys, MFA secrets and drive tokens in the dump cannot be read.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL}"
OUT_DIR="${1:-.}"
URL="${DATABASE_URL/postgresql+asyncpg:/postgresql:}"
URL="${URL/ssl=require/sslmode=require}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/galdus-$STAMP.dump"
mkdir -p "$OUT_DIR"
pg_dump "$URL" --schema=public --format=custom --no-owner --no-privileges --compress=9 --file="$FILE"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-fd 3 --output "$FILE.gpg" "$FILE" 3<<<"$BACKUP_PASSPHRASE"
  rm -f "$FILE"
  FILE="$FILE.gpg"
fi
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
