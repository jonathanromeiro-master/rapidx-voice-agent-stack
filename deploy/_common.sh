#!/usr/bin/env bash
# Shared helpers. Sourced by every deploy script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] || { echo "No .env found. Copy .env.example to .env and fill it in."; exit 1; }
set -a; . "$ROOT/.env"; set +a

: "${VPS_IP:?VPS_IP is required in .env}"
SSH_KEY="${SSH_KEY/#\~/$HOME}"
SSH_USER="${SSH_USER:-ubuntu}"
DOGRAH_HOST="${DOGRAH_HOST:-$(echo "$VPS_IP" | tr '.' '-').sslip.io}"
BASE="https://$DOGRAH_HOST"

rsh() { ssh -o ConnectTimeout=15 -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SSH_USER@$VPS_IP" "$@"; }

api_container() { rsh "sudo -n docker ps --format '{{.Names}}' | grep dograh-api | head -1"; }
pg_container()  { rsh "sudo -n docker ps --format '{{.Names}}' | grep dograh-postgres | head -1"; }

# Logs in locally and echoes a bearer token. Keeping credentials off the VPS
# command line avoids leaking them through remote process listings.
dograh_token() {
  local out body status tok
  body=$(python3 - <<PY
import json
import os
print(json.dumps({"email": os.environ["DOGRAH_EMAIL"], "password": os.environ["DOGRAH_PASSWORD"]}))
PY
)
  out=$(curl -ksS -L -X POST "$BASE/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d "$body" -w $'\n%{http_code}')
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  tok=$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token") or d.get("token") or "")' 2>/dev/null || true)
  [ -n "$tok" ] || { echo "Login failed with HTTP status $status" >&2; exit 1; }
  printf '%s' "$tok"
}

# api GET|POST|PUT <path> [json-body]
api() {
  local method="$1" path="$2" body="${3:-}" tok="${TOK:-}"
  [ -n "$tok" ] || tok=$(dograh_token)
  if [ -n "$body" ]; then
    curl -ksS -L -X "$method" "$BASE$path" -H "Authorization: Bearer $tok" \
      -H 'Content-Type: application/json' -d "$body"
  else
    curl -ksS -L -X "$method" "$BASE$path" -H "Authorization: Bearer $tok"
  fi
}

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '  ok  %s\n' "$*"; }
die()  { printf '  FAIL  %s\n' "$*" >&2; exit 1; }
