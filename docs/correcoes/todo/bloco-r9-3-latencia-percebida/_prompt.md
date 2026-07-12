Você é o executor do bloco `bloco-r9-3-latencia-percebida` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-3-latencia-percebida/` (`_bloco.md` +
   `fix-288-chip-status-estatico.md` + `fix-289-recommend-groups-rebusca.md` — root cause,
   cenário, correção, regressão exigida já estão prontos em cada card).

2. DESIGN: os dois cards já trazem root cause investigado e correção proposta em tabela. Se ao
   investigar aparecer mais de um jeito razoável de implementar (ex.: exatamente quais estágios
   de copy o chip mostra no FIX-288, ou o shape exato do reuso de grupos no FIX-289), **use
   `AskUserQuestion`** com a opção recomendada em 1º lugar, rótulo "(Recomendado)". Sem resposta
   em tempo razoável, siga a recomendada. Registre a decisão em
   `docs/decisoes/blocos/2026-07-12-bloco-r9-3-latencia-percebida.md`.

3. Execute os itens NESTA ORDEM: **FIX-288 primeiro** (frontend, `streaming-dots.tsx`/
   `chat-message.tsx` — timer que evolui a copy do chip com o tempo), **FIX-289 depois**
   (backend, `recommend_groups` reaproveita os grupos que `search_groups` já buscou no mesmo
   turno). TDD strict pros dois — os testes descritos na seção "Regressão exigida" de cada card
   têm que FALHAR antes do fix e PASSAR depois.

4. **NÃO paralelize as chamadas reais à Bevi** — isso é um PENDENTE-KAIRO fora de escopo (ver
   `_bloco.md`). FIX-289 é dedupe de uma chamada redundante, não paralelização.

5. **Atenção ao overlap declarado no `_bloco.md`:** FIX-289 toca `ai-sdk.ts` na região
   `recommend_groups`/`executeRecommendGroups` (~503-521/1320-1331). Um OUTRO bloco da mesma onda
   (`bloco-r9-3-consistencia-valor`) toca `present_comparison_table`/`present_simulation_result`
   (~1131-1171) no MESMO arquivo — regiões distintas, não deveria haver conflito real. A ordem
   de merge (o outro bloco primeiro, este depois) já está declarada nos dois `_bloco.md`.

6. 1 commit Conventional (PT-BR) por item (`fix: ...` × 2).

7. Ao concluir cada item: MOVA o respectivo `fix-28X-...md` pra `docs/correcoes/done/` com
   `status: done` + `commit: <hash>` + `executado_em: <data>` (best-effort — o orquestrador
   também garante isso no merge).

8. Ao terminar: **push da branch** (`git push origin fix/r9-3-latencia-percebida`) + gere
   `.done/{data}-bloco-r9-3-latencia-percebida.md` (resumo + decisões + testes + gaps). **NÃO
   abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é
   do ORQUESTRADOR. A sinalização de conclusão (tag-sentinela) é injetada automaticamente — só
   siga o footer.

9. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
   linha). Sem decisão real? Diga isso.
