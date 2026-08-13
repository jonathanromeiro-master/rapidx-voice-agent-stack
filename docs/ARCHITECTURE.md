# Architecture

## Resumo executivo

O repositório atual não é um discador outbound dedicado. Ele é uma base mais ampla:

- Dograh como orquestrador de voz
- dashboard Node.js multi-tenant
- telefonia atual via Dograh, com VoBiz legado e Telnyx mais recente
- pipeline atual Deepgram + Groq + Rumik
- deploy e troubleshooting já consolidados

A arquitetura alvo da Wayno é menor e mais específica: prospecção outbound por voz, single-tenant, com BR DID + SIP + Asterisk ARI e speech local.

## Arquitetura atual auditada

```text
Dashboard Node.js
  -> providers.js
  -> Dograh API
      -> Telephony config (Vobiz/Telnyx)
      -> STT Deepgram
      -> LLM Groq
      -> TTS Rumik
  -> Dograh workflows
  -> PSTN
```

### Componentes atuais

| Caminho | Responsabilidade atual | Dependências principais | Permanecer? | Migrar? |
|---|---|---|---|---|
| `deploy/01-deploy-dograh.sh` | sobe Dograh em VPS remota | Docker, Dograh installer, firewall, SSL | sim | adaptar baseline Oracle |
| `deploy/02-build-rumik-overlay.sh` | overlay de TTS Rumik no Dograh | Docker, imagem Dograh, Python | não como caminho principal | substituir por TTS local |
| `deploy/03-configure.sh` | cria telephony config, número, pipeline, workflow | Dograh API, Telnyx/Vobiz, Deepgram, Groq, Rumik | parcialmente | sim |
| `deploy/04-check-interrupts.sh` | valida barge-in | Dograh workflow | sim | ajustar para novo fluxo |
| `deploy/05-place-call.sh` | dispara chamada real de teste | Dograh API, telephony config ativa | sim | adaptar para BR DID/Asterisk |
| `deploy/06-deploy-dashboard.sh` | publica dashboard Node.js | Node, Docker, rsync | talvez | reavaliar |
| `dashboard/server.js` | produto multi-tenant com auth, billing, support, demo, HVAC e rotas de voz | Node, ws, PayU, Cal.com, providers | parcialmente | refatorar ou isolar subset |
| `dashboard/lib/providers.js` | abstração de STT/TTS/LLM/telephony no dashboard | Deepgram, Rumik, Groq, Gemini, Dograh | sim, como referência | ampliar |
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
4. A telefonia atual ainda não usa Asterisk ARI nem BR DID.
5. O speech atual está acoplado a Deepgram e Rumik no caminho operacional documentado.

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
- O repositório deixa de assumir produto multi-tenant como objetivo central desta linha de evolução.

## Riscos de migração

- o dashboard atual pode levar a mudanças desnecessárias se a migração tentar preservar toda a superfície SaaS
- a integração BR DID depende do formato real das credenciais SIP
- a qualidade de voz em PSTN narrowband pode degradar TTS e STT se o resampling for mal posicionado
- a compatibilidade exata do Dograh com STT local OpenAI-compatible precisa validação prática
- a VPS Oracle pode ser ARM64, o que afeta imagens, binários e performance
