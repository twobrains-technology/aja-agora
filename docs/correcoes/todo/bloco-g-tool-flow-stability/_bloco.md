---
bloco: bloco-g-tool-flow-stability
onda: 1
depends_on: []
paralelo_com: [bloco-d-eval-harness, bloco-e-gate-nome-card, bloco-f-viabilidade-orcamento, bloco-h-observabilidade-trajetoria, bloco-i-token-diet]
itens: [FIX-19, FIX-20]
escopo_arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts (novo)
  - src/lib/agent/orchestrator/tool-policy.test.ts (novo)
  - src/lib/agent/orchestrator/artifact-guard.ts (novo)
  - src/lib/agent/orchestrator/artifact-guard.test.ts (novo)
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/agents/index.ts
  - src/lib/agent/orchestrator/runner.ts
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "tests/regression/agent-trajectory.test.ts: blocos E/H também adicionam describes (append-only, nível 2). Ordem de merge: tanto faz — resolução mecânica."
  - "system-prompt.ts NÃO é tocado aqui (blocos E/F mexem nele) — disjunção proposital."
---

# Bloco G — Estabilidade do fluxo de tool-call (gating por fase + guards declarativos)

Causa raiz comum dos bugs FIX-11/12 e da família reveal-loop: o modelo enxerga
TODAS as ~15 tools em qualquer fase da jornada, e a defesa é 100% a jusante
(deixa chamar, suprime o card no runner). Este bloco inverte: a tool só entra no
request quando a fase permite (FIX-19), e o que sobra de supressão vira tabela
declarativa testável em vez de ifs empilhados no runner (FIX-20).

Ordem interna OBRIGATÓRIA: FIX-19 primeiro (muda a superfície de tools),
FIX-20 depois (refatora os guards que sobraram como segunda linha de defesa).

Respaldo externo (pesquisa 2026-06-11): Vercel AI SDK "Phased Tool Progression"
(prepareStep/activeTools) + Anthropic context engineering ("tool sets minimal
and focused, avoid ambiguous decision points").

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-g-tool-flow-stability/ na ordem FIX-19 → FIX-20.
> TDD strict (regra do projeto): Camada 1 structural + Camada 2 cassette ANTES
> do código de produção, ver falhar, implementar, ver passar. Os guards atuais
> do runner NÃO são removidos no FIX-19 — viram segunda linha de defesa; no
> FIX-20 são extraídos pra tabela declarativa mantendo comportamento (cassettes
> existentes são a rede). 1 commit por item (`test+feat:`/`refactor:`). Ao
> concluir cada item, mover o arquivo pra docs/correcoes/done/ com status: done,
> commit: e executado_em:. Bloco vazio → apagar a pasta.
