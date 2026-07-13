Você é o executor do bloco `bloco-r10-4-topic-picker-serverside` no worktree isolado deste branch
(`fix/r10-4-topic-picker-serverside`), projeto aja-agora. Este bloco forka da base
`integ/consorcio-r10` JÁ COM as ondas 1, 2 e 3 integradas.

1. Leia `docs/correcoes/README.md` e
   `docs/correcoes/todo/bloco-r10-4-topic-picker-serverside/` inteiro (`_bloco.md` +
   `fix-309-*.md`). Leia `src/lib/agent/ai-sdk.ts` (região da tool `present_topic_picker`,
   ~linha 766), `src/lib/agent/orchestrator/artifact-guard.ts` (região 255-261) e
   `src/lib/agent/orchestrator/index.ts` inteiro (localize TODOS os `emitServerCard` já existentes
   — são o padrão de referência) antes de tocar em qualquer linha.

2. DESIGN: a abordagem já foi decidida (ver `_bloco.md`) — migrar pra emissão server-side
   determinística no controller, no ponto pós-`experience`. Detalhe real que sobra: se remover a
   tool `present_topic_picker` inteiramente do LLM ou mantê-la desabilitada/fora do allowlist como
   fallback documentado — decida pelo padrão mais simples e consistente com o resto do código
   (se outros cards migrados nesta jornada removeram a tool, siga o mesmo precedente). Sem
   trade-off técnico genuíno adicional, decida e siga — não pergunte.

3. Execute o item. TDD STRICT (é um invariante da cascata, mesma classe de bug já corrigida pra
   outros cards nesta campanha):
   - Escreva o teste de integração que reproduz o cenário: cassette avançando até pós-`experience`
     SEM o LLM chamar `present_topic_picker` espontaneamente → hoje `topic_picker` nunca aparece.
     Confirme que FALHA.
   - Implemente a emissão server-side no ponto certo da cascata.
   - Confirme que o teste agora PASSA: `topic_picker` aparece SEMPRE, independente do texto/decisão
     do LLM no turno.
   - Teste adicional: `topic_picker` não é emitido fora do ponto certo do funil (não regredir a
     fase).
   - Teste de regressão: os outros cards já emitidos via `emitServerCard` continuam funcionando
     (não quebrar o padrão compartilhado).
   Rode só os testes dos arquivos tocados. 🚫 Sem smoke de browser neste bloco.

4. 1 commit Conventional (PT-BR) por mudança lógica.

5. Mova o fix-309 concluído pra `docs/correcoes/done/`.

6. Push da branch (`git push origin fix/r10-4-topic-picker-serverside`) +
   `.done/{data}-bloco-r10-4-topic-picker-serverside.md`. **NÃO abra PR, NÃO faça merge na base
   (`integ/consorcio-r10` ou `develop`), NÃO rode deploy/restart.** A integração é
   EXCLUSIVAMENTE do orquestrador desta campanha — um bloco anterior (onda 2) já violou essa regra
   fazendo self-merge e isso gerou retrabalho e desconfiança no processo. Se você mergear por
   conta própria, o bloco será tratado como inválido e a onda inteira precisará ser reavaliada.
   Sua responsabilidade termina no push da branch.

7. RESUMO FINAL: o que mudou, se a tool LLM-driven foi removida ou só desativada (e por quê),
   teste de regressão criado, se algum caso de borda ficou de fora do escopo.
