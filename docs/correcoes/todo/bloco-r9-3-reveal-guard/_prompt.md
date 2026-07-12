Você é o executor do bloco `bloco-r9-3-reveal-guard` no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e `docs/correcoes/todo/bloco-r9-3-reveal-guard/`
   (`_bloco.md` + `fix-286-reveal-guard-suprime-legitimo.md` — root cause, cenário, correção,
   regressão exigida já estão prontos ali).

2. DESIGN: o `fix-286` já traz root cause investigado e 2 caminhos de correção na tabela (via A:
   materializar o reveal server-side a partir de `revealGroupsById` reaproveitando
   `coerceRecommendationPayload`/`coerceComparisonPayload`; via B: degradar pra um D10 honesto de
   retry quando não há dados suficientes pra montar o card completo). Se, ao investigar o código,
   ficar claro que uma via é claramente melhor pro caso real (ex.: às vezes só `search_groups`
   rodou e `recommend_groups` nunca chegou — não dá pra montar recommendation_card sem ranking),
   **use `AskUserQuestion`** com a opção recomendada em 1º lugar, rótulo "(Recomendado)". Sem
   resposta em tempo razoável, siga a recomendada. Registre a decisão em
   `docs/decisoes/blocos/2026-07-12-bloco-r9-3-reveal-guard.md`.

3. Execute o item na ordem: **FIX-286**. TDD strict — o teste
   `index.fix-286-reveal-legitimo.integration.test.ts` (descrito na seção "Regressão exigida" do
   card) tem que FALHAR antes do fix (mostrando o texto verbatim de
   `buildToolErrorRecoveryFallback` sem `recommendation_card`/`gate:experience`) e PASSAR depois.

4. **NÃO regrida** `runner.fix-262-tool-error-cap.integration.test.ts`,
   `index.fix-266-recuperacao-resolve.integration.test.ts` e
   `index.fix-282-honestidade-toolerror.integration.test.ts` — rode-os explicitamente antes de
   fechar o item. O cenário de REPETIÇÃO pós-reveal (`meta.revealCompleted === true`) continua
   usando o fallback "já apareceram" — isso é comportamento correto, não mexa nele.

5. 1 commit Conventional (PT-BR) pro item (`fix: ...`).

6. Ao concluir: MOVA `fix-286-reveal-guard-suprime-legitimo.md` pra `docs/correcoes/done/` com
   `status: done` + `commit: <hash>` + `executado_em: <data>` (best-effort — o orquestrador
   também garante isso no merge).

7. Ao terminar: **push da branch** (`git push origin fix/r9-3-reveal-guard`) + gere
   `.done/{data}-bloco-r9-3-reveal-guard.md` (resumo + decisões + testes + gaps). **NÃO abra PR,
   NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do
   ORQUESTRADOR. A sinalização de conclusão (tag-sentinela) é injetada automaticamente — só siga
   o footer.

8. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
   linha). Sem decisão real? Diga isso.
