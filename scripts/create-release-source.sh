#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('${project_root}/package.json').version")"
output="${1:-${project_root}/InveStock-release-source-${version}.zip}"
stage_root="$(mktemp -d "${TMPDIR:-/tmp}/investock-release-source.XXXXXXXX")"
stage_project="${stage_root}/InveStock"

cleanup() {
  rm -rf "${stage_root}"
}
trap cleanup EXIT

mkdir -p "${stage_project}"
rsync -a \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'src-tauri/target/' \
  --exclude 'release/' \
  --exclude 'out/' \
  --exclude 'build/' \
  --exclude 'archive/' \
  --exclude 'backups/' \
  --exclude 'recovery-backups/' \
  --exclude 'private-data/' \
  --exclude '*.db' \
  --exclude '*.db-wal' \
  --exclude '*.db-shm' \
  --exclude '*.zip' \
  --exclude '*.xls' \
  --exclude '*.xlsx' \
  --exclude '*nxtgui*' \
  --exclude '*NXTGUI*' \
  --exclude '*customer*seed*' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.key' \
  --exclude '*.pem' \
  --exclude '*.p12' \
  --exclude '*.pfx' \
  "${project_root}/" "${stage_project}/"

mkdir -p "$(dirname "${output}")"
if [[ -e "${output}" ]]; then
  echo "Refusing to overwrite existing archive: ${output}" >&2
  exit 1
fi
(cd "${stage_root}" && zip -qry "${output}" InveStock)
echo "${output}"
