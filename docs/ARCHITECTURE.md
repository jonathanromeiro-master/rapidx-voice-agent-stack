# Architecture

## Resumo executivo

O repositório atual não é um discador outbound dedicado. Ele é uma base mais ampla:

- Dograh como orquestrador de voz
- dashboard Node.js multi-tenant
- telefonia via Dograh, com BR DID + Asterisk ARI implementado e VoBiz/Telnyx legados
- pipeline configurável, com defaults locais `local_whisper` + Groq/Gemini + `local_piper`
- deploy e troubleshooting já consolidados

O perfil operacional da Wayno usa BR DID + SIP + Asterisk ARI e speech local. O código ainda preserva a superfície multi-tenant e os adapters legados como fallback; isso não prova uma chamada PSTN ponta a ponta.

## Arquitetura atual auditada

```text
Dashboard Node.js
  -> providers.js
  -> Dograh API
      -> Telephony config (BR DID/Asterisk, Telnyx ou VoBiz)
      -> STT local OpenAI-compatible ou Deepgram
      -> LLM Groq
      -> TTS local OpenAI-compatible ou Rumik
  -> Dograh workflows
  -> PSTN
```

### Componentes atuais

| Caminho | Responsabilidade atual | Dependências principais | Permanecer? | Migrar? |
|---|---|---|---|---|
| `deploy/01-deploy-dograh.sh` | sobe Dograh em VPS remota | Docker, Dograh installer, firewall, SSL | sim | adaptar baseline Oracle |
| `deploy/02-build-rumik-overlay.sh` | overlay opcional de TTS Rumik no Dograh | Docker, imagem Dograh, Python | somente fallback | não é o default local |
| `deploy/03-configure.sh` | cria config BR DID/Asterisk, número, pipeline e workflow | Dograh API, Asterisk ARI, speech local, Groq/Gemini | sim, com credenciais | validar na instância |
| `deploy/04-check-interrupts.sh` | valida barge-in | Dograh workflow | sim | ajustar para novo fluxo |
| `deploy/05-place-call.sh` | dispara chamada real de teste | Dograh API, telephony config ativa | sim | adaptar para BR DID/Asterisk |
| `deploy/06-deploy-dashboard.sh` | publica dashboard Node.js | Node, Docker, rsync | talvez | reavaliar |
| `dashboard/server.js` | produto multi-tenant com auth, billing, support, demo, HVAC e rotas de voz | Node, ws, PayU, Cal.com, providers | parcialmente | refatorar ou isolar subset |
| `dashboard/lib/providers.js` | abstração de STT/TTS/LLM/telephony no dashboard | local Whisper/Piper, Deepgram/Rumik, Groq/Gemini, BR DID/Asterisk, Dograh | sim | validar integrações externas |
| `workflows/*.json` | workflows demo de voz | Dograh builder | como referência | substituir conteúdo comercial |
| `rumik-overlay-local/` | patch de provider TTS no Dograh | Python, imagem Dograh | não como principal | pode ser removido depois |
| `docs/*.md` | troubleshooting e contexto da stack atual | docs manuais | sim | atualizar |

## Serviços identificados

| Área | Estado atual |
|---|---|
| Linguagem principal | JavaScript/Node.js |
| Framework backend | sem framework, `http` nativo |
| Frontend | estático + JS |
| Containers | Dograh e dashboard dockerizado |
| Banco do dashboard | JSON local em `data/` |
| Banco do Dograh | Postgres interno do Dograh |
| Filas/scheduler | não no dashboard; Dograh usa serviços internos |
| CRM | não há CRM operacional dedicado aqui |
| Calendar | Cal.com no vertical HVAC |
| Webhooks | PayU callbacks e webhooks do Dograh/providers |
| Observabilidade | `GET /api/health`, logs, docs de troubleshooting |
| Testes | `dashboard/test/*.test.js` via `node --test` |

## Achados principais

1. O repositório foi desenhado como produto maior que a necessidade atual da Wayno.
2. O núcleo mais reaproveitável hoje é Dograh + scripts de deploy + conhecimento operacional de provider.
3. O dashboard mistura muita lógica SaaS com uma fatia menor realmente útil para outbound interno.
4. O adapter `brdid_asterisk`, os scripts de deploy Asterisk e os defaults locais já existem; sem SIP/ARI não há prova de operação ponta a ponta.
5. O caminho local OpenAI-compatible para STT/TTS já está no repositório. Deepgram e Rumik continuam adapters de fallback, e a compatibilidade prática desse pipeline com o Dograh instalado ainda requer validação.

## Arquitetura alvo

```text
Lista de prospects
  -> Prospecting orchestrator
  -> Dograh
      -> STT local
      -> LLM externo
      -> TTS local
  -> Asterisk ARI
  -> PJSIP
  -> BR DID
  -> PSTN
```

## Decisão estrutural

- Dograh continua sendo o orquestrador conversacional.
- Asterisk passa a ser a fronteira de telefonia.
- BR DID passa a ser o carrier prioritário.
- STT e TTS saem da nuvem e vão para serviços locais na VPS.
- A implantação interna pode usar um único workspace, mas o código multi-tenant continua suportado e não deve ser removido sem uma decisão separada.

## Riscos de migração

- o dashboard atual pode levar a mudanças desnecessárias se a migração tentar preservar toda a superfície SaaS
- a integração BR DID depende do formato real das credenciais SIP
- a qualidade de voz em PSTN narrowband pode degradar TTS e STT se o resampling for mal posicionado
- a compatibilidade exata do Dograh com STT local OpenAI-compatible precisa validação prática
- a VPS Oracle pode ser ARM64, o que afeta imagens, binários e performance
