#!/usr/bin/env bash
# Configure only the Telnyx path in Dograh and RapidX. It never changes models,
# workflows, or initiates a PSTN call.
. "$(dirname "$0")/_common.sh"

: "${TELNYX_API_KEY:?Set TELNYX_API_KEY in .env}"
: "${TELNYX_NUMBER:?Set TELNYX_NUMBER in .env}"
: "${TELNYX_CONNECTION_ID:?Set TELNYX_CONNECTION_ID in .env}"
: "${DOGRAH_API_KEY:?Set DOGRAH_API_KEY in .env}"
: "${DOGRAH_WORKFLOW_ID:?Set DOGRAH_WORKFLOW_ID in .env}"

if ! [[ "$TELNYX_NUMBER" =~ ^\+55[1-9][0-9]{9,10}$ ]]; then
  die "TELNYX_NUMBER must be a Brazilian E.164 number, for example +5511999999999"
fi

TOK=$(dograh_token); export TOK
ok "Dograh authentication succeeded"

find_telnyx_config() {
  api GET /api/v1/organizations/telephony-configs | python3 -c '
import json, sys
rows = [row for row in json.load(sys.stdin).get("configurations", [])
        if str(row.get("provider", "")).lower() == "telnyx"]
if len(rows) > 1:
    raise SystemExit("Multiple Telnyx configurations exist. Refusing to guess which one to change.")
print(rows[0]["id"] if rows else "")
'
}

telnyx_request_payload() {
  python3 - "$1" <<'PY'
import json, os, sys
config = {
  "provider": "telnyx",
  "api_key": os.environ["TELNYX_API_KEY"],
  "connection_id": os.environ["TELNYX_CONNECTION_ID"],
  "from_numbers": [os.environ["TELNYX_NUMBER"]],
}
webhook_key = os.environ.get("TELNYX_WEBHOOK_PUBLIC_KEY", "").strip()
if webhook_key:
    config["webhook_public_key"] = webhook_key
payload = {"name": "Telnyx Outbound", "config": config}
if sys.argv[1] == "true":
    payload["is_default_outbound"] = True
print(json.dumps(payload))
PY
}

say "Creating or updating the dedicated Telnyx configuration"
CFG_ID=$(find_telnyx_config)
if [ -n "$CFG_ID" ]; then
  api PUT "/api/v1/organizations/telephony-configs/$CFG_ID" "$(telnyx_request_payload false)" >/dev/null
