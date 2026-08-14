#!/usr/bin/env python3
import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = "local-tts"
PORT = int(os.environ.get("PORT", "8090"))
UPSTREAM_URL = os.environ.get("TTS_UPSTREAM_URL", "").strip()
UPSTREAM_HEALTH_URL = os.environ.get("TTS_UPSTREAM_HEALTH_URL", "").strip()
TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT_SECONDS", "30"))
MAX_BODY = int(os.environ.get("MAX_BODY_BYTES", str(512 * 1024)))


def log(event):
    sys.stdout.write(json.dumps({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "service": SERVICE,
        **event,
    }) + "\n")
    sys.stdout.flush()


def fetch(url, *, method="GET", body=None, headers=None, timeout=TIMEOUT):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, dict(resp.headers.items()), resp.read()


def wav_content_type(status, data):
    if not 200 <= status < 300:
        return None
    if not data.startswith(b"RIFF"):
        raise ValueError("upstream did not return WAV audio")
    return "audio/wav"


def model_list():
    return {
        "object": "list",
        "data": [{"id": "piper", "object": "model", "created": 0, "owned_by": "rapidx-local"}],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "RapidXLocalTTS/1.0"

    def log_message(self, _format, *_args):
        return

    def _json(self, status, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        started = time.time()
        status = 200
        if self.path == "/v1/models":
            self._json(200, model_list())
            log({"method": "GET", "path": self.path, "status": status, "duration_ms": round((time.time() - started) * 1000, 2)})
            return
        if self.path != "/health":
            status = 404
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if not UPSTREAM_URL:
            status = 503
            self._json(503, {"ok": False, "service": SERVICE, "error": "TTS_UPSTREAM_URL is not configured"})
            return
        try:
            if UPSTREAM_HEALTH_URL:
                status, _, _ = fetch(UPSTREAM_HEALTH_URL, timeout=min(TIMEOUT, 10))
                ok = 200 <= status < 300
                self._json(200 if ok else 503, {
                    "ok": ok,
                    "service": SERVICE,
                    "upstream": UPSTREAM_HEALTH_URL,
                    "status": status,
                })
            else:
                status = 200
                self._json(200, {"ok": True, "service": SERVICE, "upstream": UPSTREAM_URL})
        finally:
            log({"method": "GET", "path": self.path, "status": status, "duration_ms": round((time.time() - started) * 1000, 2)})

    def do_POST(self):
        started = time.time()
        status = 500
        if self.path != "/v1/audio/speech":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if not UPSTREAM_URL:
            self._json(503, {"ok": False, "error": "TTS_UPSTREAM_URL is not configured"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length <= 0 or length > MAX_BODY:
                self._json(413, {"ok": False, "error": "payload_too_large"})
                return
            body = self.rfile.read(length)
            upstream_payload = json.loads(body.decode("utf-8"))
            mapped = {
                "text": upstream_payload.get("input") or upstream_payload.get("text") or "",
            }
            if upstream_payload.get("voice"):
                mapped["voice"] = upstream_payload["voice"]
            if upstream_payload.get("speed") not in (None, ""):
                try:
                    speed = float(upstream_payload["speed"])
                    if speed > 0:
                        mapped["length_scale"] = round(1.0 / speed, 4)
                except Exception:
                    pass
            if upstream_payload.get("speaker") not in (None, ""):
                mapped["speaker"] = upstream_payload["speaker"]
            if upstream_payload.get("speaker_id") not in (None, ""):
                mapped["speaker_id"] = upstream_payload["speaker_id"]
            body = json.dumps(mapped).encode("utf-8")
            forward_headers = {
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
            }
            if self.headers.get("Authorization"):
                forward_headers["Authorization"] = self.headers["Authorization"]
            status, headers, data = fetch(UPSTREAM_URL, method="POST", body=body, headers=forward_headers)
            try:
                content_type = wav_content_type(status, data)
            except ValueError:
                status = 502
                self._json(status, {"ok": False, "error": "invalid_audio_response"})
                return
            if content_type is None:
                content_type = headers.get("Content-Type", "application/json")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except urllib.error.HTTPError as err:
            payload = err.read()
            status = err.code
            self.send_response(err.code)
            self.send_header("Content-Type", err.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as err:
            status = 504
            self._json(504, {"ok": False, "error": "upstream_timeout", "detail": str(err)})
        finally:
            log({"method": "POST", "path": self.path, "status": status, "duration_ms": round((time.time() - started) * 1000, 2)})


httpd = None


def shutdown(_signum, _frame):
    log({"event": "shutdown"})
    if httpd:
        httpd.shutdown()


signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

def main():
    global httpd
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    log({"event": "start", "port": PORT, "upstream": UPSTREAM_URL})
    httpd.serve_forever()


if __name__ == "__main__":
    main()
