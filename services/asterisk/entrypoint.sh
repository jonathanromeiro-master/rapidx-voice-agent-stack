#!/usr/bin/env bash
set -euo pipefail
umask 077

required=(
  ASTERISK_ARI_USERNAME ASTERISK_ARI_PASSWORD ASTERISK_ARI_APP
  BRDID_SIP_SERVER BRDID_SIP_USERNAME BRDID_SIP_PASSWORD
  BRDID_SIP_PORT BRDID_SIP_TRANSPORT
)
for key in "${required[@]}"; do
  [ -n "${!key:-}" ] || { echo "missing required $key" >&2; exit 64; }
done

safe_line() {
  case "$1" in *$'\n'*|*$'\r'*) return 1;; esac
}
for key in "${required[@]}"; do
  safe_line "${!key}" || { echo "$key contains an invalid newline" >&2; exit 64; }
done

case "$ASTERISK_ARI_USERNAME" in *[!A-Za-z0-9_-]*|'') echo "ASTERISK_ARI_USERNAME is invalid" >&2; exit 64;; esac
case "$ASTERISK_ARI_APP" in *[!A-Za-z0-9_-]*|'') echo "ASTERISK_ARI_APP is invalid" >&2; exit 64;; esac
[ "$ASTERISK_ARI_USERNAME" = "$ASTERISK_ARI_APP" ] || { echo "ASTERISK_ARI_USERNAME must equal ASTERISK_ARI_APP" >&2; exit 64; }
case "$BRDID_SIP_SERVER" in *[!A-Za-z0-9.-]*|'') echo "BRDID_SIP_SERVER is invalid" >&2; exit 64;; esac
case "$BRDID_SIP_USERNAME" in *[!A-Za-z0-9._+-]*|'') echo "BRDID_SIP_USERNAME is invalid" >&2; exit 64;; esac
case "$BRDID_SIP_PORT" in *[!0-9]*|'') echo "BRDID_SIP_PORT is invalid" >&2; exit 64;; esac
case "$BRDID_SIP_TRANSPORT" in udp|tcp|tls) ;; *) echo "BRDID_SIP_TRANSPORT must be udp, tcp, or tls" >&2; exit 64;; esac

ws_url="${ASTERISK_DOGRAH_WS_URL:-ws://dograh-api-1:8000/api/v1/telephony/ws/ari}"
case "$ws_url" in ws://*|wss://*) ;; *) echo "ASTERISK_DOGRAH_WS_URL must use ws or wss" >&2; exit 64;; esac

sip_scheme=sip
[ "$BRDID_SIP_TRANSPORT" = tls ] && sip_scheme=sips

cat > /etc/asterisk/ari.conf <<EOF
[general]
enabled = yes

[$ASTERISK_ARI_APP]
type = user
read_only = no
password = $ASTERISK_ARI_PASSWORD
EOF

cat > /etc/asterisk/http.conf <<'EOF'
[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
EOF

cat > /etc/asterisk/websocket_client.conf <<EOF
[dograh]
type = websocket_client
uri = $ws_url
protocols = media
connection_type = per_call_config
connection_timeout = 2000
reconnect_interval = 1000
reconnect_attempts = 5
tls_enabled = $(case "$ws_url" in wss://*) printf yes;; *) printf no;; esac)
EOF

cat > /etc/asterisk/pjsip.conf <<EOF
[transport-$BRDID_SIP_TRANSPORT]
type = transport
protocol = $BRDID_SIP_TRANSPORT
bind = 0.0.0.0:5060

[brdid-auth]
type = auth
auth_type = userpass
username = $BRDID_SIP_USERNAME
password = $BRDID_SIP_PASSWORD

[brdid-aor]
type = aor
contact = $sip_scheme:$BRDID_SIP_SERVER:$BRDID_SIP_PORT

[brdid]
type = endpoint
transport = transport-$BRDID_SIP_TRANSPORT
context = from-brdid
disallow = all
allow = ulaw
allow = alaw
outbound_auth = brdid-auth
aors = brdid-aor
direct_media = no
force_rport = yes
rewrite_contact = yes
rtp_symmetric = yes
dtmf_mode = rfc4733

[brdid-identify]
type = identify
endpoint = brdid
match = $BRDID_SIP_SERVER

[brdid-registration]
type = registration
transport = transport-$BRDID_SIP_TRANSPORT
outbound_auth = brdid-auth
server_uri = $sip_scheme:$BRDID_SIP_SERVER:$BRDID_SIP_PORT
client_uri = $sip_scheme:$BRDID_SIP_USERNAME@$BRDID_SIP_SERVER
retry_interval = 60
forbidden_retry_interval = 600
expiration = 600
EOF

cat > /etc/asterisk/extensions.conf <<EOF
[from-brdid]
exten => _.,1,NoOp(BR DID inbound to \${EXTEN})
 same => n,Stasis($ASTERISK_ARI_APP)
 same => n,Hangup()
EOF

exec asterisk -fvvv
