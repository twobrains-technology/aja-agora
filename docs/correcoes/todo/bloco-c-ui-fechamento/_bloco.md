---
bloco: bloco-c-ui-fechamento
onda: 1
depends_on: []
paralelo_com: [bloco-a-agent-core]
itens: [FIX-13]
escopo_arquivos:
  - src/lib/bevi/closing-presentation.ts
  - src/components/chat/artifacts/ (card de confirmação da oferta real)
  - tests/ (teste de contrato opt-in do shape da oferta)
---

# Bloco C — UI do card de confirmação (prazo ausente)

Disjunto do bloco A em arquivos (UI/payload do fechamento × agent core) — **roda em
paralelo na onda 1**, outro worktree, merge independente.

⚠️ Tem **decisão de produto pendente** no FIX-13 (opção a/b/c pro prazo) — resolver
com o Kairo ANTES de lançar, ou lançar com a opção (a) [copy honesta "prazo na sua
proposta (PDF)"] que é a recomendada e reversível.

## Prompt de lançamento (colar na sessão do Superset)

> Leia `docs/correcoes/README.md` e execute o bloco
> `docs/correcoes/todo/bloco-c-ui-fechamento/` — item FIX-13 com a opção decidida no
> arquivo do fix. TDD strict (teste do componente: nunca renderizar prazo sem fonte),
> commit `test+fix:`. Inclui o teste de CONTRATO opt-in do shape da oferta de
> parceiro (8 campos — alerta quando a AGX incluir `term`). Ao concluir: mover o
> arquivo pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.
