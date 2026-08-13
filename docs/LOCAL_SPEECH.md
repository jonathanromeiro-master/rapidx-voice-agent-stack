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

- `deploy/03-configure.sh` configura `deepgram + groq + rumik`
- `dashboard/lib/providers.js` expõe Deepgram como STT fixo
- `dashboard/lib/providers.js` expõe Rumik como TTS principal
- o overlay local existente é específico de Rumik, não resolve o objetivo alvo

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

- desempenho real em ARM64, caso a VPS seja ARM
- melhor voz `pt_BR` para PSTN
- viabilidade de adapter OpenAI-compatible com o Dograh efetivamente instalado
