# Observability

## Health mínimo

Precisamos de visibilidade para:

- orquestrador
- telefonia
- speech local
- banco
- fila de chamadas

## Endpoints implemented

- `GET /api/health`: dashboard readiness and selected providers
- `GET /api/health/dependencies`: database, queue, Dograh, ARI, SIP, STT, and TTS
- `GET /api/observability`: authenticated, tenant-scoped commercial metrics

O caminho final pode mudar, mas a cobertura não.

O endpoint detalhado faz probe HTTP apenas de STT/TTS locais. Dograh, ARI e
SIP aparecem como `configured` ou `not_configured` até que o operador autorize
a validação das credenciais. A fila aparece como `disabled` enquanto o auto-dial
não estiver implementado.

## Métricas obrigatórias

- prospects
- dials
- answered_calls
- answer_rate_per_dial
- companies_reached
- company_reach_rate
- attempts_per_company
- first_reach_attempt
- gatekeepers
- decision_makers_reached
- decision_maker_rate
- meetings_booked
- decision_maker_to_meeting_rate
- meeting_show_rate
- wrong_numbers
- do_not_call
- cadence_exhausted
- technical_failures
- avg_gatekeeper_duration
- avg_decision_maker_duration
- STT_RTF
- TTS_TTFA
- end_to_end_turn_latency

## Current metric evidence

`GET /api/observability` derives prospects, recorded commercial attempts,
contact rates, reach progression, final outcomes, and technical failures from
the active tenant's prospect and attempt rows. It returns
`carrierCdr: "not_recorded"`; a recorded attempt is not proof of a carrier dial
or answer. Duration, STT RTF, TTS TTFA, and end-to-end turn latency remain in
`unrecorded` until the runtime persists real measurements.

## Latência por turno

Registrar:

- `speech_end`
- `stt_final`
- `llm_first_token`
- `tts_first_audio`
- `audio_playback`

## Logs

Formato estruturado com:

- provider
- attempt_id
- prospect_id
- workflow_run_id
- telephony identifiers
- outcome
- latency
- technical error

## Gatilhos operacionais

- falhas técnicas consecutivas
- SIP unregistered
- ARI disconnected
- STT timeout
- TTS timeout
- answer rate abaixo das faixas esperadas

## Current cadence evidence

`GET /api/cadence/status` reports the active tenant's prospect-state totals and
the circuit-breaker state. Each attempt is persisted with an idempotency key,
outcome, timestamp, and technical-failure reason when applicable. This is
operational metadata only: provider call logs and PSTN results remain external
evidence until a carrier is configured and a permitted call is made.
