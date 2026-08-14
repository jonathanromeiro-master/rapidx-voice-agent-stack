#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest


APP_PATH = pathlib.Path(__file__).parent / "local-tts" / "app.py"
SPEC = importlib.util.spec_from_file_location("local_tts", APP_PATH)
LOCAL_TTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LOCAL_TTS)


class LocalTtsContractTest(unittest.TestCase):
    def test_successful_wav_is_labeled_as_audio_wav(self):
        self.assertEqual(LOCAL_TTS.wav_content_type(200, b"RIFFdata",), "audio/wav")

    def test_successful_non_wav_is_rejected(self):
        with self.assertRaises(ValueError):
            LOCAL_TTS.wav_content_type(200, b"<html>not audio</html>")

    def test_upstream_error_does_not_claim_wav(self):
        self.assertIsNone(LOCAL_TTS.wav_content_type(502, b"upstream failed"))


if __name__ == "__main__":
    unittest.main()
