---
id: FIX-20
titulo: "Extrair pilha de guards do runner pra tabela declarativa artifactGuard()"
status: done
commit: f069ca3
executado_em: 2026-06-11
bloco: bloco-g-tool-flow-stability
arquivos:
  - src/lib/agent/orchestrator/artifact-guard.ts (novo — guard table pura)
  - src/lib/agent/orchestrator/artifact-guard.test.ts (novo — Camada 1)
  - src/lib/agent/orchestrator/runner.ts (loop de tool-call consome a tabela)
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
---

# FIX-20 — artifactGuard declarativo: aposentar os ifs empilhados do runner

## Palavras do operador

> "estou com varios problemas de fluxos de chamada de tool"

Item 2 do bloco — depois que o FIX-19 corta as chamadas indevidas na origem, a
supressão residual vira segunda linha de defesa organizada, não god-function.

## Cenário exato

`runner.ts:169-273` — dentro do `for await` do fullStream, o case `tool-call`
carrega 7 guards inline (`isWhatsappOptin`, `isRereveal`, `isDecisionDup`,
`isContractDup`, `isPostClosure`, `isSingleOptionDup`, `isPrematureContract`),
cada um com seu comentário BUG-* e seu else-if na cadeia de decisão. Complexidade
ciclomática alta, ordem dos else-ifs é semântica implícita, e cada bug novo
adiciona mais um ramo.

## Root cause INVESTIGADO

Crescimento orgânico: cada bug de produção (2026-06-02 a 06-05) adicionou um
guard pontual no lugar mais rápido — dentro do loop. Correto individualmente,
insustentável em conjunto. Provado por inspeção: os guards compartilham a mesma
assinatura lógica `(meta, artifactType, contexto do turno) → suprimir|permitir`
— é uma tabela de regras disfarçada de ifs.

## Correção proposta

| O quê | Onde |
|---|---|
| `evaluateArtifactGuards(input): { allow: boolean; reason?: string }` — input = `{ meta, artifactType, userIntent, isUserTurn, discoveryCount, turnArtifacts }`. Regras como array ordenado de `{ name, applies(input), verdict }` — a ordem é EXPLÍCITA e testável | `artifact-guard.ts` (novo) |
| Loop de tool-call do runner chama a função e loga `reason` quando suprime (formato de log atual preservado pros cassettes que grepam) | `runner.ts` |
| ZERO mudança de comportamento — refactor puro; cassettes existentes em `tests/regression/agent-trajectory.test.ts` são a rede de segurança e NÃO podem ser editados | — |

## Regressão exigida

- **Camada 1**: `artifact-guard.test.ts` — 1 teste por regra (cenário que
  suprime + cenário que permite) + teste de ORDEM (regra X avaliada antes de Y).
- **Camada 2**: NENHUM cassette novo — os existentes (reveal-loop,
  pos-fechamento, contract prematuro) DEVEM passar inalterados; é o critério de
  aceite do refactor.
- **Camada 3**: sem mudança (refactor invisível ao comportamento).
