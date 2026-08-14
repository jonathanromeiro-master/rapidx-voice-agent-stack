# Cadence

## Meta operacional

- máximo de 5 tentativas por empresa
- parar antes disso sempre que um outcome final for alcançado

## Janela inicial de piloto

Hipóteses iniciais:

- 10:00–11:00
- 15:00–16:30

Timezone operacional padrão esperado:

- `America/Cuiaba`

Isso ainda deve ser confirmado na configuração real.

## Regras

### Stop conditions

- `MEETING_BOOKED`
- `DISQUALIFIED_CAPACITY`
- `NOT_INTERESTED`
- `DO_NOT_CALL`
- `WRONG_NUMBER`
- `COMPANY_CLOSED`
- `CADENCE_EXHAUSTED`
- decisor alcançado com outcome final

### Callback explícito

Se houver instrução como:

> liga amanhã às 14h

o sistema precisa preencher `callback_at` com prioridade máxima.

### Falha técnica não consome tentativa comercial

Separar:

- `business_attempt`
- `technical_attempt`

Exemplos de falha técnica:

- SIP não registrou
- ARI desconectado
- Dograh indisponível
- STT indisponível
- TTS indisponível
- origem da chamada falhou antes de tocar PSTN

## State machine mínima

- `NEW`
- `SCHEDULED`
- `DIALING`
- `NO_ANSWER`
- `BUSY`
- `VOICEMAIL`
- `GATEKEEPER_REACHED`
- `CALLBACK_SCHEDULED`
- `DECISION_MAKER_REACHED`
- `QUALIFYING`
- `QUALIFIED`
- `MEETING_PENDING`
- `MEETING_BOOKED`
- `DISQUALIFIED_CAPACITY`
- `NOT_INTERESTED`
- `WRONG_NUMBER`
- `DO_NOT_CALL`
- `CADENCE_EXHAUSTED`
- `TECHNICAL_FAILURE`

## Circuit breaker

Pausar novas chamadas automaticamente em caso de:

- 3 a 5 falhas técnicas consecutivas
- SIP unregistered
- ARI disconnected
- STT latency fora de faixa
- TTS unavailable

## Concorrência inicial

```env
MAX_CONCURRENT_CALLS=1
```

Escalonar só após validação.

## Runtime implemented

The Studio stores tenant-scoped prospects and attempts. It does not schedule or
place calls automatically.

- `POST /api/prospects` requires an E.164 number, purpose, legal basis, and IANA timezone.
- `POST /api/prospects/attempts` requires an idempotency key. Technical failures also require a reason.
- `GET /api/prospects` and `GET /api/cadence/status` are resolved from the authenticated tenant session.
- Three consecutive technical failures open the per-tenant circuit breaker. The guarded paid-call endpoint returns `409 circuit_open` before contacting Dograh or a carrier.

Prospect rows, attempts, and audit events carry the tenant identity server side.
The browser cannot select a different tenant by sending an ID.
