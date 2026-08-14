#!/usr/bin/env bash
# STEP 3. Deploy local STT/TTS proxy services on the VPS.
. "$(dirname "$0")/_common.sh"

say "Shipping local speech proxy services to $VPS_IP"
rsh "sudo -n install -d -m 0755 /opt/rapidx-local-speech"
rsync -a --rsync-path="sudo -n rsync" -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
  "$ROOT/services/" "$SSH_USER@$VPS_IP:/opt/rapidx-local-speech/services/"
rsh "sudo -n chmod -R u=rwX,go=rX /opt/rapidx-local-speech/services"

python3 - <<PY | rsh "sudo -n tee /opt/rapidx-local-speech/local-speech.env >/dev/null"
import os
pairs = {
    "STT_UPSTREAM_URL": os.environ.get("STT_UPSTREAM_URL", "http://rapidx-whisper-engine:8091/inference"),
    "STT_UPSTREAM_HEALTH_URL": os.environ.get("STT_UPSTREAM_HEALTH_URL", "http://rapidx-whisper-engine:8091/"),
    "TTS_UPSTREAM_URL": os.environ.get("TTS_UPSTREAM_URL", "http://rapidx-piper-engine:5000/synthesize"),
    "TTS_UPSTREAM_HEALTH_URL": os.environ.get("TTS_UPSTREAM_HEALTH_URL", "http://rapidx-piper-engine:5000/info"),
    "REQUEST_TIMEOUT_SECONDS": os.environ.get("LOCAL_SPEECH_TIMEOUT_SECONDS", "30"),
}
for key, value in pairs.items():
    if value:
        print(f"{key}={value}")
PY

WHISPER_MODEL="${LOCAL_STT_MODEL:-small}"
WHISPER_THREADS="${WHISPER_THREADS:-4}"
PIPER_VOICE="${LOCAL_TTS_VOICE:-pt_BR-faber-medium}"

say "Creating private local-speech network"
rsh "sudo -n docker network inspect rapidx-local-speech >/dev/null 2>&1 || sudo -n docker network create rapidx-local-speech"

say "Building whisper.cpp engine image"
rsh "cd /opt/rapidx-local-speech && sudo -n docker build \
       --build-arg WHISPER_MODEL=$WHISPER_MODEL \
       --build-arg WHISPER_THREADS=$WHISPER_THREADS \
       -t rapidx-whisper-engine services/whisper-engine"

say "Starting whisper.cpp engine"
rsh "sudo -n docker rm -f rapidx-whisper-engine 2>/dev/null || true; \
     sudo -n docker run -d --name rapidx-whisper-engine --restart always \
       --network rapidx-local-speech \
       -p 127.0.0.1:8091:8091 rapidx-whisper-engine"

say "Building Piper engine image"
rsh "cd /opt/rapidx-local-speech && sudo -n docker build --build-arg PIPER_VOICE=$PIPER_VOICE -t rapidx-piper-engine services/piper-engine"

say "Starting Piper engine"
rsh "sudo -n docker rm -f rapidx-piper-engine 2>/dev/null || true; \
     sudo -n docker run -d --name rapidx-piper-engine --restart always \
       --network rapidx-local-speech \
       -p 127.0.0.1:5000:5000 rapidx-piper-engine"

say "Building local-stt"
rsh "cd /opt/rapidx-local-speech && sudo -n docker build -t rapidx-local-stt services/local-stt"
say "Building local-tts"
rsh "cd /opt/rapidx-local-speech && sudo -n docker build -t rapidx-local-tts services/local-tts"

say "Starting local-stt"
rsh "sudo -n docker rm -f rapidx-local-stt 2>/dev/null || true; \
     sudo -n docker run -d --name rapidx-local-stt --restart always \
       --network rapidx-local-speech \
       --env-file /opt/rapidx-local-speech/local-speech.env \
       -p 127.0.0.1:8080:8080 rapidx-local-stt"

say "Starting local-tts"
rsh "sudo -n docker rm -f rapidx-local-tts 2>/dev/null || true; \
     sudo -n docker run -d --name rapidx-local-tts --restart always \
       --network rapidx-local-speech \
       --env-file /opt/rapidx-local-speech/local-speech.env \
       -p 127.0.0.1:8090:8090 rapidx-local-tts"

DOGRAH_API=$(api_container || true)
if [ -n "$DOGRAH_API" ]; then
  say "Connecting $DOGRAH_API to the private local-speech network"
  rsh "sudo -n docker network connect rapidx-local-speech $DOGRAH_API 2>/dev/null || true"
fi

say "Verifying local speech health"
rsh "curl -fsS http://127.0.0.1:5000/info || sudo -n docker logs rapidx-piper-engine --tail 50"
rsh "curl -fsS http://127.0.0.1:8080/health || sudo -n docker logs rapidx-local-stt --tail 50"
rsh "curl -fsS http://127.0.0.1:8090/health || sudo -n docker logs rapidx-local-tts --tail 50"
rsh "python3 /opt/rapidx-local-speech/services/smoke_test.py"
ok "Local speech engines and proxies are listening on 127.0.0.1"

cat <<NEXT

Next:
  1. Keep LOCAL_STT_BASE_URL and LOCAL_TTS_BASE_URL pointed at:
       http://rapidx-local-stt:8080
       http://rapidx-local-tts:8090
  2. Run: bash deploy/03-configure.sh
NEXT
