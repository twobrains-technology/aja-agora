Você é o executor do bloco **bloco-c-estudo-remocao-letta** no worktree isolado deste branch (`chore/estudo-remocao-letta`). Trabalha SOZINHO, sem o Kairo para responder: NÃO faça perguntas, NÃO espere aprovação — você É o decisor (best practice + padrões do repo).

## ⚠️ NATUREZA DA TAREFA — ESTUDAR e PLANEJAR, NÃO ARRANCAR O LETTA
Esta tarefa é **ESTUDO + PLANO + STUB**, NÃO remoção. **É PROIBIDO remover o Letta, modificar qualquer código de runtime existente (`src/lib/memory/letta-adapter.ts`, `orchestrator/*`, `extractor.ts`, etc.), trocar adapter ativo, mexer em env vars ou container.** É um refactor grande **PENDENTE-KAIRO** — o veredito é forte por inferência de código mas NÃO cravado por dado de prod. Você entrega plano + ADR + stub; o Kairo decide depois se/quando executa. Quem cruzar essa linha quebrou a tarefa.

## Contexto
Achado da rodada de **QA manual do Kairo (2026-06-25)** + avaliação de arquiteto sênior (Opus): o Letta é OVERKILL neste app. Card completo com a evidência em `docs/correcoes/todo/bloco-c-estudo-remocao-letta/fix-80-estudo-remocao-letta-postgres.md`.

## Passos
1. Leia `docs/correcoes/README.md` (regras do fluxo) e a pasta `docs/correcoes/todo/bloco-c-estudo-remocao-letta/` inteira: `_bloco.md` + `fix-80` (veredito do arquiteto, evidência, proposta de re-home pro Postgres, pré-requisitos de medição em prod). Leia também `CLAUDE.md` do projeto.

2. **(a) Mapeie o uso REAL do Letta no código** — varra `src/lib/memory/` e todos os call-sites (read-side, write-side, reativação, `reconcileIdentity`). Documente: o que de fato é exercitado em runtime, o que está morto (archival), onde a interface `MemoryAdapter` é o ponto de corte, e o que chega ao prompt (`[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]`) vs. o que já vive no `conversations.metadata`/Postgres.

3. **(b) Desenhe o `PostgresMemoryAdapter` ATRÁS da interface `MemoryAdapter` existente** — pode CRIAR um arquivo **stub** `src/lib/memory/postgres-adapter.ts` que implementa a interface (assinaturas + `TODO(estudo):` no corpo), **SEM ligar no runtime** (não registrar no factory/seletor de adapter, não trocar `MEMORY_ADAPTER`). O stub é ilustração do contrato, não código ativo. Preserve o contrato: read não-throw, write fire-and-forget, degradação limpa, reativação. 1 tabela `jsonb` keyed por identidade (o `extractor` já produz o patch → `upsert`).

4. **(c) Escreva o PLANO de migração + o ADR** em `docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md` (ADR completo: contexto · veredito · opções consideradas · decisão proposta · plano de migração faseado · riscos · rollback · o que fica PENDENTE-KAIRO). O plano de migração pode ter um doc complementar em `docs/` se ficar grande. pgvector pro archival = fase 2 OPCIONAL (hoje morto); se reativado, embeddings via gateway LiteLLM shared, não OpenAI direto. NÃO deletar a memória/continuidade entre sessões — é feature de produto; o veredito é overkill DO LETTA, só RE-HOME pro Postgres.

5. **(d) Liste EXATAMENTE o que precisa ser MEDIDO em prod ANTES de executar** (no ADR, seção "Pré-requisitos de medição — PENDENTE-KAIRO"): (1) qual `MEMORY_ADAPTER` está ativo em prod (`letta` vs `noop`) + taxa de circuito-aberto; (2) taxa real de recall/reativação (quantos turnos recebem `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` não-vazio; quantos web-anônimos cruzam o threshold de 3 turnos + cookie); (3) uso real de `reconcileIdentity` web→WhatsApp em prod. Deixe claro: sem (1) e (2), NÃO aprovar a remoção.

6. Commits Conventional (PT-BR): `docs:` para o ADR/plano; se criar o stub, `chore:` para o stub (deixe explícito no commit que é stub não-ligado). NÃO use `--no-verify`. Como este bloco só toca `.md` + 1 stub `.ts` não-ligado, o pre-commit pode pular as camadas de agente (ou rodá-las verde) — não introduza teste que dependa de runtime.

7. Ao concluir: MOVA o `fix-80` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta.

8. Ao terminar: **push da branch** (`git push origin chore/estudo-remocao-letta`) + gere `.done/{data}-bloco-c-estudo-remocao-letta.md` (resumo do estudo + ADR + stub + o que ficou PENDENTE-KAIRO/a medir em prod).

9. **PROIBIDO**: remover o Letta, tocar código de runtime existente, trocar adapter ativo/env/container, abrir PR, fazer merge, rodar deploy/restart, criar reminder, `--no-verify`. Sua entrega é plano + ADR + stub + push da branch. A tag-sentinela é injetada automaticamente pelo `launch-blocks.sh` no fim deste prompt.

10. RESUMO FINAL: o que mapeou do uso real do Letta, a decisão proposta no ADR, e a lista exata do que precisa ser medido em prod antes de qualquer execução.
