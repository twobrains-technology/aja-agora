Você é o executor do bloco **bloco-regua** (`feat/regua-cadencia`) no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-regua/` (`_bloco.md` + cada `fix-NN`).

2. CONTEXTO QUE NÃO PODE SER PERDIDO (medido em produção em 28/09/2026): a régua está LIGADA
   (`REMARKETING_ATIVO=1`) e o ciclo roda a cada 30 s, mas **não entra ninguém**:
   `[remarketing-cycle] avaliadas 210, elegíveis 0` — 180 excluídas por `sem_contato`, 9 por `teste`,
   8 por `telefone_da_equipe`, 8 por `ja_na_regua`, 4 por `parada_ha_mais_de_7_dias`. A cadência em vigor
   é a de FÁBRICA (90 min, depois 3 dias, depois 5 dias) — não a curta combinada na reunião.

3. DESIGN — há UMA decisão real, e ela já está tomada no PRD (`docs/design/planos/2026-09-22-frente-aja-agora-medicao-remarketing-e-base.md`,
   §AJA-20 T3): os toques intra-janela ganham **contador próprio** e `src/lib/remarketing/retomada.ts`
   **fica intacto** (o contador de retomadas de lá é do watchdog do turno que morreu, outro problema).
   Siga a recomendação do PRD; registre em `docs/decisoes/blocos/2026-09-28-bloco-regua.md` (o que
   decidir, opções, quem decidiu, escolhida + porquê) e commite com `docs:`. Se você discordar da
   recomendação com evidência no código, PARE e registre a dúvida no ADR em vez de decidir sozinho.

4. TDD STRICT para 376, 377 e 378 (é lógica e invariante). A prova de 377 é **por comando**: um teste
   de integração no ciclo que mostra o toque 1, o 2 e o 3 SAINDO com a escala curta ligada. Rode só os
   arquivos tocados: `pnpm vitest run src/lib/remarketing/` e `pnpm vitest run src/lib/workers/`.
   **NÃO rode a suíte inteira** e **NÃO rode smoke/QA de browser**.

5. 🚫 **NÃO DISPARE MENSAGEM REAL.** Nenhum teste ou comando pode atingir WhatsApp de cliente. Use
   `deps` injetadas / mock do dispatcher. Se precisar de número, use `TELEFONES_DA_EQUIPE`.

6. 1 commit Conventional (PT-BR) por item, na ordem de `itens:`.

7. Ao concluir cada item, mova o `fix-NN` para `docs/correcoes/done/` com `status: done`,
   `commit:` e `executado_em:` (best-effort).

8. Ao terminar: **push da branch** + `.done/{data}-bloco-regua.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy/restart de worker.**

9. RESUMO FINAL: quais decisões você tomou, e qual a cadência resultante (valores efetivos) — o dono
   vai conferir isso contra o combinado na reunião.
