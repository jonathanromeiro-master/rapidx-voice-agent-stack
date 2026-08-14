FROM debian:bookworm-slim

ARG WHISPER_VERSION=v1.9.2
ARG WHISPER_MODEL=small
ARG WHISPER_THREADS=4

ENV WHISPER_VERSION=${WHISPER_VERSION}
ENV WHISPER_MODEL=${WHISPER_MODEL}
ENV WHISPER_THREADS=${WHISPER_THREADS}

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git curl ffmpeg pkg-config ca-certificates \
    libavformat-dev libavcodec-dev libavutil-dev libswresample-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt

RUN git clone --depth 1 --branch "${WHISPER_VERSION}" https://github.com/ggml-org/whisper.cpp.git && \
    cd /opt/whisper.cpp && \
    cmake -B build -DWHISPER_COMMON_FFMPEG=ON && \
    cmake --build build -j "${WHISPER_THREADS}" --config Release && \
    ./models/download-ggml-model.sh "${WHISPER_MODEL}"

EXPOSE 8091

CMD /bin/sh -lc "/opt/whisper.cpp/build/bin/whisper-server --host 0.0.0.0 --port 8091 --convert -t ${WHISPER_THREADS} -l pt -m /opt/whisper.cpp/models/ggml-${WHISPER_MODEL}.bin"
