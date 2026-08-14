# Local Speech

## Objetivo

Substituir o caminho principal atual:

```text
Deepgram STT
Rumik TTS
```

por:

```text
whisper.cpp STT
Piper TTS
```

rodando localmente na VPS Oracle.

## Estado atual do repositório

- `dashboard/lib/providers.js` já expõe `local_whisper`, `local_piper`, `deepgram` e `rumik`
- `deploy/03-configure.sh` já consegue configurar o pipeline BYOK usando:
  - `speaches` + `base_url` para STT local
  - `openai` + `base_url` para TTS local

Os adapters locais do dashboard usam os endpoints HTTP OpenAI-compatible em lote (`POST /v1/audio/transcriptions` e `POST /v1/audio/speech`). Eles não oferecem streaming de áudio bidirecional: o `wsConnect()` do Piper local responde como não suportado. A tela ativa "Talk to it" abre uma sessão WebRTC do workflow publicado no Dograh e requer `DOGRAH_EMBED_TOKEN`; ela não transforma os proxies locais em um serviço de streaming por si só.
  - `groq` ou `google` para LLM
- `services/local-stt` e `services/local-tts` agora existem como proxies locais com:
  - `/health`
  - timeout
  - logs estruturados
  - shutdown gracioso
  - superfície OpenAI-compatible para o restante da stack
- o overlay local existente continua útil como evidência de contrato `base_url`, mas não é mais o único caminho local no repositório

## STT alvo

### Baseline

- engine: `whisper.cpp`
- idioma operacional: `pt` / `pt-BR`
- execução: CPU
- modelos iniciais para benchmark: `base`, `small` e quantizados equivalentes

### Critérios

- RTF obrigatório menor que 1
- preferência por RTF até 0.5
- latência final e qualidade em conversa curta importam mais que benchmark acadêmico

### VAD

`whisper.cpp` já documenta suporte a VAD, incluindo:

- modelo VAD separado
- threshold
- padding
- duração mínima de fala e silêncio

Isso é suficiente para começar sem inventar um detector paralelo.

### Integração com Dograh

Dograh documenta suporte a transcriber OpenAI-compatible para modelos locais via Speaches, mas a documentação de configuração não deixa explícito um `base_url` customizado no tab de Transcriber do modo BYOK.

Conclusão de projeto:

- tratar `STT custom base_url` como suporte plausível, não comprovado nesta fase
- validar no código/instância real antes de assumir contrato estável
- se o contrato nativo não resolver, criar adapter local compatível com a interface aceita pelo Dograh em uso

## TTS alvo

### Baseline

- engine: `Piper`
- idioma: `pt_BR`
- modo preferido: serviço persistente com modelo pré-carregado

### Estado upstream

- o projeto atual de Piper migrou do repositório `rhasspy/piper` para `OHF-Voice/piper1-gpl`
- o CLI carrega o modelo a cada execução, então não serve como caminho principal de baixa latência
- o próprio upstream recomenda o web server para uso repetido

### Licença e vozes

- o engine atual do `piper1-gpl` está sob GPL-3.0
- as vozes precisam ser avaliadas separadamente por `MODEL_CARD`
- `pt_BR` existe na lista de idiomas suportados

Antes de escolher voz de produção:

- verificar licença do model card
- ouvir amostra
- testar pronúncia em telefonia
- medir TTFA e inteligibilidade em 8k narrowband

### Streaming

O upstream atual de Piper tem servidor HTTP e há sinais de trabalho em andamento para streaming incremental, mas isso não deve ser assumido como disponível e estável para este projeto sem validação prática.

Conclusão:

- começar com serviço persistente não-streaming
- tratar streaming incremental como otimização futura, não premissa
- não declarar browser live local como validado até que o workflow Dograh configurado com esses adapters passe por uma sessão real

## Serviços locais propostos

```text
services/local-stt
services/local-tts
```

Cada serviço deve ter:

- endpoint de health
- timeout
- logs estruturados
- shutdown gracioso
- isolamento local, sem exposição pública

## Implementação atual desta camada

### local-stt

- endpoint público interno esperado: `POST /v1/audio/transcriptions`
- endpoint de health: `GET /health`
- contrato com upstream real:
  - `STT_UPSTREAM_URL`
  - `STT_UPSTREAM_HEALTH_URL`
- deploy atual:
  - container Docker próprio
  - bind apenas em `127.0.0.1:8080`
  - upstream padrão: `http://rapidx-whisper-engine:8091/inference` na rede Docker privada `rapidx-local-speech`

### local-tts

- endpoint público interno esperado: `POST /v1/audio/speech`
- endpoint de health: `GET /health`
- contrato com upstream real:
  - `TTS_UPSTREAM_URL`
  - `TTS_UPSTREAM_HEALTH_URL`
- deploy atual:
  - container Docker próprio
  - bind apenas em `127.0.0.1:8090`
  - upstream padrão: `http://rapidx-piper-engine:5000/synthesize` na rede Docker privada `rapidx-local-speech`

### Smoke test Oracle ARM64 executado

Em 13 Aug 2026, na Oracle VPS ARM64, foram validados os quatro containers em
`rapidx-local-speech`:

- `rapidx-whisper-engine` com `whisper.cpp` `small`, CPU e quatro threads
- `rapidx-piper-engine` com a voz `pt_BR-faber-medium`
- `rapidx-local-stt` e `rapidx-local-tts`, publicados somente em loopback
- `POST /v1/audio/speech` retornou `Content-Type: audio/wav` e WAV RIFF válido (100908 bytes no smoke)
- o mesmo WAV retornou transcript não vazio por `POST /v1/audio/transcriptions`

O smoke reproduzível está em `services/smoke_test.py` e é executado pelo
deploy. Ele prova o caminho Piper -> proxy -> WAV -> proxy -> whisper.cpp; não
prova naturalidade, qualidade em PSTN, VAD, interrupção ou a integração do
adapter com o Dograh.

## Benchmarks obrigatórios

### STT

- accuracy
- RTF
- CPU
- RAM
- latência para transcript final

Vocabulário mínimo:

- Wayno
- captação
- prospecção
- faturamento
- esquadrias
- Gold
- Supreme
- energia solar
- instaladores
- Cuiabá
- Mato Grosso
- DDD
- Jonathan

### TTS

- naturalidade
- TTFA
- clareza em PSTN
- números
- horários
- nomes próprios
- interrupção

## O que ainda depende de validação

- melhor voz `pt_BR` para PSTN
- viabilidade de adapter OpenAI-compatible com o Dograh efetivamente instalado
