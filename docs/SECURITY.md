# Security

## Prioridade

Segurança vem antes de escala e antes de conveniência operacional.

## Regras de exposição

Não publicar diretamente na internet, salvo necessidade comprovada:

- Postgres 5432
- Redis 6379
- Dograh API interna
- Dograh UI interna
- Asterisk ARI
- STT local
- TTS local

## Controles mínimos

- Docker network privada
- binding em `127.0.0.1` quando possível
- firewall da VPS
- Oracle NSG/Security List
- segredos apenas em `.env`/secret store

## SIP e ARI

- senhas fortes
- ARI privado
- não expor `8088` publicamente
- ACL quando possível
- fail2ban/rate limit
- registro SIP restrito ao necessário

## Dograh

Depois da configuração inicial:

```env
ENABLE_SIGNUP=false
ENABLE_TELEMETRY=false
```

## Speech local

Se houver endpoints OpenAI-compatible internos:

- ouvir apenas na rede local ou docker network
- nunca publicar externamente

## Segredos

- não commitar `.env`
- não registrar senha SIP ou chave ARI em docs versionadas
- rotacionar qualquer segredo que tenha vazado para chat, log ou screenshot

## Estado atual do repositório

O dashboard existente ainda carrega premissas multi-tenant e billing. Isso aumenta a superfície de ataque e deve ser tratado como débito de escopo para o caso de uso interno.
