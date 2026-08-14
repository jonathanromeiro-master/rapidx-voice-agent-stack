FROM python:3.12-slim

ARG PIPER_VOICE=pt_BR-faber-medium
ENV PIPER_VOICE=${PIPER_VOICE}

RUN python3 -m pip install --no-cache-dir "piper-tts[http]" && \
    python3 -m piper.download_voices "${PIPER_VOICE}"

EXPOSE 5000

CMD python3 -m piper.http_server --host 0.0.0.0 --port 5000 -m "${PIPER_VOICE}"
