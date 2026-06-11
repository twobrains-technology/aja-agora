---
bloco: bloco-d-eval-harness
onda: 1
depends_on: []
paralelo_com: [bloco-e-gate-nome-card, bloco-f-viabilidade-orcamento, bloco-j-telemetria-runner-residuo, bloco-k-fechamento-whatsapp]
itens: [FIX-15, FIX-26]
escopo_arquivos:
  - tests/eval/agent-flow.eval.test.ts
  - tests/eval/judge.ts (novo)
  - tests/helpers/fixture-discovery-adapter.ts
  - src/lib/adapters/bevi/__fixtures__/ (fixture nova de IMOVEL, captura real)
conflitos_esperados: []
---

# Bloco D — Harness de eval: cenário Bruna (era mock) + LLM-judge na Camada 3

Só testes — zero código de produto. Paraleliza com qualquer coisa. Ordem
interna: FIX-15 primeiro (conserta o cenário quebrado), FIX-26 depois (judge
qualitativo em cima do harness saudável).

## Prompt de lançamento (colar na sessão do Superset)

> Leia `docs/correcoes/README.md` e execute o bloco
> `docs/correcoes/todo/bloco-d-eval-harness/` na ordem FIX-15 → FIX-26.
> FIX-15: atualizar o cenário "Eval flow Bruna — Cenário 1 (Monique)" pro
> contrato da jornada canônica pós-mock (fixture REAL de IMOVEL). FIX-26:
> LLM-judge com rubrica derivada de docs/jornada/jornada-canonica.md (regra de
> produto: eval valida contra o docx, não contra a implementação); judge roda
> só nightly. Commits `test:` separados por item. Ao concluir cada item, mover
> pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.
> Bloco vazio → apagar a pasta.
