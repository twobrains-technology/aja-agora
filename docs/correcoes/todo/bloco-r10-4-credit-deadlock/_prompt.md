Você é o executor do bloco `bloco-r10-4-credit-deadlock` no worktree isolado deste branch
(`fix/r10-4-credit-deadlock`), projeto aja-agora. Este bloco forka da base `integ/consorcio-r10`
JÁ COM as ondas 1, 2 e 3 integradas.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-4-credit-deadlock/` inteiro
   (`_bloco.md` + os 4 fix-cards: FIX-306, FIX-307, FIX-310, FIX-312). Leia também
   `src/lib/agent/orchestrator/analyze.ts` e `src/lib/agent/qualify-state.ts` inteiros antes de
   tocar em qualquer linha — os 4 fixes coexistem no mesmo arquivo/região e uma mudança feita sem
   entender as outras 3 vai gerar retrabalho.

2. DESIGN: a abordagem de cada fix já foi decidida (ver `_bloco.md`). Detalhes reais que sobram:
   (a) FIX-307 — o N de tentativas do escape condicional deve ser o MESMO N já usado no FIX-305
   (onda 3, gate `timeframe`) — leia esse código antes de inventar um valor novo; (b) FIX-306 — ao
   ajustar a condição de promoção, confirme que NÃO quebra o caminho antigo (valor mencionado em
   turno separado do desire, cenário Madalena) — isso é regressão exigida explícita no fix-card;
   (c) FIX-312 — a correção gramatical deve cobrir género (masculino/feminino do item), não só o
   caso "Corolla". Sem trade-off técnico genuíno adicional, decida e siga — não pergunte.

3. Execute os 4 itens NESSA ORDEM (306 e 310 primeiro — mesma raiz de "captura oportunista sem
   trava correta" em `analyze.ts`; depois 307 como defesa em profundidade; 312 por último, é só
   copy). TDD STRICT pra 306/307/310 (lógica de negócio crítica — o funil não pode travar):
   - Pra CADA fix: escreva o teste de regressão que REPRODUZ o cenário exato do fix-card
     (idealmente baseado no cassette real citado), confirme que ele FALHA contra o código atual,
     implemente a correção mínima, confirme que passa.
   - FIX-306: teste com desire+valor no MESMO turno → `creditMax` preenchido, `nextGate()` avança.
     Teste de regressão do caminho ANTIGO (valor em turno separado) continua verde.
   - FIX-307: teste credit travado 3x COM `creditMentionedAtDesire` → promove e segue. Teste
     credit travado 3x SEM nenhum valor → continua travado. Teste de regressão do FIX-305 (outros
     gates com escape) continua verde.
   - FIX-310: teste captura oportunista de `experiencePrev` ANTES do gate `experience` ativo → NÃO
     preenche. Teste captura QUANDO o gate está ativo → preenche normal (caminho feliz intacto).
   - FIX-312: teste unitário — copy do gate `credit` nunca produz "esse um X". Cassette do bug real
     (Madalena) confirmando que a 2ª+ tentativa não repete verbatim.
   Rode só os testes dos arquivos tocados (`analyze.ts`, `qualify-state.ts`, `gate-questions.ts` e
   seus arquivos de teste). 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por fix (4 commits, não 1 só) — facilita bisect se algo quebrar
   depois.

5. Mova os 4 fix-cards concluídos pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-4-credit-deadlock`) +
   `.done/{data}-bloco-r10-4-credit-deadlock.md` resumindo os 4 fixes e a evidência de teste.
   **NÃO abra PR, NÃO faça merge na base (`integ/consorcio-r10` ou `develop`), NÃO rode
   deploy/restart.** A integração é EXCLUSIVAMENTE do orquestrador desta campanha — um bloco
   anterior (onda 2) já violou essa regra fazendo self-merge e isso gerou retrabalho e
   desconfiança no processo. Se você mergear por conta própria, o bloco será tratado como inválido
   e a onda inteira precisará ser reavaliada. Sua responsabilidade termina no push da branch.

7. RESUMO FINAL: pra cada um dos 4 fixes — o que mudou, teste de regressão criado, se algum
   trade-off técnico precisou de decisão própria (e qual foi) — e se sobrou algum caso de borda
   que você identificou mas não teve escopo de cobrir.
