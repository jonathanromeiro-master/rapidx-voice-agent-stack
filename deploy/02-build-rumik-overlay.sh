#!/usr/bin/env bash
# STEP 4. Add Rumik silk as a TTS provider via a Docker overlay.
. "$(dirname "$0")/_common.sh"

say "Building the Rumik overlay image"

BASE_IMG=$(rsh "docker ps --format '{{.Image}}' | grep -i dograh-api | head -1")
[ -n "$BASE_IMG" ] || die "Could not find the running dograh-api image"
ok "Base image: $BASE_IMG"

rsh "mkdir -p /opt/rumik-overlay"
sed "s|^FROM .*|FROM $BASE_IMG|" "$ROOT/deploy/rumik-overlay/Dockerfile" \
  | rsh "cat > /opt/rumik-overlay/Dockerfile"

# The registry patches must come from the running image so they match its version.
say "Extracting registry files from the running image to patch"
CID=$(api_container)
rsh "docker cp $CID:/app/api/services/configuration/registry.py /opt/rumik-overlay/registry.py"
rsh "docker cp $CID:/app/api/services/pipecat/service_factory.py /opt/rumik-overlay/service_factory.py"

cat <<'WARN'

  NOTE: registry.py and service_factory.py have been copied out of the running
  image UNPATCHED. Rumik must be registered in both before the image is built:
    - registry.py        add a rumik entry to the TTS provider registry
    - service_factory.py construct a RumikTTSService when provider == "rumik"
  Reference patches are documented in docs/RUMIK-OVERLAY.md.

WARN

read -r -p "Patched both files on the box? Press enter to build, Ctrl-C to stop. " _

say "Building (pip install uses --no-deps, see docs/RUMIK-OVERLAY.md for why)"
rsh "cd /opt/rumik-overlay && docker build -t local/dograh-api:rumik-v1 ."

say "Pointing the compose stack at the new image"
rsh "cd /opt/dograh-hq/dograh && printf 'services:\n  api:\n    image: local/dograh-api:rumik-v1\n    pull_policy: never\n' > docker-compose.override.yaml && docker compose up -d api"

sleep 20
rsh "docker ps --format '{{.Names}}\t{{.Status}}' | grep api"
ok "Rumik overlay live. Next: bash deploy/03-configure.sh"
