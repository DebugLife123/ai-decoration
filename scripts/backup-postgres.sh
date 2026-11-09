#!/bin/sh
# 每日 pg_dump：保留最近 7 份日备份 + 每月 1 份月备份。
# 备份目录由 DB_BACKUP_DIR 指定（默认 /backups），会被 compose 挂成命名卷。
set -eu

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-decoration}"
DB_USER="${DB_USER:-decoration}"
BACKUP_DIR="${DB_BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/monthly"

dump_once() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="${BACKUP_DIR}/daily/${DB_NAME}-${stamp}.dump"
  echo "[backup] dumping ${DB_NAME} -> ${target}"
  if pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${target}.partial"; then
    mv "${target}.partial" "${target}"
  else
    echo "[backup] dump failed" >&2
    rm -f "${target}.partial"
    return 1
  fi

  # 每月 1 号额外留一份月备份
  if [ "$(date -u +%d)" = "01" ]; then
    cp "${target}" "${BACKUP_DIR}/monthly/${DB_NAME}-$(date -u +%Y%m).dump"
  fi

  # 只保留最近 7 份日备份
  ls -1t "${BACKUP_DIR}/daily"/*.dump 2>/dev/null | tail -n +8 | while read -r old; do
    echo "[backup] pruning ${old}"
    rm -f "${old}"
  done
}

# 启动先热备一次，避免「刚上线还没到点就没有备份」。
until PGPASSWORD="${PGPASSWORD:-}" pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; do
  echo "[backup] waiting for ${DB_HOST}:${DB_PORT} ..."
  sleep 5
done

dump_once || true

while true; do
  sleep "${INTERVAL_SECONDS}"
  dump_once || echo "[backup] retrying next cycle"
done
