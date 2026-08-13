# ADR-002: Asterisk as telephony abstraction

## Status

Accepted

## Decision

Usar Asterisk ARI como fronteira de telefonia:

```text
Dograh
-> Asterisk ARI
-> SIP/PJSIP
-> carrier
```

## Why

- evita acoplamento direto do domínio ao carrier
- permite trocar BR DID por outro trunk SIP sem refatorar workflow, CRM, STT, TTS ou LLM
- Dograh já documenta integração oficial com Asterisk ARI

## Consequências

- Asterisk passa a concentrar registro SIP, codec e eventos
- precisamos operar e observar ARI/PJSIP com disciplina de infraestrutura
- a camada de aplicação deve depender de uma interface de telefonia, não de Telnyx nem BR DID
