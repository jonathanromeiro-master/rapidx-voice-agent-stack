#!/usr/bin/env bash
# STEP 6b. Place a real outbound call. This costs money.
. "$(dirname "$0")/_common.sh"
: "${WORKFLOW_ID:?Set WORKFLOW_ID in .env}"
: "${TELEPHONY_CONFIG_ID:?Set TELEPHONY_CONFIG_ID in .env}"
: "${PHONE_NUMBER_ID:?Set PHONE_NUMBER_ID in .env}"

TARGET="${1:-${TEST_NUMBER:-}}"
[ -n "$TARGET" ] || die "Usage: bash deploy/05-place-call.sh +5511999999999"

case "${TELEPHONY_PROVIDER:-brdid_asterisk}" in
  brdid_asterisk)
    : "${ASTERISK_ARI_ENDPOINT_TEMPLATE:?Set ASTERISK_ARI_ENDPOINT_TEMPLATE in .env}"
    DIAL_TARGET=$(TARGET="$TARGET" python3 - <<'PY'
import os
number=os.environ["TARGET"]
if not number.startswith("+") or not number[1:].isdigit():
    raise SystemExit("TEST_NUMBER must be E.164")
endpoint=os.environ["ASTERISK_ARI_ENDPOINT_TEMPLATE"]
if "{number}" not in endpoint and "{e164}" not in endpoint:
    raise SystemExit("ASTERISK_ARI_ENDPOINT_TEMPLATE must include {number} or {e164}")
endpoint=endpoint.replace("{number}", number[1:]).replace("{e164}", number)
if not endpoint.startswith(("PJSIP/", "SIP/")):
    raise SystemExit("ASTERISK_ARI_ENDPOINT_TEMPLATE must render PJSIP/... or SIP/...")
print(endpoint)
PY
)
    ;;
  *) DIAL_TARGET="$TARGET" ;;
esac
export DIAL_TARGET

say "Placing one REAL, billable call to $TARGET."
read -r -p "Type the exact target number to authorize this call: " a
[ "$a" = "$TARGET" ] || die "Call not authorized"

TOK=$(dograh_token); export TOK
api POST /api/v1/telephony/initiate-call "$(python3 - <<PY
import json,os
print(json.dumps({
  "workflow_id": int(os.environ["WORKFLOW_ID"]),
  "telephony_configuration_id": int(os.environ["TELEPHONY_CONFIG_ID"]),
  "from_phone_number_id": int(os.environ["PHONE_NUMBER_ID"]),
  "phone_number": os.environ["DIAL_TARGET"],
}))
PY
)"
echo

cat <<'CHECK'
Answer the phone and verify all three, not just the first:
  1. the agent SPEAKS FIRST, without waiting for you
  2. you can talk over it mid-sentence and it stops
  3. it responds to what you actually said

Silence after pickup usually means the number is bound to a stale provider
application whose answer_url or webhook points somewhere dead. Re-run 03-configure.sh.
CHECK

sleep 10
say "Latest run"
api GET "/api/v1/workflow/$WORKFLOW_ID/runs" | python3 -c '
import json,sys
r=json.load(sys.stdin)["runs"][0]
print("  name:     ", r["name"])
print("  mode:     ", r["mode"])
print("  completed:", r["is_completed"])
rc=r.get("initial_context",{}).get("runtime_configuration",{})
print("  pipeline: ", rc.get("stt_provider"), "+", rc.get("llm_provider"), "+", rc.get("tts_provider"))
'
