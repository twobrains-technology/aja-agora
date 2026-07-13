Você é o executor do bloco `bloco-r10-4-happy-path-ceremony` no worktree isolado deste branch
(`fix/r10-4-happy-path-ceremony`), projeto aja-agora. Este bloco forka da base
`integ/consorcio-r10` JÁ COM as ondas 1, 2 e 3 integradas.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-4-happy-path-ceremony/`
   inteiro (`_bloco.md` + `fix-311-*.md`). Leia `src/app/api/chat/route.ts` inteiro, com foco nas
   3 regiões citadas: `508-522` (ação `interest`), `1125-1145` (aceite do simulador) e `1147-1189`
   (a cerimônia JÁ implementada corretamente no ramo de recusa) — antes de tocar em qualquer
   linha, entenda exatamente o que a região 1147-1189 faz, porque é o comportamento que os outros
   dois ramos precisam passar a ter também.

2. DESIGN: a abordagem já foi decidida (ver `_bloco.md`) — extrair a cerimônia
   `scarcity`→`decision_prompt` pra um passo comum e religar os dois fast-paths do ramo feliz a
   ela. Detalhe real que sobra: forma exata da extração (função helper local ao arquivo é
   suficiente; não crie abstração maior do que o necessário). Sem trade-off técnico genuíno
   adicional, decida e siga — não pergunte.

3. Execute o item. TDD STRICT (afeta a ordem do fecho — um dos pontos centrais do estudo original,
   P3 "reveal pula direto pra decisão sem cerimônia"):
   - Escreva o teste de integração que reproduz o cenário: usuário aceita a oferta de cara (ação
     `interest`) → hoje `scarcity`/`decision_prompt` NUNCA aparecem antes de `contract_form`.
     Confirme que FALHA.
   - Implemente a extração da cerimônia comum + religamento dos dois fast-paths.
   - Confirme que o teste agora PASSA: `scarcity` e `decision_prompt` aparecem, NESSA ORDEM, ANTES
     de `contract_form`/`whatsapp_optin`.
   - Teste equivalente pro branch de aceite do simulador (`1125-1145`).
   - Teste de regressão: o ramo de recusa/ambiguidade (que já tinha a cerimônia) continua
     funcionando idêntico a antes.
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por mudança lógica.

5. Mova o fix-311 concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-4-happy-path-ceremony`) +
   `.done/{data}-bloco-r10-4-happy-path-ceremony.md`. **NÃO abra PR, NÃO faça merge na base
   (`integ/consorcio-r10` ou `develop`), NÃO rode deploy/restart.** A integração é
   EXCLUSIVAMENTE do orquestrador desta campanha — um bloco anterior (onda 2) já violou essa regra
   fazendo self-merge e isso gerou retrabalho e desconfiança no processo. Se você mergear por
   conta própria, o bloco será tratado como inválido e a onda inteira precisará ser reavaliada.
   Sua responsabilidade termina no push da branch.

7. RESUMO FINAL: o que mudou, forma da extração escolhida, teste de regressão criado, se algum
   caso de borda ficou de fora do escopo.