else
  CFG=$(api POST /api/v1/organizations/telephony-configs "$(telnyx_request_payload true)")
  CFG_ID=$(printf '%s' "$CFG" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
fi
api POST "/api/v1/organizations/telephony-configs/$CFG_ID/set-default-outbound" >/dev/null
ok "Telnyx configuration is the default outbound route"

find_phone_number() {
  api GET "/api/v1/organizations/telephony-configs/$CFG_ID/phone-numbers" | TELNYX_NUMBER="$TELNYX_NUMBER" python3 -c '
import json, os, re, sys
def canonical(value):
    digits = re.sub(r"\\D", "", str(value or ""))
    return "+" + digits if digits else ""
target = canonical(os.environ["TELNYX_NUMBER"])
rows = [row for row in json.load(sys.stdin).get("phone_numbers", [])
        if canonical(row.get("address_normalized") or row.get("address")) == target]
if len(rows) > 1:
    raise SystemExit("Multiple matching Telnyx caller IDs exist. Refusing to guess which one to change.")
print(rows[0]["id"] if rows else "")
'
}

say "Attaching the Telnyx caller ID"
PN_ID=$(find_phone_number)
if [ -z "$PN_ID" ]; then
  PN=$(api POST "/api/v1/organizations/telephony-configs/$CFG_ID/phone-numbers" "$(python3 - <<PY
import json, os
print(json.dumps({
  "address": os.environ["TELNYX_NUMBER"],
  "country_code": "BR",
  "label": "Telnyx Outbound",
  "is_active": True,
  "is_default_caller_id": True,
}))
PY
)")
  PN_ID=$(printf '%s' "$PN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
fi
api POST "/api/v1/organizations/telephony-configs/$CFG_ID/phone-numbers/$PN_ID/set-default-caller" >/dev/null
ok "Telnyx caller ID is active and default"

set_local_env() {
  python3 - "$ROOT/.env" "$1" "$2" <<'PY'
import os, sys, tempfile
path, key, value = sys.argv[1:]
with open(path, encoding="utf-8") as source:
    lines = source.read().splitlines()
prefix = key + "="
updated = []
found = False
for line in lines:
    if line.startswith(prefix):
        updated.append(prefix + value)
        found = True
    else:
        updated.append(line)
if not found:
    updated.append(prefix + value)
fd, temporary = tempfile.mkstemp(prefix=".env.", dir=os.path.dirname(path))
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
        target.write("\n".join(updated) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
}

say "Saving the generated Dograh identifiers locally"
set_local_env TELEPHONY_PROVIDER telnyx
set_local_env DOGRAH_TELEPHONY_CONFIG_ID "$CFG_ID"
set_local_env DOGRAH_PHONE_NUMBER_ID "$PN_ID"

sync_dashboard_env() {
  local script
  script=$(cat <<'PY'
import os, sys, tempfile
path = "/opt/rapidx-voice/.env"
updates = {}
for line in sys.stdin:
    key, separator, value = line.rstrip("\n").partition("=")
    if separator and key:
        updates[key] = value
with open(path, encoding="utf-8") as source:
    lines = source.read().splitlines()
written = set()
merged = []
for line in lines:
    key, separator, _ = line.partition("=")
    if separator and key in updates:
        merged.append(key + "=" + updates[key])
        written.add(key)
    else:
        merged.append(line)
for key, value in updates.items():
    if key not in written:
        merged.append(key + "=" + value)
fd, temporary = tempfile.mkstemp(prefix=".env.", dir=os.path.dirname(path))
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
        target.write("\n".join(merged) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
)
  {
    printf 'DOGRAH_BASE_URL=%s\n' "$DOGRAH_BASE_URL"
    printf 'DOGRAH_API_KEY=%s\n' "$DOGRAH_API_KEY"
    printf 'DOGRAH_WORKFLOW_ID=%s\n' "$DOGRAH_WORKFLOW_ID"
    printf 'DOGRAH_TELEPHONY_CONFIG_ID=%s\n' "$CFG_ID"
    printf 'DOGRAH_PHONE_NUMBER_ID=%s\n' "$PN_ID"
    printf 'TELEPHONY_PROVIDER=telnyx\n'
    printf 'TELNYX_NUMBER=%s\n' "$TELNYX_NUMBER"
  } | rsh "sudo -n python3 -c $(printf '%q' "$script")"

  # The dashboard loader gives Docker-injected variables precedence over .env.
  # Recreate only this stateless container so an old provider selection cannot win.
  local port="${DASHBOARD_PORT:-8787}"
  rsh "set -eu; \
    sudo -n docker rm -f rapidx-voice >/dev/null 2>&1 || true; \
    sudo -n docker run -d --name rapidx-voice --restart always --network rapidx-local-speech -p 127.0.0.1:$port:$port \
      -v /opt/rapidx-voice:/app -w /app node:20-alpine node server.js >/dev/null; \
    if sudo -n docker network inspect rapidx-telephony >/dev/null 2>&1; then \
      sudo -n docker network connect rapidx-telephony rapidx-voice 2>/dev/null || true; \
    fi; \
    sleep 1; \
    test \"\$(sudo -n docker exec rapidx-voice node -e 'process.stdout.write(process.env.TELEPHONY_PROVIDER || \"\")')\" = telnyx; \
    curl -fsS --max-time 10 http://127.0.0.1:$port/api/health >/dev/null"
}

say "Synchronizing only RapidX telephony settings"
sync_dashboard_env
ok "RapidX restarted with Telnyx selected"

say "Verifying the Telnyx path without placing a call"
api GET /api/v1/organizations/telephony-configs | CFG_ID="$CFG_ID" PN_ID="$PN_ID" python3 -c '
import json, os, sys
configs = json.load(sys.stdin).get("configurations", [])
config = next((row for row in configs if str(row.get("id")) == os.environ["CFG_ID"]), None)
if not config or str(config.get("provider", "")).lower() != "telnyx":
    raise SystemExit("Telnyx configuration verification failed")
if not config.get("is_default_outbound"):
    raise SystemExit("Telnyx configuration is not the default outbound route")
print("verified: configuration", os.environ["CFG_ID"], "provider=telnyx default_outbound=true")
'
api GET "/api/v1/organizations/telephony-configs/$CFG_ID/phone-numbers" | PN_ID="$PN_ID" python3 -c '
import json, os, sys
numbers = json.load(sys.stdin).get("phone_numbers", [])
number = next((row for row in numbers if str(row.get("id")) == os.environ["PN_ID"]), None)
if not number or number.get("is_active") is False or not number.get("is_default_caller_id"):
    raise SystemExit("Telnyx caller ID verification failed")
print("verified: caller ID", os.environ["PN_ID"], "active=true default=true")
'

cat <<'NEXT'

No PSTN call was placed. The next permitted step is one explicitly approved
controlled call with the exact destination number and expected cost scope.
NEXT
