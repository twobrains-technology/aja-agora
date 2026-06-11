---
bloco: bloco-j-telemetria-runner-residuo
branch: feat/telemetria-supressao-cache
workspace: feat-telemetria-supressao-cache
onda: 1
depends_on: []
paralelo_com: [bloco-d-eval-harness, bloco-e-gate-nome-card, bloco-f-viabilidade-orcamento, bloco-k-fechamento-whatsapp]
itens: [FIX-24]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/types.ts
  - src/lib/telemetry/turn-trace.ts
  - src/lib/telemetry/turn-trace.test.ts
conflitos_esperados: []
---

# Bloco J — Resíduo do contrato G×H: supressões e cache na telemetria

O bloco H (PR #21) deixou 6 `TODO(bloco-g)` em `turn-trace.ts` esperando o merge
do bloco G — que já aconteceu (PR #22). O ajuste pós-merge previsto no manifesto
do H nunca foi feito. Item único, runner.ts agora é território livre (nenhum
outro bloco da onda toca nele).

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-j-telemetria-runner-residuo/ (FIX-24). Comece pelos
> 6 `TODO(bloco-g)` em src/lib/telemetry/turn-trace.ts — eles definem o contrato.
> TDD: atualizar turn-trace.test.ts primeiro (asserts de suppressions/cache
> preenchidos), ver falhar, implementar emissão no runner, ver passar. 1 commit
> (`test+feat:`). Ao concluir, mover o item pra done/ com status/commit/
> executado_em e apagar a pasta do bloco.
