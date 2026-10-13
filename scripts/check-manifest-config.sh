#!/usr/bin/env bash
# Preflight only: never prints credentials, accesses the DB, or uploads.
set -euo pipefail
mode="${MODE:-apply}"
case "$mode" in
  check|apply) ;;
  *) echo "::error::Manifest snapshot mode must be check or apply."; exit 2 ;;
esac
required=(DATABASE_URL)
if [[ "$mode" == "apply" ]]; then
  required+=(R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET)
fi
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing+=("$name"); fi
done
if (( ${#missing[@]} )); then
  echo "skip=true" >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
  message="Manifest snapshots were not published. Missing configuration in manifest-snapshot: ${missing[*]}. Configure Settings > Environments > manifest-snapshot and re-run."
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    echo "$message" >> "$GITHUB_STEP_SUMMARY"
  fi
  if [[ "${GITHUB_EVENT_NAME:-}" == "schedule" ]]; then
    echo "::warning::$message"
    exit 0
  fi
  echo "::error::$message"
  exit 1
fi
echo "skip=false" >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
echo "All required manifest snapshot configuration values are present."
