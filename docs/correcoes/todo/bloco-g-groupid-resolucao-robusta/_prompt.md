Você é o executor do bloco `bloco-g-groupid-resolucao-robusta` no worktree isolado deste branch (`fix/groupid-resolucao-robusta`). Trabalha SOZINHO — decida e execute.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-g-groupid-resolucao-robusta/`
   (`_bloco.md` + `fix-72-...md` — root cause provado no log). Leia TAMBÉM o que o FIX-68 e o
   FIX-71 já fizeram (`tool-policy.ts`, `system-prompt.ts`, `ai-sdk.ts`, `bevi-self-contract-adapter.ts`,
   `agent-trajectory.test.ts`) — este é o fechamento da RAIZ que eles atacaram parcialmente. NÃO regrida.

2. DESIGN (decisão real — há 2 abordagens no fix-72): use o raciocínio de `superpowers:brainstorming`,
   mas DECIDA sozinho (você é o decisor; não trave). Escolha entre (a) erro-estruturado-força-rebusca
   (reusa FIX-68, mais simples) e (b) resolução server-side da intenção (mais robusta). Prefira a que
   fecha a raiz com MENOS superfície e sem regredir a degradação graciosa. Registre em
   `docs/decisoes/blocos/<data>-bloco-g-groupid-resolucao-robusta.md` (o quê · opções · escolhida
   + porquê). Commit `docs:` do ADR.

3. TDD STRICT (3 camadas):
   a. Camada 1 (structural) + Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`
      reproduzindo id fabricado em `get_group_details`/`simulate_quota`: `auto-180k`, `auto-180k-kairo`).
   b. RODE e veja FALHAR com a assinatura.
   c. Corrija a RAIZ (toda tool que recebe groupId resolve/re-busca em vez de falhar cru; cards expõem
      quotaId real; prompt com regra única). PRESERVE a degradação graciosa (sem loop de "instabilidade").
   d. Re-rode e veja as 3 camadas VERDES.

4. GATE = `pnpm test:unit` (vitest). NÃO use `tsc`/typecheck como gate (25 erros pré-existentes em
   testes, fora do escopo — o pre-commit do projeto roda test:unit).

5. 1 commit Conventional `test+fix:` único (Camada 1 + 2 + fix). ADR em commit `docs:` à parte.

6. Ao concluir: MOVA `fix-72-...md` pra `docs/correcoes/done/` (status done + commit + executado_em).
   Apague a pasta do bloco.

7. Ao terminar: **push da branch** (`git push origin fix/groupid-resolucao-robusta`) + gere
   `.done/{data}-bloco-g-groupid-resolucao-robusta.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy.**

8. RESUMO FINAL: abordagem escolhida (a ou b) + porquê, o que mudou em adapter/tools/prompt/cards,
   como o cassette reproduz `auto-180k-kairo`, e que as 3 camadas estão verdes via `test:unit`.
