---
bloco: bloco-n-funil-canonico
branch: fix/funil-canonico-pos-reveal
workspace: fix-funil-canonico-pos-reveal
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-28, FIX-27]
escopo_arquivos:
  - src/lib/agent/system-prompt.ts (regras de fechamento legadas)
  - src/lib/agent/orchestrator/tool-policy.ts (lead_form por fase)
  - src/lib/agent/orchestrator/analyze.ts (clamp de carta)
  - src/lib/agent/qualify-config.ts (faixas — fonte do clamp)
  - tests/regression/agent-trajectory.test.ts (cassettes)
conflitos_esperados: []
---

# Bloco N — Funil canônico pós-reveal + guardrail de carta (rodada manual 2026-06-12)

Dois achados do teste manual do Kairo no dev (jornada Itaú real). Mesmo tema:
o caminho do funil fora do happy-path do docx. Ordem: FIX-28 primeiro (quebra
a jornada canônica no passo 5 — mais grave), FIX-27 depois.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-n-funil-canonico/ na ordem FIX-28 → FIX-27.
> FIX-28 é bug de comportamento de agent — regressão nas 3 camadas é
> OBRIGATÓRIA (cassette em tests/regression/agent-trajectory.test.ts
> reproduzindo o cenário do print: pós-reveal, usuário manda "Tenho
> interesse", agente NÃO pode emitir present_lead_form nem prometer
> consultor — caminho é decision → contract_form). Validar contra
> docs/jornada/jornada-canonica.md. TDD strict, 1 commit test+fix: por
> item, mover pra done/ ao concluir, apagar a pasta no fim.
