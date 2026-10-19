# Motor pi — sem LangGraph, sem Langfuse (blocos de execução)

19/10/2026 · continuação da campanha `aja-pi-limpo-local-dev` (fases 0–4 fechadas).
Mandato anterior: `docs/design/planos/2026-10-17-aja-pi-limpo-local-dev.md`.

## Problema

Duas dependências ainda mandam no turno e nenhuma delas é o produto:

- **LangGraph** é o runtime: `runTurn` → `runTurnLangGraph` → grafo `capture → analyze →
  route → advance → routeFinal → converse`, com `MemorySaver` in-process e interrupt para
  retomar turno. 11 arquivos em `src/lib/agent/langgraph/` (7.059 linhas), mais
  `@langchain/langgraph`, `@langchain/core`, `@langchain/anthropic`,
  `@langchain/langgraph-checkpoint-postgres` no `package.json`.
- **Langfuse** é a caixa de conduta (prompt management) **e** a observabilidade: 36
  arquivos em `src/` importam `langfuse`. A label do prompt é compartilhada entre prod,
  dev e local — já causou publicação em produção por engano (17/10, v8 revertida).

O spike da fase 4 provou que o pi em controle total funciona (11/11). O que falta é o
turno inteiro rodar nele, e nada do produto depender de LangGraph ou Langfuse.

## Solução

1. O **pi** é o único runtime do turno, atrás do seam que já existe:
   `runTurn(input): AsyncGenerator<TurnEvent>`.
2. A **caixa** de conduta passa a viver no banco (`caixa_de_prompt`, versionada, com
   label por ambiente), com fallback para a constante de código. Sem Langfuse.
3. A **observabilidade** passa a ser local: trace do turno gravado no banco/JSON
   estruturado, sem SDK de terceiro no caminho do cliente.
4. FATO continua código (`nextGate`, trava do telefone, cards server-side, persistência);
   CONDUTA continua na caixa.

## Blocos (cada um com gate próprio)

| # | bloco | gate |
|---|---|---|
| **B1** | `box/caixa.ts` — caixa versionada no banco + fallback de código, label por ambiente | teste pontual da caixa verde; typecheck |
| **B2** | `runtime/` — sessão do pi montada por turno (in-memory hidratado do banco), streaming `TurnEvent` | teste com modelo falso: turno emite `text-delta` e persiste |
| **B3** | tools do pi (`registrar_pedido`, `escolher_cota`, cards, handoff) reusando a lógica de `toolset.ts`/`ai-sdk.ts` | teste: tool é chamada e executa; nada de `read`/`bash`/`edit`/`write` |
| **B4** | `runTurnPi` com paridade: card, gate, persistência, ordem do funil, dois canais | os 31 testes do seam verdes no motor novo |
| **B5** | corte do seam para o pi; LangGraph vira código morto e é apagado | `grep langgraph src/` = 0; typecheck |
| **B6** | remoção do Langfuse: caixa→banco, trace→local, alertas e painéis re-ancorados | `grep langfuse src/` = 0; typecheck; smoke dev |
| **B7** | deps fora (`@langchain/*`, `@langfuse/*`), migrate + smoke nos dois canais | `pnpm lint && typecheck`; dev deployado |

## Não-objetivos

- Não mexer em produção (`main`, `tb/prod/aja-agora/env`, `aja-agora-prod`).
- Não apagar o editor de persona por IA (os 5 campos mortos: decisão de produto em aberto).
- Não trocar o modelo por causa do bloco — `AI_MODEL` é decisão do dono.

## Riscos medidos

- **Interrupt/retomada** não foi provado no spike. No pi, retomada = hidratar a sessão com
  o histórico do banco a cada turno (opção (c) do parecer). Se a paridade exigir pausa no
  meio do turno, a decisão volta ao dono.
- **Paridade do `converse.ts`** (1.450 linhas de conduta + fluxo): o pi assume o laço, mas
  card e persistência continuam código — é o que garante que nada some.
- **Banco**: a tabela nova exige migration; template `aja_agora_template` precisa nascer
  com 66 migrations.