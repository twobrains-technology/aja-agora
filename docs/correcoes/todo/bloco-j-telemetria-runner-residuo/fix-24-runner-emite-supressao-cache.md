---
id: FIX-24
titulo: "Runner emite supressões de guard e cache read/write como TurnEvent — telemetria completa"
status: todo
bloco: bloco-j-telemetria-runner-residuo
arquivos:
  - src/lib/agent/orchestrator/runner.ts (emitir TurnEvent de supressão + cache)
  - src/lib/agent/orchestrator/types.ts (variantes novas do TurnEvent)
  - src/lib/telemetry/turn-trace.ts (consumir — resolver os 6 TODO(bloco-g))
  - src/lib/telemetry/turn-trace.test.ts
rodada: 2026-06-11 (agregação de pendências pós-merge da onda G/H/I)
---

# FIX-24 — Fechar o contrato G×H: supressões e cache chegam ao turn-trace

## Palavras do operador

> "boa vamos agregar tudo pendente e fazer novos waves"

Pendência identificada na auditoria pós-merge de 2026-06-11: o ajuste pós-merge
previsto no manifesto do bloco H ("se precisar de evento novo do runner, stub
com TODO(bloco-g): e ajustar pós-merge") ficou órfão.

## Cenário exato

`turn-trace.ts` tem 6 `TODO(bloco-g)` (linhas 20, 50, 52, 54, 156 e
turn-trace.test.ts:92): os campos `suppressions[]`, `cacheRead` e `cacheWrite`
do trace ficam null/[] porque as informações vivem só em `console.log` do
runner (`[reveal-loop]`, `[post-closure]`, `[contract-gate]`, `[cache]` em
runner.ts) e nunca chegam ao consumidor de TurnEvents nos entry points.

## Root cause INVESTIGADO

Sequenciamento de paralelização (intencional, não bug): bloco H tinha proibição
dura de tocar runner.ts enquanto G o refatorava. G mergeou (PR #22), liberando o
ajuste — que não foi feito porque nenhum bloco o reivindicou. Provado por grep:
`grep -rn "TODO(bloco-g)" src/` retorna 6 ocorrências.

## Correção proposta

| O quê | Onde |
|---|---|
| Variantes novas de TurnEvent: `{ type: "suppression", artifactType, reason }` (emitida quando o artifact-guard suprime) e `{ type: "usage", cacheRead, cacheWrite }` (do providerMetadata já lido em runner.ts) | `types.ts`, `runner.ts` |
| `TurnTrace` consome as variantes e preenche `suppressions[]`/`cacheRead`/`cacheWrite`; remover os 6 TODO | `turn-trace.ts` |
| console.log existentes FICAM (cassettes/grep dependem deles) — o evento é adição, não substituição | — |

## Regressão exigida (3 camadas)

- **Camada 1**: turn-trace.test.ts — stream sintético com supressão e usage
  preenche os campos; sem os eventos, campos continuam null/[] (back-compat).
- **Camada 2**: cassettes existentes de supressão (reveal-loop, pos-fechamento)
  continuam verdes — os detectores grepam os console.log, que não mudam.
- **Camada 3**: sem mudança de comportamento do agent.
