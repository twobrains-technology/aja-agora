Você é o executor do bloco bloco-r9-4-bevi-degradacao no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-4-bevi-degradacao/` (`_bloco.md` + `fix-291-*.md` — root cause,
   cenário, correção, regressão exigida) ANTES de tocar em qualquer código.

2. **Escopo travado (decisão do Kairo já registrada):** NÃO paralelize as chamadas reais à Bevi
   (`search_groups`/`recommend_groups`/`simulate_quota` continuam sequenciais — é um
   PENDENTE-KAIRO à parte que exige confirmar com Bevi/AGX se PATCH concorrente na mesma proposta é
   seguro). Este bloco é só: (a) cap agregado de tempo/retry, (b) degradação honesta + recovery
   quando a busca falha/atrasa. NUNCA introduza concorrência nas chamadas Bevi.

3. **Investigação obrigatória ANTES de implementar a parte (b)**: o `fix-291` marca como NÃO
   CONFIRMADO A FUNDO qual arquivo exato decide avançar pro `two_paths`/fechamento sem checar
   `meta.revealCompleted` — candidatos prováveis citados no card:
   `src/lib/agent/qualify-state.ts` (`nextGate`/`decideShowGate`) e
   `src/lib/agent/orchestrator/two-paths-payload.ts`. Confirme lendo esses arquivos (e o caminho
   real de disparo do `two_paths`) antes de decidir onde por o gate. Se divergir do que o card
   supõe, ajuste sua implementação e registre no ADR/resumo final — não implemente às cegas contra
   uma suposição não confirmada.

4. DESIGN: há decisão real de onde/como implementar o cap agregado (qual camada mede o orçamento
   total — client, adapter ou tool) e onde por o check de `revealCompleted` antes de avançar o
   funil. Use `superpowers:brainstorming` se não for óbvio ao ler o código. Trade-off real → **
   `AskUserQuestion`** com opção recomendada em 1º lugar, rótulo "(Recomendado)" — segue o
   respondedor do Kairo; sem resposta, segue a recomendada (fallback anti-trava). Registre a
   decisão em `docs/correcoes/decisions/<data>-bloco-r9-4-bevi-degradacao.md`.

5. ⚠️ Overlap nível 2 declarado no `_bloco.md` (paralelo mesmo assim): `src/lib/agent/tools/ai-sdk.ts`
   × bloco-r9-4-reveal-serverside (você mexe em `runDiscovery`/`search_groups`/`recommend_groups`
   ~1249-1360; o outro bloco mexe nas tools de apresentação ~1148-1173, regiões diferentes). **O
   outro bloco mergeia PRIMEIRO** — se seu merge chegar depois e houver conflito de adjacência, é
   mecânico (linhas próximas, não a mesma lógica); resolva mantendo as duas mudanças.

6. Execute o FIX-291. TDD strict (bug real): escreva o teste que reproduz timeout/retry
   empilhado ANTES do fix (mock do client/adapter simulando falha persistente — NUNCA bata na Bevi
   real), veja FALHAR (tempo total estourando o teto esperado, ou artifact com campos vazios), veja
   passar depois do fix.

7. 1 commit Conventional (PT-BR) por item (aqui, 1 item = 1 ou 2 commits se (a) e (b) ficarem bem
   separados — sua escolha, documente no resumo final), mais o commit `docs:` do ADR se houver.

8. Ao concluir: MOVA `fix-291-*.md` pra `docs/correcoes/done/` com `status: done` + `commit:
   <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `docs/correcoes/todo/bloco-r9-4-bevi-degradacao/`. (Best-effort — orquestrador garante via
   merge/reconcile.)

9. Ao terminar: `git push origin fix/r9-4-bevi-degradacao` + gere
   `.done/{data}-bloco-r9-4-bevi-degradacao.md` (resumo + decisões + testes + gaps, incluindo o
   que a investigação do passo 3 confirmou/refutou). **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** A integração é do ORQUESTRADOR. A tag-sentinela é
   injetada automaticamente — só siga o footer.

10. RESUMO FINAL: liste as decisões de design que você tomou ("decidi X em vez de Y porque Z" por
    linha), incluindo onde de fato ficou o gate de `revealCompleted` (confirmado no passo 3). Sem
    decisão real? Diga isso.
