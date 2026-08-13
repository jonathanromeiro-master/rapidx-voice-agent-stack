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

## Dependências externas para continuar

Para executar a auditoria real da VPS, ainda serão necessários:

- IP/SSH válidos
- credenciais com acesso suficiente
