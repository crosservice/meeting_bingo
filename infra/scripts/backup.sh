#!/usr/bin/env bash
# Meeting Bingo — PostgreSQL backup script
# Run as the meetingbingo user or via cron

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/meeting-bingo}"
BACKUP_DIR="${APP_DIR}/data/backups"
DB_NAME="${DB_NAME:-meeting_bingo}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/meeting_bingo_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting backup of database '${DB_NAME}'..."

# Dump and compress
pg_dump "${DB_NAME}" | gzip > "${BACKUP_FILE}"

# Verify
if [ -s "${BACKUP_FILE}" ]; then
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date -Iseconds)] Backup created: ${BACKUP_FILE} (${SIZE})"
else
    echo "[$(date -Iseconds)] ERROR: Backup file is empty"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Clean up old backups
DELETED=$(find "${BACKUP_DIR}" -name "meeting_bingo_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[$(date -Iseconds)] Removed ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date -Iseconds)] Backup complete"
