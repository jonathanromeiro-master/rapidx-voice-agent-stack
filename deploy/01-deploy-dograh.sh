#!/usr/bin/env bash
# STEP 2. Bare Ubuntu box -> Dograh running with HTTPS.
. "$(dirname "$0")/_common.sh"

say "Deploying Dograh to $VPS_IP (host $DOGRAH_HOST)"

memory_gib=$(rsh "awk '/MemTotal/ {print int(\$2 / 1024 / 1024)}' /proc/meminfo")
if [ "$memory_gib" -lt 8 ]; then
  say "Adding swap for the low-memory host"
  rsh "if ! test -f /swapfile; then sudo -n fallocate -l 4G /swapfile || exit 1; sudo -n chmod 600 /swapfile || exit 1; sudo -n mkswap /swapfile || exit 1; sudo -n swapon /swapfile || exit 1; grep -qs '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo -n tee -a /etc/fstab >/dev/null; fi"
else
  ok "Skipping swap, host has ${memory_gib} GiB RAM"
fi

say "Opening firewall"
if rsh "command -v ufw >/dev/null 2>&1"; then
  rsh "sudo -n ufw allow 22/tcp && sudo -n ufw allow 80/tcp && sudo -n ufw allow 443/tcp && sudo -n ufw allow 3478 && sudo -n ufw allow 5349 && sudo -n ufw allow 49152:49200/udp"
else
  say "UFW is not installed; keep 22, 80, 443, 3478, 5349, and UDP 49152-49200 open in OCI ingress rules"
fi

existing_caddy=$(rsh "sudo -n docker ps --filter name=oracle-caddy-caddy-1 --format '{{.Names}}'")
if [ "$existing_caddy" = "oracle-caddy-caddy-1" ]; then
  say "Deploying Dograh behind the existing Oracle Caddy"
  if rsh "sudo -n test -f /opt/dograh-hq/dograh/docker-compose.yml"; then
    ok "Reusing the existing Dograh installation"
  else
    rsh "sudo -n install -d -m 0755 /opt/dograh-hq && cd /opt/dograh-hq && \
         sudo -n curl -fsSL -o setup_remote.sh https://raw.githubusercontent.com/dograh-hq/dograh/main/scripts/setup_remote.sh && \
         sudo -n chmod +x setup_remote.sh && \
         sudo -n bash -c 'cd /opt/dograh-hq && TURN_SECRET=\"\$(openssl rand -hex 32)\" CERT_MODE=self-signed SERVER_IP=$VPS_IP DEPLOY_MODE=prebuilt FASTAPI_WORKERS=1 ENABLE_TELEMETRY=false ./setup_remote.sh </dev/null'"
  fi

  scp -o ConnectTimeout=15 -o StrictHostKeyChecking=no -i "$SSH_KEY" \
    "$ROOT/deploy/templates/dograh.oracle-compose.override.yaml" \
    "$SSH_USER@$VPS_IP:/tmp/dograh.oracle-compose.override.yaml"

  say "Keeping Dograh internal and adding its Caddy route"
  rsh "set -eu; project=/opt/dograh-hq/dograh; caddy_file=/opt/oracle-caddy/Caddyfile; backup=/opt/oracle-caddy/Caddyfile.before-dograh; \
       sudo -n test -f \$project/remote_up.sh; sudo -n test -f \$caddy_file; \
       sudo -n install -m 0644 /tmp/dograh.oracle-compose.override.yaml \$project/docker-compose.override.yaml; \
       if ! sudo -n grep -Fq '$DOGRAH_HOST {' \$caddy_file; then \
         sudo -n cp \$caddy_file \$backup; \
         printf '\n%s {\n    reverse_proxy https://127.0.0.1:18443 {\n        transport http {\n            tls_insecure_skip_verify\n        }\n        header_up Host {host}\n    }\n}\n' '$DOGRAH_HOST' | sudo -n tee -a \$caddy_file >/dev/null; \
         if ! sudo -n docker exec oracle-caddy-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then sudo -n cp \$backup \$caddy_file; exit 1; fi; \
         sudo -n docker exec oracle-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null; \
       fi; \
       cd \$project && sudo -n ./remote_up.sh"
else
  if rsh "sudo -n ss -ltn '( sport = :80 or sport = :443 )' | grep -q LISTEN"; then
    die "Ports 80/443 are already occupied by an unmanaged proxy; refusing to overwrite it. Configure a dedicated reverse-proxy route first."
  fi

  say "Running Dograh's official remote installer, prebuilt mode"
  rsh "sudo -n install -d -m 0755 /opt/dograh-hq && cd /opt/dograh-hq && \
       sudo -n curl -fsSL -o setup_remote.sh https://raw.githubusercontent.com/dograh-hq/dograh/main/scripts/setup_remote.sh && \
       sudo -n chmod +x setup_remote.sh && \
       sudo -n bash -c 'cd /opt/dograh-hq && TURN_SECRET=\"\$(openssl rand -hex 32)\" SERVER_IP=$VPS_IP DEPLOY_MODE=prebuilt FASTAPI_WORKERS=1 ENABLE_TELEMETRY=false ./setup_remote.sh </dev/null'"
fi

say "Verifying"
for _ in $(seq 1 45); do
  code=$(rsh "curl -sLo /dev/null -w '%{http_code}' $BASE/api/v1/openapi.json -k" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "${code:-}" = "200" ] || die "OpenAPI did not return 200, got ${code:-connection failure}"
rsh "sudo -n docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'dograh|nginx_https|coturn'"
ok "Console live at $BASE"

cat <<NEXT

NEXT: open $BASE in a browser and sign up with
the credentials configured in your local .env.

The first signup owns organization 1. Use this SAME account for the browser and
for every API call, or the console will look empty while the API shows data.

Then run:
  bash deploy/02-deploy-local-speech.sh

Optional fallback only:
  bash deploy/02-build-rumik-overlay.sh
NEXT
