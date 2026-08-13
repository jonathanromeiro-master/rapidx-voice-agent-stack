# ADR-004: Local TTS baseline

## Status

Accepted

## Decision

O baseline de TTS local será `Piper`, com voz `pt_BR` a ser definida após benchmark.

## Why

- execução local
- serviço persistente disponível
- suporte a `pt_BR`
- caminho simples para reduzir custo recorrente

## Constraints

- escolher voz só após revisar `MODEL_CARD`
- medir TTFA e inteligibilidade em PSTN
- preferir processo persistente com modelo pré-carregado

## Consequências

- a primeira versão pode não ter streaming progressivo real
- a voz selecionada pode precisar troca depois do teste em telefonia
