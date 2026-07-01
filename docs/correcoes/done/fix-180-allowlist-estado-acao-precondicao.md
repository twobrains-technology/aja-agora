---
id: FIX-180
titulo: "Governança determinística da fase pós-busca: allowlist estado→ação→precondição (generaliza FIX-179, aposenta a blocklist reativa) via primitivos nativos do AI SDK"
status: done
executado_em: 2026-07-01
commit: "test+fix: allowlist estado→ação→precondição (FIX-180)"
bloco: bloco-a-governanca-agente
arquivos:
  - src/lib/agent/orchestrator/action-policy.ts (novo)
  - src/lib/agent/orchestrator/action-policy.test.ts (novo)
  - src/lib/agent/tools/ai-sdk.ts (FIX-179 inline → tabela)
  - src/lib/agent/agents/builder.ts (belt prepareStep.activeTools)
  - src/lib/agent/orchestrator/artifact-guard.ts (reclassificado 2ª linha)
  - tests/regression/agent-trajectory.test.ts (cassette Mirella)
rodada: 2026-07-01 — investigação profunda da jornada da Mirella (conv 69a38af1, prod) + pesquisa de estado da arte
---

## Resolução (2026-07-01)
ADR: docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md (Q1/Q2/Q3 recomendadas).
- **Tabela declarativa `action-policy.ts`** (`evaluateActionPrecondition`) generaliza a precondição de
  DADO do FIX-179 (antes `if` inline no execute) para as 3 tools de risco (simulate_quota/
  get_group_details/present_decision_prompt) — a dimensão AÇÃO→PRECONDIÇÃO da allowlist. As diretivas
  de re-ancoragem migraram pra lá (fonte única). ai-sdk.ts passou a delegar.
- **Belt nativo `prepareStep.activeTools`** no builder (primitivo oficial do AI SDK 6, confirmado na doc)
  re-afirma a allowlist da fase (allowedTools) por step; compõe com a reversão do toolChoice forçado.
  Filtro build-time do allowedTools MANTIDO (1ª linha fail-closed + chave de cache) — Q1 incremental.
- **artifact-guard.ts reclassificado** como 2ª linha (defense-in-depth) explicitamente documentada;
  single-option e reveal-loop (heurística) ficam lá como genuinamente pós-fato — Q2 meio-termo.
- **Fase reveal mantida (4 fases)** — a precondição de dado é o eixo certo, não sub-fases — Q3.
- `experimental_repairToolCall` avaliado e **NÃO adotado** (só dispara em parse-error, não em retorno
  {error} da precondição — o padrão de diretiva-no-tool-result é superior). Registrado no ADR.
- FIX-179 NÃO regride (integration + shown-groups verdes). Camada 1 (action-policy) + Camada 2 (cassette
  "quero ver todos" reproduz a trajetória e prova o bloqueio das 3 ações sobre grupo não-exibido).
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
