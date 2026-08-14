#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import threading
import time
import unittest
import urllib.request
from http.server import ThreadingHTTPServer


APP_PATH = pathlib.Path(__file__).parent / "local-tts" / "app.py"
SPEC = importlib.util.spec_from_file_location("local_tts", APP_PATH)
LOCAL_TTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LOCAL_TTS)


class LocalTtsContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), LOCAL_TTS.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()

    def test_successful_wav_is_labeled_as_audio_wav(self):
        self.assertEqual(LOCAL_TTS.wav_content_type(200, b"RIFFdata",), "audio/wav")

    def test_successful_non_wav_is_rejected(self):
        with self.assertRaises(ValueError):
            LOCAL_TTS.wav_content_type(200, b"<html>not audio</html>")

    def test_upstream_error_does_not_claim_wav(self):
        self.assertIsNone(LOCAL_TTS.wav_content_type(502, b"upstream failed"))

    def test_openai_models_endpoint_advertises_local_piper(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.server.server_port}/v1/models") as response:
            payload = json.load(response)
        self.assertEqual(response.status, 200)
        self.assertEqual(payload["data"][0]["id"], "piper")
        self.assertEqual(payload["data"][0]["created"], 0)

    def test_serializes_piper_synthesis_requests(self):
        active = 0
        maximum_active = 0
        guard = threading.Lock()
        original_fetch = LOCAL_TTS.fetch

        def fake_fetch(*_args, **_kwargs):
            nonlocal active, maximum_active
            with guard:
                active += 1
                maximum_active = max(maximum_active, active)
            time.sleep(0.02)
            with guard:
                active -= 1
            return 200, {"Content-Type": "audio/wav"}, b"RIFFdata"

        try:
            LOCAL_TTS.fetch = fake_fetch
            body = json.dumps({"input": "teste"}).encode("utf-8")
            threads = [threading.Thread(target=LOCAL_TTS.synthesize, args=(body,)) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        finally:
            LOCAL_TTS.fetch = original_fetch

        self.assertEqual(maximum_active, 1)


if __name__ == "__main__":
    unittest.main()
