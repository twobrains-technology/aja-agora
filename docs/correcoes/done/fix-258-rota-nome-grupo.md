---
id: FIX-258
titulo: "Rota determinística nome/valor de administradora → grupo exibido (FIX-252 não saiu)"
status: done
bloco: bloco-r5-toolinput-rota
arquivos:
  - src/lib/agent/orchestrator/choose-offer.ts
  - src/lib/agent/orchestrator/system-context.ts
  - src/lib/agent/orchestrator/index.ts
rodada: 2026-07-10 rodada 5 (Fable r4, FIX-252 NÃO feito)
executado_em: "2026-07-10"
nota: |
  `resolveOfferByMention`/`resolveOfferMentionForConversation` (choose-offer.ts, FIX-252) já
  existiam e já resolviam nome/valor→grupo determinístico — mas só eram chamados PÓS-simulação
  (runner.ts:~780, correção da âncora do dial), depois que a LLM já tinha chutado o groupId errado
  ou tentado re-buscar. Faltava a barreira ANTES da tool-call. Adicionado
  `buildMentionedOfferDirective` (choose-offer.ts): transforma o resultado da resolução numa
  diretiva citando o groupId LITERAL + administradora/valor/prazo, instruindo a não re-buscar/
  inventar/negar. `buildSystemContext` (system-context.ts) ganhou o parâmetro `mentionedOffer` que
  injeta essa diretiva no prompt do turno. `index.ts` chama `resolveOfferMentionForConversation`
  logo antes de montar o systemContext (todo turno de usuário, antes da LLM decidir) — rota
  determinística, Lei 1/4. `analyze.ts` não precisou de mudança: é só merge de qualificação
  (valor/prazo/lance), não tem nada de administradora/grupo — a peça reaproveitável já vivia
  inteira em choose-offer.ts.
---
## Gap (veredito r4: FIX-252 NÃO)
A rota determinística nome/valor→grupo exibido continua inexistente. O usuário nomeia "a ITAÚ"/
"a de 92 mil" (visível na comparison_table) e o LLM adivinha/erra o grupo, alimentando a espiral.
## Correção
- ANTES de deixar o LLM chamar tool, resolver determinístico: nome-de-administradora OU valor que
  casa com um grupo JÁ EXIBIDO (shown-groups) → groupId certo (ancora sobre entidade em tela,
  action-policy). Não depender do LLM.
## Regressão (TDD)
- "quero a ITAÚ" com ITAÚ exibida → resolve o groupId da ITAÚ.
- "a de 92 mil" → grupo 92.902 (não 100k).
