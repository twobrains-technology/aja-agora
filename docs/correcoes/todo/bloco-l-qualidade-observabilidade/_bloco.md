---
bloco: bloco-l-qualidade-observabilidade
branch: feat/qualidade-observabilidade
workspace: feat-qualidade-observabilidade
onda: 1
depends_on: []
paralelo_com: [bloco-k-fechamento-whatsapp, bloco-m-ux-funil]
itens: [FIX-24, FIX-15, FIX-26]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/types.ts
  - src/lib/telemetry/turn-trace.ts
  - src/lib/telemetry/turn-trace.test.ts
  - tests/eval/agent-flow.eval.test.ts
  - tests/eval/judge.ts (novo)
  - tests/helpers/fixture-discovery-adapter.ts
  - src/lib/adapters/bevi/__fixtures__/ (fixture nova de IMOVEL, captura real)
conflitos_esperados: []
---

# Bloco L — Qualidade & observabilidade (consolida ex-blocos D + J)

Agrupamento por afinidade (pedido do Kairo, 2026-06-11: "não dá pra agrupar?"):
itens pequenos de infraestrutura de qualidade que não tocam produto visível.
Arquivos 100% disjuntos entre os itens — a ordem interna é só lógica:

1. **FIX-24** — runner emite supressões/cache como TurnEvent → fecha os 6
   `TODO(bloco-g)` do turn-trace (resíduo do contrato G×H).
2. **FIX-15** — conserta cenário de eval Bruna/Monique (era mock; precisa
   fixture REAL de IMOVEL).
3. **FIX-26** — LLM-judge na Camada 3 (rubrica derivada da jornada canônica),
   em cima do harness já saudável pelo FIX-15.

⚠️ FIX-26 gasta API Anthropic real — rodar o eval com parcimônia no dev.

## Prompt de lançamento (colar na sessão do Superset)

> Leia docs/correcoes/README.md e execute o bloco
> docs/correcoes/todo/bloco-l-qualidade-observabilidade/ na ordem
> FIX-24 → FIX-15 → FIX-26. TDD strict em todos (teste falha primeiro).
> FIX-24: os 6 TODO(bloco-g) em src/lib/telemetry/turn-trace.ts definem o
> contrato; console.log existentes do runner FICAM (cassettes grepam eles).
> FIX-15: fixture de IMOVEL deve ser captura REAL da Bevi (regra de produto:
> zero mock fictício). FIX-26: rubrica derivada de
> docs/jornada/jornada-canonica.md, não da implementação; judge roda só
> nightly. 1 commit por item (test+feat:/test:). Ao concluir cada item, mover
> pra docs/correcoes/done/ com status/commit/executado_em. Bloco vazio →
> apagar a pasta.
