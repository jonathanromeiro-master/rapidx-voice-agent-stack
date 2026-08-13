# Wayno Outbound Voice Stack

Este repositório contém a base atual usada para agentes de voz com Dograh e um dashboard Node.js. O código existente nasceu como uma stack mais ampla, com foco multi-tenant e com caminhos prontos para Vobiz e Telnyx via Dograh.

O objetivo desta fase é migrar essa base, sem reescrita desnecessária, para o fluxo operacional interno da Wayno:

- telefonia principal via BR DID + SIP + Asterisk ARI
- Telnyx mantido como fallback temporário
- STT local na VPS Oracle
- TTS local na VPS Oracle
- Dograh preservado como orquestrador de voz enquanto fizer sentido
- operação single-tenant interna, não SaaS multi-tenant

## Estado atual auditado

- Repositório real: `rapidx-voice-agent-stack/`
- Linguagens: JavaScript/Node.js, Bash, Python, JSON
- Orquestrador de voz: Dograh
- Telefonia atual no repositório: Vobiz legado e Telnyx via Dograh
- STT atual no repositório: Deepgram
- TTS atual no repositório: Rumik
- LLM atual no repositório: Groq, com Gemini no dashboard
- Dashboard atual: produto Node.js multi-tenant com billing, suporte, admin e demos
- Workflows atuais: demos branded, não fluxo comercial outbound da Wayno

## O que permanece

- Dograh como base de workflow de voz, enquanto o novo caminho SIP for validado
- deploy scripts e conhecimento operacional já acumulado
- registro de providers do dashboard como referência de abstração
- histórico de troubleshooting já documentado

## O que muda

- BR DID passa a ser o provider primário
- Asterisk ARI vira a camada de abstração de telefonia
- Telnyx vira fallback
- Deepgram sai do caminho principal
- Rumik sai do caminho principal
- o fluxo comercial muda de demo/reception para prospecção outbound com cadência e pré-qualificação
- o escopo do produto deixa de mirar SaaS multi-tenant e passa a priorizar operação interna single-tenant

## Documentação desta migração

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/TELEPHONY.md](docs/TELEPHONY.md)
- [docs/LOCAL_SPEECH.md](docs/LOCAL_SPEECH.md)
- [docs/SALES_WORKFLOW.md](docs/SALES_WORKFLOW.md)
- [docs/CADENCE.md](docs/CADENCE.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/DEPLOYMENT_ORACLE.md](docs/DEPLOYMENT_ORACLE.md)
- [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)
- [docs/UPSTREAM_RESEARCH.md](docs/UPSTREAM_RESEARCH.md)
- [docs/MIGRATION_TELNYX_TO_BRDID.md](docs/MIGRATION_TELNYX_TO_BRDID.md)
- [docs/PILOT_PLAN.md](docs/PILOT_PLAN.md)
- [docs/adr/ADR-001-brdid-as-primary-telephony.md](docs/adr/ADR-001-brdid-as-primary-telephony.md)
- [docs/adr/ADR-002-asterisk-as-telephony-abstraction.md](docs/adr/ADR-002-asterisk-as-telephony-abstraction.md)
- [docs/adr/ADR-003-local-stt.md](docs/adr/ADR-003-local-stt.md)
- [docs/adr/ADR-004-local-tts.md](docs/adr/ADR-004-local-tts.md)

## Regras operacionais desta migração

- nenhuma chamada PSTN em volume antes de aprovação explícita
- toda mudança de telefonia deve preservar rollback para Telnyx enquanto o novo caminho não estabilizar
- segurança primeiro: ARI, SIP, STT e TTS locais devem ficar privados
- sem reescrita ampla do repositório sem evidência de necessidade

## Próximas fases

1. documentação e ADRs
2. auditoria real da VPS Oracle, sem interromper serviços existentes
3. abstração de telefonia e feature flag
4. integração Asterisk ARI + BR DID
5. STT local
6. TTS local
7. ajuste do fluxo comercial, cadência, métricas e testes

## Bloqueios externos já identificados

- push para `origin/main` falhou com `403` para o usuário local
- auditoria real da VPS depende de IP/SSH válidos
- teste de telefonia BR DID depende de DID DDD 65 e credenciais SIP
