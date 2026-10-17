# Parecer do spike — pi em modo de controle total

17/10/2026 · fase 4 da campanha `aja-pi-limpo-local-dev`

Script: `scripts/spike-pi.mts` (`pnpm exec tsx scripts/spike-pi.mts`). Saída legível no
terminal e em `.spike-pi-resultado.json` (artefato, ignorado pelo git).

**Resultado: 11 de 11 itens provados.** Nenhum item ficou ❌.

## ✅ Provado

| item | evidência |
|---|---|
| sessão in-process, sem descoberta | `DefaultResourceLoader` com `cwd` e `agentDir` em diretórios VAZIOS: `getAgentsFiles()` = **0 arquivo** |
| sem skills/extensões do disco | `noSkills: true`; `getSkills()` = **0**; `getExtensions()` = **1** (só a inline) |
| **sem `read`/`bash`/`edit`/`write`** | `session.getActiveToolNames()` = `["registrar_gate"]` — nenhuma tool de código |
| uma tool customizada registrada | registrada por `extensionFactories` (inline, sem arquivo no disco) |
| **a tool é CHAMADA e executada** | `registrar_gate` executou com `gate="credit"`; 2 chamadas ao modelo (ida, tool call, volta) |
| **`systemPrompt` vindo da CAIXA** | o prompt gerenciado do Langfuse (`aja-system-prompt`, **v11**) foi buscado pela API; o system recebido pelo modelo tem **20.709 chars** e contém a seção "Situações do turno" |
| streaming por `session.subscribe` | 3 deltas de texto capturados (`message_update` → `text_delta`) |
| hidratação de contexto por turno (Q3) | `SessionManager.inMemory(cwd, undefined, entries)` aceitou 2 entradas — a assinatura é `(cwd?, options?, entries?)`, como suspeitávamos |
| durabilidade: `inMemory` não compartilha | outra instância `inMemory` nasce vazia (2 chars) |
| durabilidade: `create()` grava em disco | `sessionFile` = `.jsonl` real em disco, recarregável por `SessionManager.open()` |

## ❌ NÃO provado (e por que importa)

1. **Modelo real.** O spike usou um servidor OpenAI-completions FALSO, local e
   determinístico, de propósito: mede o harness, não o modelo. **Não** está provado que
   o `qwen3.6-flash` chame tools com confiabilidade através do pi — isso só um turno
   real mede, e é o primeiro item da fase 5.
2. **Paridade do `interrupt`.** O grafo de hoje para o turno num `interrupt` (confirmação
   de tool / card) e retoma depois. Neste spike **não** exercitei o equivalente no pi
   (pausa de turno e retomada com estado). É a maior lacuna técnica para a fase 5.
3. **Prompt caching.** O app usa `cacheableSystemBlock`; não medi se o pi cacheia o
   system prompt do mesmo jeito nem o custo por turno resultante.
4. **Latência real do turno.** O servidor falso responde instantâneo — não há medida de
   tempo de turno com o gateway.

## Régua de durabilidade (Q1) — recomendação

Hoje: `MemorySaver` in-process (`langgraph/checkpointer.ts`), estado do `interrupt` some
no restart do container.

Medido no spike: as três opções reais são (a) `SessionManager.inMemory` — igual ao de
hoje, perde tudo; (b) `SessionManager.create(cwd, dir)` — grava `.jsonl` em disco;
(c) `inMemory` **hidratado com `entries` vindas do banco a cada turno**.

**Recomendação: (c).** O app já tem o banco e o turno já carrega histórico por
`conversationId`; hidratar `entries` reproduz o comportamento atual (nada pior) e mantém
o pi sem I/O de sessão próprio. A perda do estado de `interrupt` no restart **continua**
com (c) — se isso precisar acabar, é (b) ou persistir as `entries` no Postgres, e é
decisão do dono depois do spike da fase 5.

## Consequência para a fase 5

O modo de controle total funciona e é barato de montar (~200 linhas de spike, sem
dependência nova no repo — o pacote do pi vive na instalação global e é ESM-only, por
isso o script é `.mts` e importa por caminho absoluto). O que a fase 5 tem de resolver,
em ordem de risco: (1) o `interrupt` e a retomada; (2) as tools reusadas do
`toolset.ts` com o mesmo gating; (3) os cards/persistência atrás do seam.