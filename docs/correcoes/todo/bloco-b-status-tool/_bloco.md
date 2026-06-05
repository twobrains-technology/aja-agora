---
bloco: bloco-b-status-tool
onda: 2
depends_on: [bloco-a-agent-core]
paralelo_com: []
itens: [FIX-14]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/bevi/proposal-status.ts (novo)
  - tests/regression/agent-trajectory.test.ts
---

# Bloco B — Tool de status real da proposta

**Onda 2** — depende do bloco A mergeado: (1) a tool só resolve o cenário completo
com a persistência/estado terminal do FIX-11 no lugar; (2) toca `system-prompt.ts` e
o arquivo de cassettes, que o bloco A também edita — paralelizar daria conflito de
merge no worktree.

## Prompt de lançamento (colar na sessão do Superset, APÓS merge do bloco A)

> Leia `docs/correcoes/README.md` e execute o bloco
> `docs/correcoes/todo/bloco-b-status-tool/` — item FIX-14 (tool
> `check_proposal_status`: proposalId da conversa, tradução leiga server-side,
> erros honestos). TDD strict (cassette `FIX-14-STATUS-VIA-TOOL`), commit
> `test+feat:`. Ao concluir: mover o arquivo pra `docs/correcoes/done/` com
> `status: done` + `commit:` + `executado_em:`.
