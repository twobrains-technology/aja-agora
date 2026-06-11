---
bloco: bloco-h-observabilidade-trajetoria
onda: 1
depends_on: []
paralelo_com: [bloco-g-tool-flow-stability, bloco-i-token-diet, bloco-d-eval-harness, bloco-e-gate-nome-card, bloco-f-viabilidade-orcamento]
itens: [FIX-21, FIX-22]
escopo_arquivos:
  - src/lib/telemetry/ (novo módulo)
  - src/app/api/chat/route.ts (instrumentação no consumo de TurnEvents)
  - src/lib/whatsapp/processor.ts (idem)
  - docs/decisions/ (ADR durable workflow)
conflitos_esperados:
  - "NÍVEL 3 com bloco G: a telemetria quer registrar supressões de guard. CONTRATO: consumir os console.log existentes do runner ([reveal-loop], [post-closure], [tool-policy-violation]) e os TurnEvents nos entry points — NÃO instrumentar dentro do runner.ts (região do G). Se precisar de evento novo do runner, stub com TODO(bloco-g): e ajustar pós-merge."
ordem_merge_recomendada: "G antes de H (H ajusta TODO(bloco-g) em minutos)."
---

# Bloco H — Observabilidade de trajetória + ADR de teto arquitetural

FIX-21 (telemetria por turno) e FIX-22 (ADR durable workflow) juntos: ambos são
trabalho de plataforma/arquitetura sem tocar comportamento do agent. O FIX-22 é
docs-only e leve — pega carona na mesma sessão.

Restrição de desenho (disjunção com bloco G): instrumentar APENAS nos entry
points (route.ts, processor.ts) consumindo TurnEvents — runner.ts pertence ao
bloco G nesta onda.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-h-observabilidade-trajetoria/ na ordem FIX-21 →
> FIX-22. RESTRIÇÃO DURA: não editar src/lib/agent/orchestrator/runner.ts nem
> src/lib/agent/agents/builder.ts (bloco G mexe neles em paralelo) — a telemetria
> consome TurnEvents nos entry points e logs existentes; necessidade de evento
> novo do runner vira TODO(bloco-g): documentado. TDD: testes do módulo de
> telemetria primeiro. 1 commit por item. Ao concluir, mover cada item pra
> docs/correcoes/done/ com status/commit/executado_em. Bloco vazio → apagar pasta.
