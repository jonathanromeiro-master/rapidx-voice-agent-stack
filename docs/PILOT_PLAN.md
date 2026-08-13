# Pilot Plan

## Fase 1: ligação controlada

Ligar apenas para números controlados.

Validar:

- BINA apresentada
- DDD correto
- áudio de ida e volta
- STT aceitável
- TTS compreensível
- hangup
- CDR e logs

## Fase 2: amostra pequena

Escada operacional:

- 5 chamadas
- 10 chamadas
- 30 a 50 empresas

Sem escalar antes de validar qualidade.

## KPIs separados

### Answer rate per dial

```text
chamadas atendidas / chamadas realizadas
```

### Company reach rate

```text
empresas que atenderam ao menos uma vez / empresas trabalhadas
```

## Benchmarks de referência

- API4COM dinâmica: `41,33%`
- celular pessoal DDD65: `~38-39%`
- BR DID DDD65: a medir

## Gates operacionais de telefonia

- `>= 35%`: excelente sinal
- `30% a 35%`: investigar
- `25% a 30%`: alerta
- `< 25%`: reconsiderar origem/carrier

## Gate comercial

Medir:

```text
DECISION_MAKER_REACHED -> MEETING_BOOKED
```

Benchmark humano histórico informado:

- `~28-29%`

Não exigir isso do piloto inicial da IA.

## Critério de readiness

Pronto para piloto quando:

- SIP registrado
- ARI conectado
- outbound funcionando
- caller ID confirmado
- STT local funcionando
- TTS local funcionando
- barge-in funcionando
- state machine funcionando
- callback funcionando
- rollback para Telnyx funcionando
