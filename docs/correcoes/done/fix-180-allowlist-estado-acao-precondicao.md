---
id: FIX-180
titulo: "Governança determinística da fase pós-busca: allowlist estado→ação→precondição (generaliza FIX-179, aposenta a blocklist reativa) via primitivos nativos do AI SDK"
status: todo
bloco: bloco-a-governanca-agente
arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/shown-groups.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
rodada: 2026-07-01 — investigação profunda da jornada da Mirella (conv 69a38af1, prod) + pesquisa de estado da arte
---

## Palavras do operador
> "A IA nao esta respeitando o nosso fluxo e preciso que facamos um estudo a fundo e entender o
> porque isso aconteceu... agora estou com receio de tudo que foi construido." (depois de a IA
> propor decisão sobre um plano "Embracon" que nunca foi exibido)

## Cenário
- Card-âncora da doença: `docs/correcoes/inbox/2026-07-01-analyzer-intent-ver-mais-opcoes.md`
  (movido pro bloco-b como fix-183, mas a análise da doença está lá — leia primeiro).
- Conv real: 69a38af1-567f-4f33-adbc-e8a9ce5ef83e. No turno "quero ver todos", o agente pulou pra
  `simulate_quota → get_group_details → present_decision_prompt` sobre um grupo NÃO exibido, deu
  erro de tool no meio, e ainda emitiu card de decisão pra "Embracon".

## Root cause INVESTIGADO (provado — ver card-âncora + análise da sessão)
A metade de trás da jornada (busca→recomendação→decisão→contrato) é governada por:
1. `nextGate()` (máquina de estados determinística — OK) que decide qual GATE dispara; e
2. `allowedTools(meta)` — allowlist de tools **por FASE** (4 fases grossas: qualify/reveal/closing/
   terminal). É fail-closed (bom), MAS é **cega a DADO**: na fase `reveal`, `simulate_quota`/
   `get_group_details`/`present_decision_prompt` são TODAS permitidas (legítimas em geral), e a
   fase não sabe dizer "só sobre um grupo que o usuário viu/escolheu".
3. `artifact-guard.ts` — **blocklist reativa** (6 regras nascidas de 6 bugs de prod). Incompleta por
   construção (Lei 2 de `~/.claude/reference/arquitetura-agentes-ia.md`).

Modo de falha nomeado: free-running ReAct off-script (Lei 1) + a allowlist governa QUAL tool, não
SOBRE QUE DADO. O FIX-179 adicionou a dimensão de dado, mas ad-hoc dentro da tool.

## Correção proposta (allowlist estado→ação→precondição, com primitivos OFICIAIS do AI SDK)

> ⚠️ Bloco de DESIGN real — o `_prompt.md` manda escrever a spec/ADR ANTES de codar, pesquisando
> os primitivos NA doc (context7) conforme a regra do tripé. NÃO desenhar de memória.

| O quê | Onde | Primitivo oficial AI SDK |
|---|---|---|
| Allowlist de tools por ESTADO (não só fase), com histórico | migrar/aumentar `allowedTools` → `prepareStep({ stepNumber, steps }) → { activeTools, toolChoice }` | [ai-sdk.dev/docs/agents/loop-control](https://ai-sdk.dev/docs/agents/loop-control) |
| Precondição no ARGUMENTO (grounding — generaliza FIX-179): só agir sobre grupo/adm exibido | guard declarativo no `execute` das tools de ação (`shown-groups.ts` vira a tabela de precondição, não caso especial) + `experimental_repairToolCall` pro modelo se auto-corrigir em vez de narrar "instabilidade" | [tools-and-tool-calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) |
| Aposentar a blocklist reativa | migrar as regras do `artifact-guard.ts` que forem representáveis como precondição pra dentro da allowlist declarativa; o que sobrar de genuinamente pós-fato fica documentado | — |

Refinar a granularidade da fase `reveal` (hoje mistura "acabou de revelar" / "comparando" /
"detalhando grupo escolhido" / "aguardando decisão") onde a precondição exigir.

## Regressão exigida
As 3 camadas obrigatórias do projeto (CLAUDE.md → "Regressão de agent"):
- Camada 1 (structural): asserts de que a tabela allowlist nega ação sobre grupo não-exibido em cada
  estado; que `prepareStep` restringe `activeTools` corretamente por estado.
- Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`): reproduz o turno "quero ver
  todos" da Mirella e prova que o agente NÃO consegue decidir sobre grupo não-exibido.
- Manter os testes do FIX-179 verdes (não regredir a trava atual — ela é o primeiro tijolo).
