Você é o executor do bloco `bloco-r10-3-timeframe-stuck` no worktree isolado deste branch
(`fix/r10-3-timeframe-stuck`), projeto aja-agora. Este bloco forka da base `integ/consorcio-r10`
JÁ COM as ondas 1 e 2 integradas.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-3-timeframe-stuck/` inteiro
   (`_bloco.md` + `fix-305-*.md`).

2. DESIGN: a decisão de PRODUTO (default após N tentativas, nunca travar) já foi tomada pelo
   Kairo — não re-pergunte isso. Mas HÁ decisões técnicas reais que sobram: (a) valor exato do N
   de tentativas (2 ou 3?), (b) valor do prazo default (12 meses é sugestão, confirme se faz
   sentido olhar `qualify-config.ts` ou dados reais de mercado pra um default melhor), (c) nome
   exato do novo campo de metadata e se `lance`/`lance-value`/`lance-embutido` de fato estão fora
   de `COLLECTION_GATES` hoje (confirme lendo o código ANTES de assumir) e se precisam do mesmo
   tratamento. Use `AskUserQuestion` só se houver trade-off técnico genuíno; sem resposta em tempo
   razoável, siga a opção mais simples/conservadora. Registre em
   `docs/decisoes/blocos/2026-07-13-bloco-r10-3-timeframe-stuck.md`.

3. Execute o item. TDD STRICT (é lógica de negócio crítica — o funil não pode travar):
   - Primeiro, escreva o teste de regressão que REPRODUZ o cenário travado (3-4 turnos neutros
     seguidos no gate `timeframe`, sem prazo extraído) e confirme que ele FALHA contra o código
     atual (funil trava, `simulator-offer` nunca é alcançado).
   - Implemente o mecanismo de escape (contador `gateStuckTurns` ou nome equivalente + fallback
     de default).
   - Confirme que o teste de regressão agora PASSA.
   - Teste positivo: resposta clara de prazo na 1ª/2ª tentativa usa o valor real (não regride o
     caminho feliz).
   - Se `lance`/`lance-value`/`lance-embutido` tiverem o MESMO risco, aplique o mesmo mecanismo e
     documente no resumo.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. Depois dos testes verdes, tente re-rodar `scripts/bakeoff.sh` com Qwen (se o ambiente permitir
   — túnel LiteLLM etc., ver `.done/2026-07-12-bloco-r10-2-bakeoff-regua.md` pra saber como o
   bloco anterior configurou isso) e comparar o score novo contra os dois anteriores (0.774
   baseline, 0.68 pós-onda-1). Se o ambiente não permitir de forma confiável, documente como
   PENDENTE — não é bloqueante pro fix de código, que já tem TDD.

5. 1 commit Conventional (PT-BR) por mudança lógica.

6. Mova o fix-NN concluído pra `docs/correcoes/done/`.

7. Push da branch (`git push origin fix/r10-3-timeframe-stuck`) +
   `.done/{data}-bloco-r10-3-timeframe-stuck.md` com o score do bakeoff (se conseguiu re-rodar) em
   destaque. NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart — a integração na base é do
   ORQUESTRADOR (violar isso quebra a barreira de segurança da campanha).

8. RESUMO FINAL: valor de N escolhido, default de prazo escolhido, se outros gates precisaram do
   mesmo tratamento, score do bakeoff antes×depois (se conseguiu medir).
