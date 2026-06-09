#!/bin/bash
# Furniture CRM — database backup script
# Run manually or add to cron: 0 3 * * * /path/to/CRM/backup.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$DIR/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
FILE="$BACKUP_DIR/db_$DATE.json"

mkdir -p "$BACKUP_DIR"
cp "$DIR/data/db.json" "$FILE"
echo "✅ Backup saved: $FILE"

# Keep only the last 30 backups
ls -t "$BACKUP_DIR"/db_*.json 2>/dev/null | tail -n +31 | xargs -r rm
echo "🧹 Old backups pruned (keeping 30)"
