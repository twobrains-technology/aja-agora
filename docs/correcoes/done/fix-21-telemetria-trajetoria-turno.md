---
id: FIX-21
titulo: "Telemetria de trajetória por turno — gate, tools, supressões, latência, custo"
status: done
bloco: bloco-h-observabilidade-trajetoria
arquivos:
  - src/lib/telemetry/turn-trace.ts (novo)
  - src/lib/telemetry/turn-trace.test.ts (novo)
  - src/app/api/chat/route.ts (instrumenta consumo de TurnEvents — proxy do writer)
  - src/lib/whatsapp/adapter.ts (instrumenta consumo de TurnEvents — tap em consumeEvents)
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
commit: 087db2e
executado_em: 2026-06-11
---

> **Executado (2026-06-11, commit `087db2e`):** desvio do escopo planejado —
> a instrumentação WhatsApp ficou em `src/lib/whatsapp/adapter.ts`
> (`consumeEvents`, o funil ÚNICO de consumo de TurnEvents do canal), NÃO em
> `processor.ts` (que delega ao adapter e não vê TurnEvents). Web ficou em
> `route.ts` via proxy do `UIMessageStreamWriter` (entry point é dono do
> writer) — assim evita tocar `web/adapter.ts` (bloco E). Nenhum dos arquivos
> tocados está em `src/lib/agent/` (runner/builder = bloco G). `suppressed[]` e
> `cacheRead/cacheWrite` ficaram como `TODO(bloco-g)`: vivem só em `console.log`
> dentro do runner; o schema já reserva os campos. Persistência = log
> estruturado JSON (`[turn-trace] {…}`, 1 linha/turno), sink trocável por tabela
> Drizzle depois. Gate `test:unit` (Camadas 1+2) verde: 1329 passed.

# FIX-21 — Trajetória do agente observável em produção

## Palavras do operador

Sessão de arquitetura 2026-06-11: pesquisa (Vellum, MLflow) apontou
"tracing & replay" como gap nº2 — "vocês têm console.log espalhado e cassettes,
mas não observabilidade de produção da trajetória agregada". Kairo pediu pra
anotar as tasks da sessão.

## Cenário exato

Debugar conversa real hoje = grep manual nos logs do container atrás de
`[reveal-loop]`, `[gate-skip]`, `[cache]`, `[handoff]` espalhados. Não existe
visão por turno: qual gate disparou, quais tools rodaram, o que foi suprimido,
quanto custou (cache read/write), quanto demorou (SLA <3s do CLAUDE.md). Suporte
e tuning de prompt operam às cegas.

## Root cause INVESTIGADO

Não é bug — é ausência. Os dados JÁ transitam: `runAgentTurn` emite TurnEvents
tipados (text-delta, tool-call, artifact, gate, handoff, finish) e o
providerMetadata da Anthropic traz cache/usage (runner.ts:320-331). Ninguém
agrega. Os entry points (route.ts, processor.ts) consomem o generator e
descartam a meta-informação.

## Correção proposta

| O quê | Onde |
|---|---|
| `TurnTrace` — acumulador que consome TurnEvents + providerMetadata e fecha um registro por turno: `{ conversationId, channel, persona, gate, toolsCalled[], artifactsEmitted[], suppressed[], cacheRead, cacheWrite, durationMs, finishReason }` | `turn-trace.ts` (novo) |
| Persistência: tabela `turn_traces` (Drizzle) OU log estruturado JSON (1 linha/turno) — decidir na execução pelo mais barato; começar por log estruturado é aceitável | idem |
| Entry points instrumentam o loop de consumo (web SSE e WhatsApp) — SEM tocar runner.ts (bloco G) | `route.ts`, `processor.ts` |
| Supressões de guard: parse dos logs existentes nesta onda; evento dedicado vira `TODO(bloco-g):` | — |

## Regressão exigida

- **Camada 1**: `turn-trace.test.ts` — dado um stream sintético de TurnEvents,
  o trace fecha com os campos certos; turno com handoff/erro também fecha.
- **Camada 2**: não aplicável (não muda comportamento do agent) — mas adicionar
  assert num cassette existente de que a instrumentação não engole eventos
  (passthrough intacto) se o ponto de consumo for compartilhado.
- **Camada 3**: sem mudança.
