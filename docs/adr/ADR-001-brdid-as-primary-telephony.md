# ADR-001: BR DID as primary telephony

## Status

Accepted

## Decision

BR DID será o provider de telefonia primário.

Número preferencial:

- DDD 65

Modo:

- PABX / SIP

## Why

- custo mensal mais baixo
- controle de DDD
- experiência prévia do operador
- hipótese operacional alinhada ao benchmark do celular DDD 65

## Unknowns

- performance real do DID VoIP DDD 65
- caller ID efetivo em outbound
- comportamento real do trunk/registro da BR DID

## Validation

- piloto controlado de chamadas
- confirmação de BINA
- medição de answer rate per dial
