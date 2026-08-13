# Observability

## Health mínimo

Precisamos de visibilidade para:

- orquestrador
- telefonia
- speech local
- banco
- fila de chamadas

## Endpoints desejados

- `/health/orchestrator`
- `/health/asterisk`
- `/health/sip`
- `/health/stt`
- `/health/tts`
- `/health/database`

O caminho final pode mudar, mas a cobertura não.

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
