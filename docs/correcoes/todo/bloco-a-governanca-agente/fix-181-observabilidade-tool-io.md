---
id: FIX-181
titulo: "Observabilidade de tool I/O (args + resultado por chamada) via onStepFinish — fecha o gap que tornou o 'Embracon' indeterminável"
status: todo
bloco: bloco-a-governanca-agente
arquivos:
  - src/lib/agent/orchestrator/runner.ts
rodada: 2026-07-01 — investigação da jornada da Mirella (conv 69a38af1, prod)
---

## Palavras do operador
> "temos que ter isso muito bem logado, para conseguirmos saber o que a IA alucinou para resolver."

## Cenário / Root cause INVESTIGADO (provado)
Na investigação da conv 69a38af1 em prod, NÃO deu pra provar se "Embracon" foi um grupo real
não-exibido ou um nome confabulado — porque **o sistema não loga os argumentos nem o resultado de
cada tool-call**, só um `turn-trace` agregado (quais tools, quantas, tempo). O único caminho de log
de erro (`runDiscovery` catch, `source:discovery`) só dispara em exceção lançada, não no retorno
`{error}` do fast-path. Resultado: "a IA inventou uma empresa ou não?" ficou **indeterminável** —
inaceitável num produto de confiança (Lei 5 de `~/.claude/reference/arquitetura-agentes-ia.md`).

## Correção proposta
| O quê | Onde | Primitivo oficial AI SDK |
|---|---|---|
| Logar `toolCalls` (args) + `toolResults` (output) por passo, estruturado | `onStepFinish({ toolCalls, toolResults })` no `streamText` do runner | [ai-sdk.dev/docs/agents](https://ai-sdk.dev/docs/agents) |

Cuidar de PII: mascarar CPF/celular/documentos no log (mesma família de dados sensíveis do gate
identify). Log estruturado (JSON) grepável, ligado ao `traceId`/`conversationId` do turn-trace
existente. Não logar em nível que vaze pro cliente.

## Regressão exigida
- Camada 1 (structural): asserta que `onStepFinish` está ligado no builder do streamText e que o log
  emitido contém tool name + input + output (com PII mascarada). Pode ser este o item mais barato do
  bloco — é fundação pra depurar todos os outros.
