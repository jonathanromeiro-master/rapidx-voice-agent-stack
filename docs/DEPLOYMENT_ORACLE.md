# Deployment on Oracle VPS

## Objetivo

Rodar:

- Dograh
- Asterisk
- STT local
- TTS local
- componentes auxiliares mínimos

na VPS Oracle da Wayno.

## Premissas que ainda precisam ser verificadas in loco

- arquitetura real: `amd64` ou `arm64`
- CPU/RAM/disco disponíveis
- Docker e Docker Compose instalados
- serviços já existentes em execução
- portas já ocupadas

## Comandos obrigatórios antes de qualquer mudança

```bash
uname -m
lscpu
free -h
df -h
docker version
docker compose version
ss -lntup
docker ps -a
docker ps
systemctl --type=service --state=running
```

## Regra operacional

Não sobrescrever configuração existente sem backup.

## Resultado esperado desta fase

Criar `docs/VPS_CURRENT_STATE.md` com:

- arquitetura
- containers existentes
- serviços ativos
- portas em uso
- riscos de colisão

## Layout alvo, sujeito à auditoria real

```text
Oracle VPS
  -> Docker network privada
  -> Dograh
  -> Asterisk
  -> local-stt
  -> local-tts
  -> opcionalmente dashboard reduzido
```

## Implementação atual já adicionada ao repositório

### SSH e usuário remoto

- os scripts de deploy agora aceitam `SSH_USER`
- default operacional atual: `ubuntu`

### Novo passo de deploy local speech

O repositório agora contém:

```text
deploy/02-deploy-local-speech.sh
```

Esse script:

- envia `services/local-stt` e `services/local-tts` para a VPS
- builda duas imagens Docker locais
- sobe:
  - `rapidx-local-stt`
  - `rapidx-local-tts`
- publica apenas:
  - `127.0.0.1:8080`
  - `127.0.0.1:8090`

### Variáveis novas de infraestrutura

```env
STT_UPSTREAM_URL=http://rapidx-whisper-engine:8091/inference
STT_UPSTREAM_HEALTH_URL=http://rapidx-whisper-engine:8091/
TTS_UPSTREAM_URL=http://rapidx-piper-engine:5000/synthesize
TTS_UPSTREAM_HEALTH_URL=http://rapidx-piper-engine:5000/info
LOCAL_SPEECH_TIMEOUT_SECONDS=30
```

Os quatro containers usam a rede Docker privada `rapidx-local-speech`. Esses nomes de host resolvem apenas dentro dessa rede; externamente, apenas os proxies em `127.0.0.1:8080` e `127.0.0.1:8090` devem ser consumidos.

### Estado real desta fase

- os motores `whisper.cpp` `small` e Piper `pt_BR-faber-medium` foram buildados
  e iniciados na Oracle ARM64 em 13 Aug 2026
- o round-trip TTS -> WAV -> STT foi validado por `services/smoke_test.py`
- a rede privada `rapidx-local-speech` conecta os motores, proxies e, quando
  presente, o container `dograh-api`
- Dograh esta saudavel e publicado em `https://163-176-48-94.sslip.io`; o
  OpenAPI publico respondeu `200` em 13 Aug 2026
- o Caddy ja existente continua dono de `80/443` e encaminha Dograh para o
  nginx interno em `127.0.0.1:18443`; ARI, STT e TTS nao receberam portas publicas
- a imagem ARM64 `rapidx-asterisk:22.10.1` foi compilada e os modulos ARI e
  WebSocket foram validados com `--network none`
- o dashboard esta publicado em `https://studio.163-176-48-94.sslip.io`; o
  container escuta somente em `127.0.0.1:8787` e Caddy responde por TLS
- Asterisk e BR DID ainda nao foram iniciados: faltam as credenciais SIP/ARI e
  o formato de destino fornecido pelo carrier

## Dependências externas para continuar

Para concluir a configuracao real, ainda sao necessarios:

- credenciais SIP do BR DID e a extensao inbound exata recebida pelo Asterisk
- usuario e senha ARI dedicados, com o usuario igual a `ASTERISK_ARI_APP`
- template de destino outbound do carrier (`ASTERISK_ARI_ENDPOINT_TEMPLATE`)
- credenciais do Dograh e pelo menos uma chave do LLM para configurar o pipeline
- `DOGRAH_EMBED_TOKEN` do workflow publicado para liberar a sessão WebRTC do browser; o token fica somente no servidor
