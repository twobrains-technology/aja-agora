Você é o executor do bloco `bloco-r9-3-consistencia-valor` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-3-consistencia-valor/` (`_bloco.md` +
   `fix-287-creditvalue-inconsistente-comparison-simulation.md` — root cause, cenário, correção,
   regressão exigida já estão prontos ali).

2. DESIGN: o `fix-287` já traz root cause investigado e correção proposta (tabela). Se ao
   investigar aparecer mais de um jeito razoável de propagar o `creditAdjustmentNotice` pro
   `comparison_table` (ex.: reescrever no momento da coerção vs anexar um campo de aviso na
   linha), **use `AskUserQuestion`** com a opção recomendada em 1º lugar, rótulo "(Recomendado)".
   Sem resposta em tempo razoável, siga a recomendada. Registre a decisão em
   `docs/decisoes/blocos/2026-07-12-bloco-r9-3-consistencia-valor.md`.

3. Execute o item: **FIX-287**. TDD strict — reproduza o cenário exato do dossiê (4 grupos com
   `creditValue:120000`, um deles simulado com nominal real 160.000) ANTES do fix (teste falha,
   tabela mente) e confirme que passa depois.

4. **Atenção ao overlap declarado no `_bloco.md`:** este bloco toca `ai-sdk.ts` nas regiões
   `present_comparison_table`/`present_simulation_result` (~1131-1171). Um OUTRO bloco da mesma
   onda (`bloco-r9-3-latencia-percebida`) toca `recommend_groups`/`executeRecommendGroups`
   (~503-521/1320-1331) no MESMO arquivo — regiões distintas, não deveria haver conflito real.
   Não precisa coordenar em tempo real com o outro bloco; a ordem de merge (este primeiro) já
   está declarada no `_bloco.md` de ambos.

5. 1 commit Conventional (PT-BR) pro item (`fix: ...`).

6. Ao concluir: MOVA `fix-287-creditvalue-inconsistente-comparison-simulation.md` pra
   `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: <data>`
   (best-effort — o orquestrador também garante isso no merge).

7. Ao terminar: **push da branch** (`git push origin fix/r9-3-consistencia-valor`) + gere
   `.done/{data}-bloco-r9-3-consistencia-valor.md` (resumo + decisões + testes + gaps). **NÃO
   abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é
   do ORQUESTRADOR. A sinalização de conclusão (tag-sentinela) é injetada automaticamente — só
   siga o footer.

8. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
   linha). Sem decisão real? Diga isso.
