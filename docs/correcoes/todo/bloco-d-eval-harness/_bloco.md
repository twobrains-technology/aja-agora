---
bloco: bloco-d-eval-harness
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-15]
escopo_arquivos:
  - tests/eval/agent-flow.eval.test.ts
  - tests/helpers/fixture-discovery-adapter.ts
  - src/lib/adapters/bevi/__fixtures__/ (fixture nova de IMOVEL, captura real)
---

# Bloco D — Harness de eval: cenário Bruna (imóvel) da era mock

Só testes — zero código de produto. Paraleliza com qualquer coisa.

## Prompt de lançamento (colar na sessão do Superset)

> Leia `docs/correcoes/README.md` e execute o bloco
> `docs/correcoes/todo/bloco-d-eval-harness/` — item FIX-15. Atualizar o cenário
> "Eval flow Bruna — Cenário 1 (Monique)" pro contrato da jornada canônica
> pós-mock. Commit `test:`. Ao concluir: mover o arquivo pra `docs/correcoes/done/`
> com `status: done` + `commit:` + `executado_em:`.
