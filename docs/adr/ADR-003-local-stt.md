# ADR-003: Local STT baseline

## Status

Accepted

## Decision

O baseline de STT local será `whisper.cpp`.

## Why

- CPU-only viável
- suporte maduro a execução local
- VAD documentado
- servidor HTTP estilo OpenAI disponível como base

## Constraints

- precisa funcionar em `pt-BR`
- precisa ter RTF menor que 1
- não deve depender de modelo `.en`

## Non-goals

- não estamos declarando `whisper.cpp` como escolha definitiva para sempre
- não estamos assumindo que `small` é automaticamente o melhor modelo operacional
