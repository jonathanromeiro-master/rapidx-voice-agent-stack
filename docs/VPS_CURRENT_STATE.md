# VPS Current State

Data da auditoria: 2026-08-13

Host auditado:

- IP: `163.176.48.94`
- usuário: `ubuntu`

## Resumo

- arquitetura: `arm64` / `aarch64`
- CPU: 4 OCPU, `Neoverse-N1`
- RAM: 23 GiB total, 3.6 GiB em uso, 19 GiB disponíveis
- swap: ausente
- disco raiz: 146 GiB, 48 GiB usados, 98 GiB livres
- Docker: `29.5.2`
- Docker Compose: `v5.1.4`

Conclusão operacional imediata:

- a máquina é forte o suficiente para piloto com 1 chamada concorrente
- é ARM64, então todas as imagens/binários novos precisam ser compatíveis
- existe carga e exposição prévia significativa; não é host vazio

## Atualizacao de implantacao, 2026-08-13

- Dograh esta saudavel em `https://163-176-48-94.sslip.io`; a rota publica
  `/api/v1/openapi.json` respondeu `200` por TLS.
- O Caddy existente continua atendendo `80/443`. Dograh usa nginx interno em
  `127.0.0.1:18443`; Postgres, Redis, MinIO, ARI e motores de fala nao foram
  publicados publicamente.
- Os containers de speech local estao saudaveis na rede `rapidx-local-speech`.
- A imagem privada `rapidx-asterisk:22.10.1` existe e os modulos ARI/WebSocket
  foram carregados em teste isolado sem rede. O container Asterisk nao esta em
  execucao porque as credenciais BR DID e ARI continuam ausentes.
- O dashboard esta em `https://studio.163-176-48-94.sslip.io`; o container
  `rapidx-voice` publica apenas `127.0.0.1:8787` e o Caddy fornece TLS.

## Portas em escuta

### Públicas

- `22/tcp` SSH
- `80/tcp` Caddy
- `443/tcp` Caddy
- `3100/tcp` `docker-server-1`
- `8081/tcp` `automarketing_crm-frontend-1`
- `8082/tcp` `akaunting-akaunting.nginx-1`
- `5432/tcp` `docker-db-1`
- `8899/tcp` processo `python3`

### Locais

- `127.0.0.1:2019` Caddy admin
- `127.0.0.1:3307` proxy para MySQL container

### Observação crítica

`5432/tcp` está publicado em `0.0.0.0`, portanto o Postgres atual está exposto na interface pública da VPS.

## Containers existentes

### Em execução

| Nome | Imagem | Portas |
|---|---|---|
| `docker-server-1` | `docker-server` | `3100:3100` |
| `automarketing_crm-frontend-1` | `crm-custom:stable` | `8081:8080` |
| `docker-db-1` | `postgres:17-alpine` | `5432:5432` |
| `akaunting-akaunting.nginx-1` | `akaunting-akaunting.nginx` | `8082:80` |
| `akaunting-akaunting.php-1` | `akaunting-akaunting.php` | interno |
| `oracle-caddy-caddy-1` | `caddy:2.10-alpine` | `80`, `443` |
| `akaunting-akaunting.mysql-1` | `mysql` | `127.0.0.1:3307->3306` |
| `akaunting-openbao-1` | `openbao/openbao:latest` | `8200/tcp` interno |
| `automarketing_crm-cron-1` | `mcuadros/ofelia:latest` | interno |
| `automarketing_crm-websocket-1` | `crm-custom:stable` | interno |
| `automarketing_crm-backend-1` | `crm-custom:stable` | interno |
| `automarketing_crm-queue-long-1` | `crm-custom:stable` | interno |
| `automarketing_crm-scheduler-1` | `crm-custom:stable` | interno |
| `automarketing_crm-queue-short-1` | `crm-custom:stable` | interno |
| `automarketing_crm-redis-cache-1` | `redis:8.6-alpine` | interno |
| `automarketing_crm-redis-queue-1` | `redis:8.6-alpine` | interno |
| `automarketing_crm-db-1` | `mariadb:11.8` | interno |

### Exited

| Nome | Imagem | Estado |
|---|---|---|
| `automarketing_crm-configurator-1` | `crm-custom:stable` | exited |

## Serviços systemd em execução

Relevantes:

- `docker.service`
- `containerd.service`
- `ssh.service`
- `paperclip-trello-bridge.service`
- `unified-monitoring-agent.service`
- `oracle-cloud-agent`

## Riscos de colisão

1. A VPS já hospeda múltiplos stacks ativos.
2. `80` e `443` já estão ocupadas por Caddy.
3. `5432` já está publicado publicamente.
4. Existe processo Python escutando em `8899`.
5. Não há swap configurado.

## Implicações para a stack de voz

- não assumir host limpo
- não publicar Dograh, ARI, STT ou TTS em portas públicas novas sem desenho explícito
- preferir nova rede Docker isolada
- reutilizar reverse proxy existente só depois de mapear a configuração atual dele
- evitar qualquer mudança em `80/443` até entender como o Caddy atual está roteando

## Lacunas ainda abertas

- não foi identificado ainda onde os arquivos Compose atuais vivem
- `ufw` não está instalado, então o controle de borda deve estar fora dele ou ausente
- ainda não foi auditado o conteúdo do Caddy atual
- ainda não foi auditado o layout de diretórios dos serviços existentes

## Atualização verificada em 2026-08-13

- Dograh está saudável em `https://163-176-48-94.sslip.io`; o OpenAPI público respondeu `200`.
- O Studio está saudável em `https://studio.163-176-48-94.sslip.io`; o container `rapidx-voice` está `running` com `0` reinícios e escuta apenas em `127.0.0.1:8787`.
- Caddy existente continua dono de `80/443`; Dograh usa nginx interno em `127.0.0.1:18443`.
- STT/TTS locais e a rede privada `rapidx-local-speech` estão em execução. O smoke test WAV para STT foi aprovado.
- `GET /api/health/dependencies` do Studio retornou banco, STT e TTS como `healthy`; a fila está `disabled` e Dograh, ARI e SIP estão `not_configured` até o preenchimento completo das credenciais.
- A imagem ARM64 do Asterisk foi compilada, mas o container Asterisk e o trunk BR DID permanecem desligados até haver credenciais SIP/ARI e o template de destino do carrier.
- O Studio contém o runtime de cadência por tenant. Ele não agenda nem origina chamadas automaticamente; nenhuma chamada PSTN ou campanha foi executada.
