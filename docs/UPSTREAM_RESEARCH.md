# Upstream Research

Data da pesquisa: 2026-08-13

## Dograh

- documentação oficial: https://docs.dograh.com/getting-started
- índice llms.txt: https://docs.dograh.com/llms.txt
- repositório oficial: https://github.com/dograh-hq/dograh
- releases: https://github.com/dograh-hq/dograh/releases

### Status confirmado

- release atual observada: `v1.45.0`
- a documentação oficial lista integração de telephony com `Asterisk ARI`
- a documentação oficial lista telephony providers como Twilio, Vonage, Plivo, Telnyx, Cloudonix, Vobiz, Asterisk ARI e custom provider
- a documentação oficial do modo BYOK explicita `optional base URL` para `LLM` e `Voice`
- a documentação de `Transcriber` cita suporte a `Speaches`, descrito como servidor OpenAI API-compatible para transcrição local

### Asterisk ARI status

O guia oficial do Dograh para Asterisk ARI confirma:

- uso de ARI por HTTP/WebSocket
- necessidade de `chan_websocket` e `res_websocket_client`
- setup de `ari.conf`, `websocket_client.conf` e dialplan
- recomendação de `ulaw`

Conclusão: o caminho Asterisk ARI é oficialmente suportado e reduz risco de integração inventada.

### OpenAI STT custom base_url status

Status: parcialmente confirmado, depende de validação prática.

Base factual:

- a página de `Transcriber` cita `Speaches`, servidor OpenAI-compatible para transcrição local
- o resumo do modo BYOK não explicita `optional base URL` no tab de Transcriber, ao contrário de LLM e Voice

Inferência de projeto:

- há evidência de suporte a um caminho OpenAI-compatible para STT local
- ainda não há evidência suficiente, nesta fase, de que a instância/release usada aqui expõe isso exatamente como um `base_url` configurável no fluxo atual do repositório

### OpenAI TTS custom base_url status

Status: confirmado na documentação de BYOK.

Base factual:

- a documentação de BYOK explicita `optional base URL` em `Voice`

Conclusão:

- TTS local por adapter OpenAI-compatible é um caminho suportado em princípio
- ainda precisa validação prática com o provider local escolhido

### Dograh commit/release utilizada neste repositório

Status: não pinado com segurança no código atual.

Achados:

- `deploy/01-deploy-dograh.sh` baixa o `setup_remote.sh` da branch `main`
- `docs/RUMIK-OVERLAY.md` cita historicamente `dograhai/dograh-api:v1.42.0`

Conclusão:

- o repositório não fixa de forma confiável uma release única do Dograh
- a release efetivamente implantada na VPS precisará ser confirmada no host real

## BR DID

Fontes usadas:

- https://brdid.com.br/perguntas-frequentes
- https://brdid.com.br/suporte/configuracoes
- https://brdid.com.br/suporte/configuracoes/tipos-de-configuracoes-dos-dids
- https://brdid.com.br/pabx

### Informações confirmadas

- BR DID opera com números virtuais via SIP
- a plataforma indica uso com PABX IP, softphones e equipamentos compatíveis com SIP
- a empresa afirma fornecer endpoints SIP, credenciais e suporte de integração
- o produto PABX em nuvem/ramais é parte da oferta

### O que depende de validação prática

- host SIP real
- política de autenticação/registro
- codecs aceitos
- caller ID efetivo em outbound
- diferença operacional entre DID, ramal e canais contratados
- disponibilidade específica de número DDD 65 no momento da contratação

## whisper.cpp

- repositório oficial: https://github.com/ggml-org/whisper.cpp
- releases: https://github.com/ggml-org/whisper.cpp/releases

### Status confirmado

- stable release observada: `v1.9.2`
- o projeto documenta `whisper-server` como servidor HTTP com API estilo OpenAI
- o projeto documenta VAD e parâmetros de limiar, silêncio, padding e overlap
- o projeto mantém foco em CPU-only e também suporta acelerações específicas por plataforma

### O que importa para este projeto

- baseline forte para STT local em CPU
- VAD nativo suficiente para benchmark inicial
- caminho servidor HTTP útil para encapsular STT local persistente

## Piper

- repositório antigo: https://github.com/rhasspy/piper
- repositório atual do engine: https://github.com/OHF-Voice/piper1-gpl
- releases: https://github.com/OHF-Voice/piper1-gpl/releases
- vozes: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md
- samples: https://rhasspy.github.io/piper-samples/
- HTTP API: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md

### Status confirmado

- o repositório antigo `rhasspy/piper` informa que o desenvolvimento mudou para `OHF-Voice/piper1-gpl`
- release atual observada no novo repositório: `v1.6.0`
- o engine atual está sob `GPL-3.0`
- `pt_BR` aparece na lista de idiomas suportados
- o upstream oferece servidor HTTP
- o próprio upstream recomenda servidor HTTP para uso repetido, em vez do CLI que recarrega o modelo a cada chamada

### O que depende de validação prática

- melhor voz `pt_BR` para telefonia narrowband
- TTFA real na VPS Oracle
- viabilidade de streaming progressivo no baseline escolhido
- licença específica da voz selecionada via `MODEL_CARD`

## Oracle Cloud

Sem acesso ao host nesta fase, a pesquisa foi limitada ao necessário para documentação.

O que precisa ser confirmado no host real:

- arquitetura `amd64` ou `arm64`
- imagens Docker compatíveis
- impacto de CPU para Dograh, Asterisk, whisper.cpp e Piper coexistindo
- layout de firewall/NSG já existente

## Itens que dependem de validação prática

- release real do Dograh implantada
- caminho exato de STT local compatível com a instância Dograh em uso
- codecs e registro BR DID
- performance real de whisper.cpp na Oracle VPS
- TTFA e qualidade da voz Piper em PSTN
- comportamento do caller ID DDD 65 em outbound
