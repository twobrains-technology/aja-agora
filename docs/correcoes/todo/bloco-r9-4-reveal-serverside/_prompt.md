Você é o executor do bloco bloco-r9-4-reveal-serverside no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-4-reveal-serverside/` (`_bloco.md` + `fix-290-*.md` — root
   cause, cenário, correção, regressão exigida) ANTES de tocar em qualquer código.

2. Contexto do projeto (leia antes de decidir a implementação): a LEI 1/4 deste projeto é
   "invariante crítico vira CÓDIGO server-side, não regra-no-prompt" — é a lição-mãe de 3 rodadas
   seguidas travadas no loop de QA (`.processo/loop/2026-07-09-agente-vendas-consorcio.md`). O
   `FIX-290` é o caso mais claro dela nesta onda: o pareamento `recommendation_card` ×
   `comparison_table` é regra-no-prompt (`directives.ts:348`) sem NENHUM invariante em código.

3. DESIGN: o `fix-290` já traz root cause investigado e 2 alternativas de correção concretas
   (tabela "Correção proposta"). Há uma decisão de design real entre elas (onde exatamente forçar
   a emissão — no fim do loop de stream do `runner.ts`, ou no orchestrator `index.ts` reaproveitando
   o padrão do FIX-286). Use a skill `superpowers:brainstorming` só se, ao investigar o código, você
   achar um 3º caminho melhor ou achar que a decisão não é óbvia. Se for direto, PULE — o card já
   fechou o suficiente. Se houver trade-off real, **FAÇA a pergunta via `AskUserQuestion`** com a
   opção recomendada em 1º lugar e rótulo terminando em "(Recomendado)" — o agente respondedor do
   Kairo responde; sem resposta em tempo razoável, siga a recomendada (fallback anti-trava, NÃO
   trave). Registre a decisão em `docs/correcoes/decisions/<data>-bloco-r9-4-reveal-serverside.md`.

4. ⚠️ Overlaps nível 2 declarados no `_bloco.md` (paralelo mesmo assim, resolução mecânica):
   - `src/lib/agent/orchestrator/recommendation-payload.ts` × bloco-r9-4-valor-honestidade
     (regiões diferentes: você mexe em `coerceComparisonPayload` ~236-259, o outro bloco em
     `coerceRevealCota` ~82-148). **Você mergeia PRIMEIRO** — não precisa esperar nada, só saiba
     que o outro bloco vai ajustar por cima.
   - `src/lib/agent/tools/ai-sdk.ts` × bloco-r9-4-bevi-degradacao (regiões diferentes: você mexe
     nas tools `present_comparison_table`/`present_recommendation_card` ~1148-1173, o outro bloco em
     `runDiscovery`/`search_groups`/`recommend_groups` ~1249-1360). **Você mergeia PRIMEIRO** aqui
     também.

5. Execute o FIX-290. TDD strict (bug real): escreva o teste de integração que reproduz o cenário
   (modelo chama só `present_recommendation_card` com 2+ grupos e para — `comparison_table` nunca
   sai) ANTES do fix, veja FALHAR, corrija, veja passar. Cubra o caso de borda (1 grupo único →
   NUNCA forçar `comparison_table`) e o caminho feliz (modelo chama as duas — sem duplicar).

6. 1 commit Conventional (PT-BR) por item (aqui, 1 item = 1 commit, mais o commit `docs:` do ADR
   se houver decisão de design registrada).

7. Ao concluir: MOVA `fix-290-*.md` pra `docs/correcoes/done/` com `status: done` + `commit:
   <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `docs/correcoes/todo/bloco-r9-4-reveal-serverside/`. (Best-effort — o orquestrador garante via
   merge/reconcile se você esquecer.)

8. Ao terminar: `git push origin fix/r9-4-reveal-serverside` + gere
   `.done/{data}-bloco-r9-4-reveal-serverside.md` (resumo + decisões + testes + gaps). **NÃO abra
   PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração é do
   ORQUESTRADOR. A sinalização de conclusão (tag-sentinela) é injetada automaticamente — só siga o
   footer.

9. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
   linha). Sem decisão real (seguiu a correção proposta do card ao pé da letra)? Diga isso.
