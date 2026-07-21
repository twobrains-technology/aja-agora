---
id: FIX-355
titulo: "Flag AI_RUNTIME + dispatcher no runTurn + deps LangChain"
status: done
bloco: bloco-fundacao-langgraph
arquivos:
  - package.json
  - src/lib/llm/runtime.ts
  - src/lib/agent/orchestrator/index.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 0
commit: 71b5358f
executado_em: 2026-07-20
---

## Palavras do operador
"que a gente simplesmente troque de um para o outro… eu posso chavear entre o LangGraph e o Vercel AI".

## Cenário
Com `AI_RUNTIME=langgraph`, os turnos de IA devem rotear pro novo runtime; com `AI_RUNTIME=vercel`
(ou unset — default), comportamento IDÊNTICO ao de hoje. Uma conversa usa UM runtime do início ao fim.

## Root cause (investigado)
- Não existe flag `AI_RUNTIME` (grep negativo no repo).
- `runTurn()` (`src/lib/agent/orchestrator/index.ts:296`) é o corpo único `AsyncGenerator<TurnEvent>`
  que os dois canais consomem (web `src/lib/web/adapter.ts`, WhatsApp `src/lib/whatsapp/adapter.ts`).
- `index.ts` faz chamadas recursivas `yield* runTurn(...)` internas (directives: scarcity, decision,
  reco-consent, simulator-dial, advance-to-contract) — essas precisam ficar no MESMO runtime da conversa
  (fix ALTA-1 do crítico: sem isso, uma conversa langgraph misturaria cerimônias vercel).
- Padrão de env estabelecido: `isSimulatorEnabled` em `src/lib/utils/env.ts:12` (lê `process.env.X`,
  trata string vazia como ausente, default permissivo).

## Correção proposta
| O quê | Onde |
|---|---|
| `runtimeFlavor()` → `"vercel" | "langgraph"`, lê `process.env.AI_RUNTIME?.trim().toLowerCase()`, default `"vercel"` (espelha `utils/env.ts`) | `src/lib/llm/runtime.ts` (novo) |
| Renomear MECANICAMENTE o corpo atual de `runTurn` → `runTurnVercel` (zero mudança de comportamento) | `orchestrator/index.ts` |
| `runTurn` vira dispatcher fino: lê a flag e delega a `runTurnVercel` ou `runTurnLangGraph` (import do módulo novo — stub por enquanto, ligado no FIX-358). Manter a assinatura `(input: TurnInput): AsyncGenerator<TurnEvent>` | `orchestrator/index.ts` |
| Chamadas recursivas internas: dentro de `runTurnVercel`, os `yield* runTurn` viram `yield* runTurnVercel` (mantém a conversa no mesmo runtime; não re-dispatcha por turno) | `orchestrator/index.ts` |
| Instalar deps: `@langchain/langgraph@^1 @langchain/anthropic@^1 @langchain/core@^1` (peer zod ^4 OK) via pnpm no container | `package.json` |

## Critério de aceitação (o que o juiz checa)
- `pnpm build` verde; `pnpm test:unit` verde (Vercel intacto).
- Teste do dispatcher: `AI_RUNTIME` unset/`vercel` → chama `runTurnVercel`; `langgraph` → chama `runTurnLangGraph` (stub).
- Nenhuma mudança de comportamento observável com a flag em `vercel`.

## Regressão exigida
Teste unitário do dispatcher (lógica de roteamento por flag). É invariante de roteamento, não copy.
