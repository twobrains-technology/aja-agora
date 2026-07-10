Você é o executor do bloco **bloco-jornada-conversa** no worktree isolado deste branch (`feat/jornada-conversa-consorcio`). É o FUNIL, a VOZ e o FECHO da onda "agente de vendas de consórcio". É o dono ÚNICO do `system-prompt.ts` nesta onda.

1. Leia, nesta ordem:
   - `docs/correcoes/README.md`
   - `docs/correcoes/todo/bloco-jornada-conversa/` — `_bloco.md` (decisões de produto + conflito nível 3) + os 3 cards `fix-233..235`
   - O ADR das decisões: `docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md`
   - SPEC: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/01-gates-e-ordem.md` (cadeia-alvo), `.../docs/04-copy-fluxos.md` (cadência, tom, os 2 fluxos completos, o FECHO balão-a-balão), `.../docs/05-compliance-e-dados.md`.
   - A jornada canônica atual: `docs/jornada/jornada-canonica.md` (você vai atualizá-la).

2. DESIGN: as 3 decisões de produto já foram tomadas pelo Kairo (ver ADR): timeframe REINTRODUZIDO, experience MOVIDO pra pós-search, e a cadência/tom da spec. NÃO rebrainstorme essas. Uma decisão pendente menor (mesa vs proxy pra "especialista de cadastros") tem default no FIX-235 — só use `AskUserQuestion` se houver dúvida real; sem resposta, siga o default e registre em `docs/decisoes/blocos/2026-07-09-jornada-conversa.md`.

3. Execute NA ORDEM: FIX-233 (gates + slots + 3ª saída) → FIX-234 (sanitizer + voz) → FIX-235 (fecho WhatsApp). **TDD strict** onde há lógica (o funil TEM testes de ordem — `qualify-state.*.test.ts`): teste que falha antes, corrige, passa.

4. INVARIANTES QUE NÃO SE NEGOCIAM:
   - A jornada canônica (`docs/jornada/jornada-canonica.md`) é a FONTE SOBERANA — atualize-a refletindo timeframe reintroduzido + experience movido. Divergência código × jornada é defeito.
   - Invariante de compliance/fluxo em CÓDIGO (sanitizer), não regra-no-prompt: "reduzir prazo", "reservado/garantido" viram padrões no `sanitizer.ts`.
   - NÃO oferecer redução de prazo em lugar nenhum (D7). Abatimento vira parcela menor.
   - `HARD_RULES.md` ↔ `hard-rules.ts` em paridade (teste `HARD_RULES.test.ts` trava).
   - Gate `desire` é NÃO bloqueante (usuário pula → funil segue).
   - NÍVEL 3 com bloco-cards: o gate `lance` (3ª saída) chama a tool `present_two_paths` (criada lá) — referencie pelo NOME (string); ajuste de minutos pós-merge se preciso.
   - Português CORRETO em toda copy voltada ao usuário (acentos, cedilha, til) — é defeito de entrega faltar acento. Tom consultivo, sem gíria de "brother", emoji ≤ 1 a cada 3-4 balões.

5. 1 commit Conventional (PT-BR) por item. Ao concluir cada, MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.

6. Ao terminar: **push da branch** + `.done/2026-07-09-jornada-conversa.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy.** Rode `pnpm test:unit` dos arquivos tocados e garanta VERDE antes do push.

7. RESUMO FINAL: liste as decisões que tomou.
