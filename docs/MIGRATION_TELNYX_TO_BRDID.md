# Migration: Telnyx to BR DID

## Current

```text
App / scripts
-> Dograh
-> Telnyx
-> PSTN
```

## Target

```text
App / Dograh
-> Asterisk ARI
-> PJSIP
-> BR DID
-> PSTN
```

## Objetivo da migração

- BR DID como provider primário
- Telnyx como fallback temporário
- acoplamento reduzido ao carrier

## Pontos de código afetados

- `deploy/03-configure.sh`
- `deploy/05-place-call.sh`
- `dashboard/lib/providers.js`
- `dashboard/public/assets/app.js`
- `dashboard/test/providers.test.js`
- `.env.example`

## Variáveis antigas relevantes

```env
TELEPHONY_PROVIDER=telnyx
TELNYX_API_KEY=
TELNYX_NUMBER=
TELNYX_CONNECTION_ID=
DOGRAH_TELEPHONY_CONFIG_ID=
DOGRAH_PHONE_NUMBER_ID=
```

## Variáveis novas

```env
TELEPHONY_PROVIDER=brdid_asterisk

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

LOCAL_STT_BASE_URL=
LOCAL_STT_MODEL=
LOCAL_STT_LANGUAGE=pt

LOCAL_TTS_BASE_URL=
LOCAL_TTS_VOICE=
```

## Estratégia

1. preservar o caminho Telnyx
2. introduzir abstração explícita de telefonia
3. adicionar provider BR DID + Asterisk
4. validar com chamadas controladas
5. inverter default para BR DID
6. manter rollback por flag

## Rollback

```env
TELEPHONY_PROVIDER=telnyx
```

Regra: nenhuma mudança irreversível de banco ou workflow deve impedir esse rollback durante a fase de migração.

## Testes necessários

- status do provider ativo
- originate outbound
- ringing
- answered
- busy
- no answer
- hangup
- erro técnico antes da PSTN não consome tentativa comercial

## Riscos principais

- o dashboard hoje assume muito do produto multi-tenant
- o repositório ainda não tem Asterisk como dependência explícita
- BR DID depende de detalhes de credencial ainda não recebidos
- speech local pode alterar latência e turn-taking

## Ordem de mudanças

1. docs e ADRs
2. VPS audit
3. abstração de provider
4. Asterisk ARI
5. BR DID config
6. STT local
7. TTS local
8. state machine/cadência
9. testes controlados
10. piloto
