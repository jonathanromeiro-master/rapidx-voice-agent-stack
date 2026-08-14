#!/usr/bin/env bash
# STEP 7 (optional). The zero-dependency management console on port 8787.
. "$(dirname "$0")/_common.sh"
PORT="${DASHBOARD_PORT:-8787}"
DASHBOARD_HOST="${DASHBOARD_HOST:-studio.$DOGRAH_HOST}"

say "Shipping the dashboard to $DASHBOARD_HOST"
rsh "sudo -n install -d -m 0755 /opt/rapidx-voice"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --rsync-path="sudo -n rsync" -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
    --exclude .env --exclude data --exclude node_modules \
    "$ROOT/dashboard/" "$SSH_USER@$VPS_IP:/opt/rapidx-voice/"
else
  stage=/tmp/rapidx-voice-upload
  rsh "sudo -n install -d -o $SSH_USER -g $SSH_USER -m 0700 $stage"
  scp -r -o StrictHostKeyChecking=no -i "$SSH_KEY" \
    "$ROOT/dashboard/lib" "$ROOT/dashboard/public" \
    "$ROOT/dashboard/server.js" "$ROOT/dashboard/package.json" \
    "$SSH_USER@$VPS_IP:$stage/"
  rsh "sudo -n cp -a $stage/lib $stage/public $stage/server.js $stage/package.json /opt/rapidx-voice/"
fi

# Keys stay server-side, they never reach the browser.
export DOGRAH_BASE_URL="${DOGRAH_BASE_URL:-$BASE}"
export DOGRAH_WORKFLOW_ID="${DOGRAH_WORKFLOW_ID:-${WORKFLOW_ID:-}}"
export DOGRAH_TELEPHONY_CONFIG_ID="${DOGRAH_TELEPHONY_CONFIG_ID:-${TELEPHONY_CONFIG_ID:-}}"
export DOGRAH_PHONE_NUMBER_ID="${DOGRAH_PHONE_NUMBER_ID:-${PHONE_NUMBER_ID:-}}"
python3 - <<PY | rsh "sudo -n tee /opt/rapidx-voice/.env >/dev/null"
import os
for k in [
    "RUMIK_API_KEY", "RUMIK_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL",
    "GROQ_API_KEY", "GROQ_MODEL", "LLM_PROVIDER",
    "STT_PROVIDER", "DEEPGRAM_API_KEY", "DEEPGRAM_MODEL",
    "LOCAL_STT_BASE_URL", "LOCAL_STT_MODEL", "LOCAL_STT_LANGUAGE",
    "TTS_PROVIDER", "LOCAL_TTS_BASE_URL", "LOCAL_TTS_MODEL", "LOCAL_TTS_VOICE",
    "LOCAL_TTS_API_KEY", "TELEPHONY_PROVIDER",
    "ASTERISK_ARI_URL", "ASTERISK_ARI_USERNAME", "ASTERISK_ARI_PASSWORD",
    "ASTERISK_ARI_APP", "ASTERISK_SIP_ENDPOINT_ID", "ASTERISK_ARI_ENDPOINT_TEMPLATE",
    "BRDID_SIP_SERVER", "BRDID_SIP_USERNAME", "BRDID_SIP_PASSWORD", "BRDID_INBOUND_EXTENSION",
    "BRDID_SIP_PORT", "BRDID_SIP_TRANSPORT", "BRDID_CALLER_ID",
    "DOGRAH_BASE_URL", "DOGRAH_API_KEY", "DOGRAH_WORKFLOW_ID",
    "DOGRAH_TELEPHONY_CONFIG_ID", "DOGRAH_PHONE_NUMBER_ID",
    "VOBIZ_NUMBER", "TELNYX_NUMBER",
]:
    v=os.environ.get(k,"")
    if v: print(f"{k}={v}")
print(f"PORT={os.environ.get('DASHBOARD_PORT','8787')}")
PY

# Install runtime dependencies in a short-lived container. The application
# requires ws; source and credentials remain mounted only on the VPS.
rsh "sudo -n docker run --rm -v /opt/rapidx-voice:/app -w /app node:20-alpine npm install --omit=dev --ignore-scripts --no-audit --no-fund"
rsh "sudo -n docker rm -f rapidx-voice 2>/dev/null; \
     sudo -n docker run -d --name rapidx-voice --restart always --network rapidx-local-speech -p 127.0.0.1:$PORT:$PORT \
       -v /opt/rapidx-voice:/app -w /app node:20-alpine node server.js"
rsh "if sudo -n docker network inspect rapidx-telephony >/dev/null 2>&1; then sudo -n docker network connect rapidx-telephony rapidx-voice 2>/dev/null || true; fi"

say "Publishing the dashboard through the existing Caddy"
rsh "set -eu; caddy_file=/opt/oracle-caddy/Caddyfile; backup=/opt/oracle-caddy/Caddyfile.before-rapidx-dashboard; \
     sudo -n test -f \$caddy_file; \
     if ! sudo -n grep -Fq '$DASHBOARD_HOST {' \$caddy_file; then \
       sudo -n cp \$caddy_file \$backup; \
       printf '\n%s {\n    reverse_proxy http://127.0.0.1:$PORT\n}\n' '$DASHBOARD_HOST' | sudo -n tee -a \$caddy_file >/dev/null; \
       if ! sudo -n docker exec oracle-caddy-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then sudo -n cp \$backup \$caddy_file; exit 1; fi; \
       sudo -n docker exec oracle-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null; \
     fi"

sleep 3
rsh "sudo -n docker logs rapidx-voice --tail 10"
code=$(curl -ksS --max-time 20 -o /dev/null -w '%{http_code}' "https://$DASHBOARD_HOST/app.html" || true)
[ "$code" = "200" ] || die "Dashboard did not return 200, got $code"
ok "Dashboard live at https://$DASHBOARD_HOST/app.html"
