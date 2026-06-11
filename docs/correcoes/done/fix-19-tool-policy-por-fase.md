---
id: FIX-19
titulo: "Tool-policy por fase da jornada — tool fora de fase nem entra no request"
status: done
commit: 867bda8
executado_em: 2026-06-11
bloco: bloco-g-tool-flow-stability
arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts (novo — função pura allowedTools(meta))
  - src/lib/agent/orchestrator/tool-policy.test.ts (novo — Camada 1)
  - src/lib/agent/agents/builder.ts (aplica a policy ao montar tools)
  - src/lib/agent/agents/index.ts (resolveAgent propaga meta pra policy)
  - tests/regression/agent-trajectory.test.ts (Camada 2 — cassettes novos)
rodada: 2026-06-11 (sessão de arquitetura — pesquisa boas práticas abril/maio 2026)
anotado_em: 2026-06-11
---

# FIX-19 — Tool-policy por fase: gating a montante em vez de supressão a jusante

## Palavras do operador

> "para melhorar a estabilidade, qual das correcoes voce sugere imediatamente?
> estou com varios problemas de fluxos de chamada de tool"

Decisão da sessão: priorizar o gating de tools por fase (opção ① da análise de
arquitetura) como correção imediata de estabilidade.

## Cenário exato

Família recorrente de bugs com a mesma anatomia (histórico no próprio runner.ts):

- FIX-12: modelo chamou `present_contract_form` no gate identify (PRÉ-reveal) —
  submit criou proposta REAL na Bevi sem o usuário ter visto uma opção.
- FIX-11: pós-fechamento, "qual status da proposta?" re-rodou descoberta e
  ofereceu OUTRA administradora pra quem JÁ contratou.
- BUG-REVEAL-LOOP: re-emissão de comparison/recommendation/group a cada
  afirmativo pós-reveal (visto 5× num run real).
- PF-07: `present_whatsapp_optin` duplicado em conversa longa.

## Root cause INVESTIGADO

Provado em `src/lib/agent/agents/builder.ts:146-166`: specialists recebem
`selectTools(row.activeTools)` + ~9 primitivos SEMPRE expostos
(`present_contract_form`, `present_contemplation_dial`, `present_decision_prompt`
etc.), independente da fase da jornada. O modelo enxerga o catálogo inteiro em
qualquer turno — cada tool visível fora de fase é um convite à chamada indevida.

A defesa atual é 100% a jusante (`runner.ts:169-273`): pilha de guards
(`isPrematureContract`, `isPostClosure`, `isRereveal`, `isDecisionDup`,
`isContractDup`, `isSingleOptionDup`, `isWhatsappOptin`) que deixam o modelo
CHAMAR a tool e descartam o artifact. Três custos provados:
1. Cada bug novo = guard novo (a pilha só cresce — 7 guards hoje).
2. O guard protege só o card — o TEXTO que o modelo gera "achando" que o card
   apareceu não é protegido (meta-narrativa órfã).
3. Tokens e ambiguidade: ~15 tool schemas no request em toda fase.

A fonte de verdade da fase JÁ existe: `meta` (`revealCompleted`,
`decisionDispatched`, `contractClosed`, `identityCollected`) + `nextGate()` em
`qualify-state.ts:25`. Falta só a função que mapeia fase → tools permitidas.

## Correção proposta

| O quê | Onde |
|---|---|
| `allowedTools(meta, channel): string[]` — função PURA, tabela declarativa fase → tools (BASE sempre; QUALIFY pré-reveal sem contract_form/dial; REVEAL pós-busca; CLOSING só com decisionDispatched; TERMINAL pós-contractClosed = BASE + check_proposal_status) | `tool-policy.ts` (novo) |
| Builder filtra o registry pela policy ANTES de montar o ToolLoopAgent (os "primitivos sempre presentes" viram "presentes nas fases certas") | `builder.ts` |
| `resolveAgent` repassa o `meta` corrente pra policy (cache de agents precisa de chave por fase ou bypass) | `agents/index.ts` |
| Guards do runner FICAM como segunda linha (defense-in-depth); disparo de guard pós-policy = bug da policy → log forte `[tool-policy-violation]` | `runner.ts` (só o log) |

## Regressão exigida (3 camadas, regra do projeto)

- **Camada 1**: `tool-policy.test.ts` — matriz fase × tool (cada fase tem a lista
  exata; contract_form AUSENTE pré-reveal; descoberta AUSENTE pós-fechamento).
  + assert no builder: tools do agent construído == policy da fase.
- **Camada 2**: cassettes em `agent-trajectory.test.ts` — replays dos cenários
  FIX-11 e FIX-12 com assert de que a tool indevida NEM ESTÁ no toolset do agent
  (não apenas suprimida).
- **Camada 3**: cenários nightly existentes já cobrem a jornada 1→5 — verificar
  que continuam verdes (a policy não pode quebrar o happy path).

## Follow-up pós-eval (2026-06-11, commit 5be65b7)

A rodada nightly da Camada 3 (EVAL-FIX-14-STATUS-VIA-TOOL) pegou uma regressão
da 1ª versão da tabela: `check_proposal_status` só existia em closing/terminal,
mas a fonte de verdade da proposta é `bevi_proposals` (pode existir sem
`meta.contractClosed`) — o agent negou proposta REAL de memória. Fix:
`check_proposal_status` movida pra BASE (leitura pura, primitivo do FIX-14 —
"status nunca de memória", em qualquer fase).
