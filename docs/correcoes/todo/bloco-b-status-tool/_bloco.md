---
bloco: bloco-b-status-tool
onda: 1
depends_on: []
paralelo_com: [bloco-a-agent-core, bloco-c-ui-fechamento]
conflitos_esperados:
  - "src/lib/agent/system-prompt.ts — bloco A adiciona seção de estado terminal; este bloco adiciona a regra de status. Seções DIFERENTES — conflito textual trivial."
  - "tests/regression/agent-trajectory.test.ts — describes novos em ambos (append-only). Conflito trivial."
merge_apos: [bloco-a-agent-core]   # ordem RECOMENDADA de merge — quem entra depois resolve o conflito
itens: [FIX-14]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/bevi/proposal-status.ts (novo)
  - tests/regression/agent-trajectory.test.ts
---

# Bloco B — Tool de status real da proposta

**Onda 1 — paralelo com A e C** (3 worktrees simultâneos). A tool é self-contained:
arquivo novo (`proposal-status.ts`) + tool nova no registry + seção própria no
prompt + cassette próprio. Ela NÃO usa nada que o bloco A cria (nível 2 — overlap
textual apenas; ver `conflitos_esperados`).

**Ordem de merge recomendada: A primeiro, B depois** — este bloco resolve o conflito
textual (mecânico: manter as duas seções do prompt e os dois describes).

Nota de integração: o bloco A conserta a amnésia pós-fechamento (persistência +
estado terminal). Esta tool funciona sem ele, mas o cenário completo do usuário só
fica 100% com os dois mergeados — nenhum ajuste de código esperado entre eles.

## Prompt de lançamento (colar na sessão do Superset)

> Leia `docs/correcoes/README.md` e execute o bloco
> `docs/correcoes/todo/bloco-b-status-tool/` — item FIX-14 (tool
> `check_proposal_status`: proposalId da conversa via `getLatestBeviProposal`,
> consulta real via `gateway.getStatus`, tradução leiga server-side dos estados,
> erros honestos). TDD strict (cassette `FIX-14-STATUS-VIA-TOOL`), commit
> `test+feat:`. Ao concluir: mover o arquivo pra `docs/correcoes/done/` com
> `status: done` + `commit:` + `executado_em:`. No merge, se a branch do bloco A já
> tiver entrado, resolva os conflitos textuais em `system-prompt.ts` e
> `agent-trajectory.test.ts` MANTENDO as duas contribuições (são seções/describes
> independentes).
