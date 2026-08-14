#!/usr/bin/env python3
import json
import os
import urllib.request
import uuid


def request(url, body, content_type):
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": content_type})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.status, response.read(), response.headers.get_content_type()


tts_url = os.environ.get("LOCAL_TTS_SMOKE_URL", "http://127.0.0.1:8090/v1/audio/speech")
stt_url = os.environ.get("LOCAL_STT_SMOKE_URL", "http://127.0.0.1:8080/v1/audio/transcriptions")
tts_body = json.dumps({"input": "Ola, este e um teste de voz local."}).encode("utf-8")
tts_status, wav, wav_type = request(tts_url, tts_body, "application/json")
if tts_status != 200 or wav_type != "audio/wav" or not wav.startswith(b"RIFF"):
    raise SystemExit("TTS smoke test did not return a WAV")

boundary = f"----rapidx-{uuid.uuid4().hex}"
parts = [
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n".encode(),
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"smoke.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
    wav,
    f"\r\n--{boundary}--\r\n".encode(),
]
stt_status, transcript, stt_type = request(stt_url, b"".join(parts), f"multipart/form-data; boundary={boundary}")
parsed = json.loads(transcript)
if stt_status != 200 or not parsed.get("text", "").strip():
    raise SystemExit("STT smoke test did not return a transcript")

print(json.dumps({"ok": True, "tts_content_type": wav_type, "tts_bytes": len(wav), "stt_content_type": stt_type, "transcript": parsed["text"].strip()}))
