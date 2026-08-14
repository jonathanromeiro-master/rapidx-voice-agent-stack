# Telephony

## Objetivo

Trocar o caminho principal de telefonia de Telnyx/Vobiz via Dograh para:

```text
Dograh
-> Asterisk ARI
-> PJSIP
-> BR DID
-> PSTN
```

Telnyx permanece como fallback durante a migração.

## Estado atual no repositório

- provider configurável em `TELEPHONY_PROVIDER`
- adapters implementados para `brdid_asterisk`, `telnyx` e `vobiz`
- `deploy/03-configure.sh` cria a config `provider: ari` no Dograh para BR DID/Asterisk
- `deploy/05-place-call.sh` dispara outbound via `POST /api/v1/telephony/initiate-call`
- `dashboard/lib/providers.js` lê ARI e cria o run no Dograh antes de originar o endpoint PJSIP

## Estado alvo

### Provider lógico

```text
TelephonyProvider
  - brdid_asterisk
  - telnyx
```

### Feature flag

```env
TELEPHONY_PROVIDER=brdid_asterisk
```

Valores aceitos durante a migração:

- `brdid_asterisk`
- `telnyx`

## Variáveis alvo

```env
BRDID_SIP_SERVER=
BRDID_SIP_USERNAME=
BRDID_SIP_PASSWORD=
BRDID_SIP_PORT=
BRDID_SIP_TRANSPORT=
BRDID_CALLER_ID=

ASTERISK_ARI_URL=
ASTERISK_ARI_USERNAME=
ASTERISK_ARI_PASSWORD=
ASTERISK_ARI_APP=
```

## Regras

- Dograh não deve conhecer detalhes do carrier final.
- BR DID não entra direto no domínio comercial.
- Asterisk concentra registro SIP, codec, roteamento, origem, hangup e eventos de chamada.
- rollback para Telnyx precisa continuar simples e reversível.

## Código impactado

| Arquivo | Situação |
|---|---|
| `deploy/03-configure.sh` | cria a configuração nativa `provider: ari` do Dograh e vincula caller ID e extensão inbound |
| `deploy/05-place-call.sh` | cria a chamada pelo Dograh, que entrega o endpoint PJSIP ao Asterisk com o workflow run correto |
| `dashboard/lib/providers.js` | lê o estado do Asterisk ARI e inicia outbound pelo Dograh, nunca por `ARI /channels` direto |
| `dashboard/public/assets/app.js` | UI de teste de chamadas precisa refletir BR DID/Asterisk e manter Telnyx como fallback |

## BR DID

Confirmações documentais já levantadas:

- BR DID trabalha com SIP
- o número virtual pode ser configurado em PABX IP e softphones compatíveis
- a plataforma informa endpoints SIP, credenciais e suporte de integração

O que ainda precisa de validação prática:

- formato real do host SIP
- política de registro
- codecs aceitos
- Caller ID efetivamente apresentado
- como o DID DDD 65 se comporta em outbound real

## Asterisk ARI

Dograh já documenta integração oficial com Asterisk ARI, incluindo:

- ARI por HTTP/WebSocket
- Stasis app
- `websocket_client.conf`
- uso de `ulaw`

Isso reduz risco de inventar uma ponte proprietária.

## Codec e áudio

Pipeline alvo:

```text
PSTN 8k
-> Asterisk
-> resample centralizado
-> STT local

TTS local
-> resample centralizado
-> Asterisk
-> PSTN 8k
```

Regra: não espalhar conversão de áudio em múltiplos pontos do código.
