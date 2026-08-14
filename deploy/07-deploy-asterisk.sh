#!/usr/bin/env bash
# Deploy the private Asterisk 22 bridge used by Dograh ARI and the BR DID trunk.
. "$(dirname "$0")/_common.sh"

: "${BRDID_SIP_SERVER:?Set BRDID_SIP_SERVER in .env}"
: "${BRDID_SIP_USERNAME:?Set BRDID_SIP_USERNAME in .env}"
: "${BRDID_SIP_PASSWORD:?Set BRDID_SIP_PASSWORD in .env}"
: "${BRDID_CALLER_ID:?Set BRDID_CALLER_ID in .env}"
: "${ASTERISK_ARI_USERNAME:?Set ASTERISK_ARI_USERNAME in .env}"
: "${ASTERISK_ARI_PASSWORD:?Set ASTERISK_ARI_PASSWORD in .env}"
: "${ASTERISK_ARI_APP:?Set ASTERISK_ARI_APP in .env}"
: "${BRDID_INBOUND_EXTENSION:?Set BRDID_INBOUND_EXTENSION in .env}"
: "${ASTERISK_ARI_ENDPOINT_TEMPLATE:?Set ASTERISK_ARI_ENDPOINT_TEMPLATE in .env}"

[ "$ASTERISK_ARI_USERNAME" = "$ASTERISK_ARI_APP" ] || die "ASTERISK_ARI_USERNAME must equal ASTERISK_ARI_APP for Dograh ARI"
[ "${#ASTERISK_ARI_PASSWORD}" -ge 24 ] || die "ASTERISK_ARI_PASSWORD must be at least 24 characters"
case "${BRDID_SIP_TRANSPORT:-udp}" in udp|tcp|tls) ;; *) die "BRDID_SIP_TRANSPORT must be udp, tcp, or tls";; esac
case "$BRDID_CALLER_ID" in +[1-9]* ) ;; *) die "BRDID_CALLER_ID must be E.164";; esac
case "$BRDID_INBOUND_EXTENSION" in *[!+0-9]*|'') die "BRDID_INBOUND_EXTENSION must be the exact digit string received by Asterisk";; esac
case "$ASTERISK_ARI_ENDPOINT_TEMPLATE" in *'{number}'*|*'{e164}'*) ;; *) die "ASTERISK_ARI_ENDPOINT_TEMPLATE must include {number} or {e164}";; esac

say "Deploying private Asterisk bridge"
rsh "sudo -n docker network inspect rapidx-telephony >/dev/null 2>&1 || sudo -n docker network create rapidx-telephony"
rsh "sudo -n install -d -m 0755 /opt/rapidx-asterisk"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --rsync-path="sudo -n rsync" -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
    --exclude asterisk.env "$ROOT/services/asterisk/" "$SSH_USER@$VPS_IP:/opt/rapidx-asterisk/"
else
  stage=/tmp/rapidx-asterisk-upload
  rsh "sudo -n install -d -o $SSH_USER -g $SSH_USER -m 0700 $stage"
  scp -o StrictHostKeyChecking=no -i "$SSH_KEY" \
    "$ROOT/services/asterisk/Dockerfile" "$ROOT/services/asterisk/compose.yaml" "$ROOT/services/asterisk/entrypoint.sh" \
    "$SSH_USER@$VPS_IP:$stage/"
  rsh "sudo -n install -m 0644 $stage/Dockerfile /opt/rapidx-asterisk/Dockerfile && \
       sudo -n install -m 0644 $stage/compose.yaml /opt/rapidx-asterisk/compose.yaml && \
       sudo -n install -m 0755 $stage/entrypoint.sh /opt/rapidx-asterisk/entrypoint.sh"
fi

python3 - <<'PY' | rsh "sudo -n tee /opt/rapidx-asterisk/asterisk.env >/dev/null"
import os
for key in (
    "ASTERISK_ARI_USERNAME", "ASTERISK_ARI_PASSWORD", "ASTERISK_ARI_APP",
    "BRDID_SIP_SERVER", "BRDID_SIP_USERNAME", "BRDID_SIP_PASSWORD",
    "BRDID_SIP_PORT", "BRDID_SIP_TRANSPORT",
):
    print(f"{key}={os.environ[key]}")
print("ASTERISK_DOGRAH_WS_URL=ws://dograh-api-1:8000/api/v1/telephony/ws/ari")
PY

rsh "cd /opt/rapidx-asterisk && sudo -n docker compose -f compose.yaml up -d --build"
rsh "if ! sudo -n docker network inspect rapidx-telephony | grep -Fq dograh-api-1; then sudo -n docker network connect rapidx-telephony dograh-api-1; fi"

say "Verifying Asterisk modules"
for _ in $(seq 1 30); do
  health=$(rsh "sudo -n docker inspect rapidx-asterisk --format '{{.State.Health.Status}}'" || true)
  [ "$health" = healthy ] && break
  sleep 2
done
[ "${health:-}" = healthy ] || die "Asterisk container did not become healthy"
rsh "sudo -n docker exec rapidx-asterisk asterisk -rx 'module show like chan_websocket' | grep -q Running"
rsh "sudo -n docker exec rapidx-asterisk asterisk -rx 'module show like res_websocket_client' | grep -q Running"
rsh "sudo -n docker exec rapidx-asterisk asterisk -rx 'module show like res_ari' | grep -q Running"
ok "Asterisk ARI and WebSocket media modules are running privately"
