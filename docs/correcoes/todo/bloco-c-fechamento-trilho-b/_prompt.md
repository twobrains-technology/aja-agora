Você é o executor do bloco **bloco-c-fechamento-trilho-b** no worktree isolado deste branch (`feat/fechamento-trilho-b`).

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-c-fechamento-trilho-b/` (_bloco.md + FIX-88, FIX-89). Leia também o ADR `docs/correcoes/decisions/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`, o contrato `src/lib/adapters/proposal-gateway.ts`, o `src/lib/adapters/bevi/self-contract-client.ts` e os cookbooks `docs/integracoes/bevi-api-requests.md` (§7) + `docs/integracoes/bevi-api-discovery.md` (§4) + `docs/integracoes/trilho-b-payload-study.md`. Contexto: o Trilho A está travado (productId/AGX, confirmado ao vivo 28/06); fechamos via Trilho B (self-contract `/unauth/`, sem productId), que descobre E fecha na MESMA proposta.

2. DESIGN: a arquitetura está nos cards. O mapeamento ProposalGateway→self-contract tem pontos de design real (como representar "chooseOffer sem uselink.me"; como o fulfillment reusa a proposta de descoberta). Use `superpowers:brainstorming` pra esses; quando houver trade-off, faça a pergunta via `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)") — sem resposta em tempo razoável, siga a recomendada (fallback anti-trava). Registre em `docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md` (commit `docs:`) E **atualize o ADR** existente (anexe a evolução: fechamento-via-B deixou de ser descartado porque o A travou sem prazo + piloto single-user; concorrência multi-usuário continua dívida via device fingerprint).

3. Execute NA ORDEM: FIX-88 → FIX-89. TDD: integration/contract test com as fixtures self-contract (`ok-selfcontract-*`) antes do código.

4. 1 commit Conventional (PT-BR) por item.

5. Regras DURAS:
   - O B fecha SEM productId (é `/unauth/`). NÃO reintroduza o productId do Trilho A no caminho self-contract.
   - 1 proposta ativa por hash/device: REUSE a proposta de descoberta da conversa (discovery-session) — não crie proposta nova no fechamento.
   - **Dependência nível 3 (bloco-a):** o despacho do documento usa `dispatchClientDocument(documentId, "bevi_b")` de `src/lib/documents/dispatch.ts` (bloco-a). Implemente contra um STUB local com a assinatura exata + `TODO(bloco-a): usar o dispatch real após o merge`. NÃO duplique a lógica de storage — só consuma o contrato.
   - Validar ao vivo o step de upload de doc do self-contract é **PENDENTE-KAIRO** — deixe o caminho de doc do fechamento delegando ao dispatch (stub) e marque o TODO.
   - Camada 2 (cassette) SÓ se o comportamento do agente no passo 5 mudar (texto/artifact). Senão, Camada 1 + integration bastam. Decida pelo diff.
   - pnpm único; local-dev em container.
   - ⚠️ **MIGRATION À MÃO** se mudar `src/db/schema.ts` — `db:generate` está QUEBRADO (collision no meta; bloco-g/FIX-100). NÃO rode `db:generate`. Escreva a `.sql` à mão em `drizzle/00NN_<nome>.sql` + entry em `drizzle/meta/_journal.json` (padrão das 0027/0028). VALIDE: `pnpm db:migrate` + `pnpm test:unit` verde antes do push. Sem isso a develop quebra.

6. Ao terminar: **push da branch** (`git push origin feat/fechamento-trilho-b`) + gere `.done/{data}-bloco-c-fechamento-trilho-b.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** Integração é do ORQUESTRADOR; a tag-sentinela é injetada no fim deste prompt.

7. RESUMO FINAL: decisões de design (1 por linha) + PENDENTE-KAIRO (step de doc do B ao vivo) + nota de que o ADR foi atualizado.
