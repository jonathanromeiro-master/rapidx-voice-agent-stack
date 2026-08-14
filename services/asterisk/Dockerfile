FROM debian:bookworm-slim

ARG ASTERISK_VERSION=22.10.1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl pkg-config \
      libedit-dev libjansson-dev libncurses-dev libsqlite3-dev libssl-dev libxml2-dev uuid-dev \
 && curl -fsSLO "https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz" \
 && tar -xzf "asterisk-${ASTERISK_VERSION}.tar.gz" \
 && cd "asterisk-${ASTERISK_VERSION}" \
 && ./configure --with-pjproject-bundled \
 && make menuselect.makeopts \
 && menuselect/menuselect --enable chan_websocket --enable res_websocket_client \
      --enable res_ari --enable res_ari_events --enable res_http_websocket menuselect.makeopts \
 && make -j"$(nproc)" \
 && make install \
 && make samples \
 && cd / \
 && rm -rf "asterisk-${ASTERISK_VERSION}" "asterisk-${ASTERISK_VERSION}.tar.gz" /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/rapidx-asterisk-entrypoint
RUN chmod 0755 /usr/local/bin/rapidx-asterisk-entrypoint

EXPOSE 5060/udp 5060/tcp 8088/tcp
ENTRYPOINT ["/usr/local/bin/rapidx-asterisk-entrypoint"]
