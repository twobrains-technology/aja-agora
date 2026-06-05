---
bloco: bloco-a-agent-core
onda: 1
depends_on: []
paralelo_com: [bloco-b-status-tool, bloco-c-ui-fechamento]
conflitos_esperados:
  - "system-prompt.ts e agent-trajectory.test.ts com o bloco B (seções/describes diferentes — trivial). Ordem de merge recomendada: A entra primeiro; B resolve."
itens: [FIX-11, FIX-12]
escopo_arquivos:
  - src/app/api/chat/route.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/index.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/bevi/fulfillment.ts
  - tests/regression/agent-trajectory.test.ts
---

# Bloco A — Agent core: estado terminal do fechamento

FIX-11 e FIX-12 tocam os MESMOS arquivos (runner, system-prompt, route) — por isso
vivem num bloco só e executam **sequencial DENTRO do bloco**: primeiro FIX-11
(persistência + estado no prompt + guard anti-descoberta), depois FIX-12 (guard
contract_form pré-reveal + defesa no contract-submit), que reusa a infra do 11.

## Prompt de lançamento (colar na sessão do Superset)

> Leia `docs/correcoes/README.md` (fluxo) e execute o bloco
> `docs/correcoes/todo/bloco-a-agent-core/` — itens FIX-11 e FIX-12, NESTA ordem.
> TDD strict por item (Camadas 1+2 falhando antes do fix, cassette em
> `tests/regression/agent-trajectory.test.ts`), 1 commit `test+fix:` por item.
> Ao concluir cada item: mover o arquivo pra `docs/correcoes/done/` com
> `status: done` + `commit:` + `executado_em:` no frontmatter.
> Não tocar em arquivos fora do `escopo_arquivos` do manifesto sem registrar o
> desvio no próprio arquivo do fix.
