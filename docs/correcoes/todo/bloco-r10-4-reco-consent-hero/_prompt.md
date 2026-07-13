Você é o executor do bloco `bloco-r10-4-reco-consent-hero` no worktree isolado deste branch
(`fix/r10-4-reco-consent-hero`), projeto aja-agora. Este bloco forka da base `integ/consorcio-r10`
JÁ COM as ondas 1, 2 e 3 integradas.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-r10-4-reco-consent-hero/` inteiro
   (`_bloco.md` + `fix-308-*.md`). Leia `src/lib/agent/orchestrator/index.ts` (região 60-320, foco
   em `detectYesNoText`/`YES_TEXT_MARKERS` e no bloco de liberação do hero ~276-312) e
   `src/lib/agent/qualify-state.ts` (`nextGate()`, região do gate `reco-consent`) inteiros antes de
   tocar em qualquer linha.

2. DESIGN: a abordagem já foi decidida (ver `_bloco.md`) — acoplar `nextGate()` a
   `recoConsentAnswered` real, robustecer `YES_TEXT_MARKERS`. Detalhe real que sobra: a lista
   exata de marcadores novos ("pode"/"pode mostrar"/"mostra"/"manda ver" são sugestões do
   fix-card, não lista fechada — use julgamento pra cobrir variantes plausíveis de "sim" a um
   convite sem virar falso-positivo pra outras perguntas). Sem trade-off técnico genuíno adicional,
   decida e siga — não pergunte.

3. Execute o item. TDD STRICT (lógica crítica — afeta a ordem do fecho vs. a recomendação, um dos
   pontos mais citados no estudo original P1-P10):
   - Escreva o teste de integração que reproduz o cassette real: reco-consent perguntado → "Pode
     mostrar" → hoje o hero NÃO libera no turno seguinte. Confirme que FALHA.
   - Implemente: (a) `nextGate()` não avança a cascata enquanto `recoConsentAnswered` for falso;
     (b) `YES_TEXT_MARKERS` reconhece as novas variantes.
   - Confirme que o teste agora PASSA: hero libera no turno seguinte à resposta afirmativa.
   - Teste adicional: cascata NÃO avança pra timeframe/lance/decisão enquanto reco-consent não foi
     respondido com clareza (nem positiva nem negativamente).
   - Teste adicional: `contract_form`/`whatsapp_optin` nunca disparam antes do hero ter sido
     liberado (reprodução exata do bug real, onde isso aconteceu).
   - Teste de regressão: caminho onde o usuário responde "não" ou pede mais detalhes continua
     funcionando (não regredir negativas/hesitação).
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por mudança lógica.

5. Mova o fix-308 concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-4-reco-consent-hero`) +
   `.done/{data}-bloco-r10-4-reco-consent-hero.md`. **NÃO abra PR, NÃO faça merge na base
   (`integ/consorcio-r10` ou `develop`), NÃO rode deploy/restart.** A integração é
   EXCLUSIVAMENTE do orquestrador desta campanha — um bloco anterior (onda 2) já violou essa regra
   fazendo self-merge e isso gerou retrabalho e desconfiança no processo. Se você mergear por
   conta própria, o bloco será tratado como inválido e a onda inteira precisará ser reavaliada.
   Sua responsabilidade termina no push da branch.

7. RESUMO FINAL: o que mudou, lista final de marcadores de sim adicionados, teste de regressão
   criado, se algum caso de borda ficou de fora do escopo.
