# Migration: Telnyx to BR DID

## Estado da implementação

```text
App / scripts
-> Dograh
-> configuração ARI
-> Asterisk
-> PJSIP
-> BR DID
-> PSTN
```

O adapter `brdid_asterisk`, o build ARM64 do Asterisk e os scripts de deploy já existem. O diagrama só se torna operacional depois de preencher SIP/ARI, criar a configuração no Dograh e validar uma chamada controlada; Telnyx permanece como rollback.

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

1. preservar o caminho Telnyx como rollback
2. manter a abstração de telefonia já presente no registry
3. usar o provider BR DID + Asterisk já implementado
4. validar com chamadas controladas após receber as credenciais
5. manter `brdid_asterisk` como default de ambiente
6. conservar rollback por flag

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
- Asterisk já é uma dependência explícita em `services/asterisk` e `deploy/07-deploy-asterisk.sh`; o container não deve iniciar sem as credenciais SIP/ARI
- BR DID depende de detalhes de credencial ainda não recebidos
- speech local pode alterar latência e turn-taking

## Ordem de mudanças

1. concluído no repositório: docs, registry, deploy Asterisk, speech local e defaults
2. pendente de credenciais: configuração Dograh, registro SIP e ARI
3. pendente de aprovação explícita: testes controlados, piloto e qualquer chamada PSTN
