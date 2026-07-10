---
id: FIX-252
titulo: "Rota determinística nome-de-administradora → grupo exibido (recovery de escolha)"
status: done
bloco: bloco-r4-ancora
arquivos:
  - src/lib/agent/orchestrator/choose-offer.ts
  - src/lib/agent/orchestrator/runner.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, gap da rota nome→grupo)
executado_em: "2026-07-10"
---
## Gap (veredito FINAL §6 + item "pro teto" #3)
Usuário nomeia uma administradora/valor visível na tela ("quero a ITAÚ", "a de 92 mil") e o
agente resolve o grupo ERRADO (pegou 100k em vez do 92.902 nomeado). A rota determinística
nome/valor→grupo exibido não existe (o próprio commit FIX-249 registrou como fora de escopo).
## Correção
- `choose-offer.ts`/resolução: quando o usuário nomeia uma administradora OU um valor que casa
  com um grupo JÁ EXIBIDO (shown-groups), resolver determinístico pro groupId certo — não deixar
  o LLM adivinhar. Ancora sobre entidade vista em tela (action-policy).
## Regressão (TDD)
- "quero a ITAÚ" com ITAÚ na comparison_table → resolve o groupId da ITAÚ exibida.
- "a de 92 mil" → grupo 92.902 (não 100k).

## Correção aplicada
`resolveOfferByMention` (choose-offer.ts) resolve por nome de administradora (normalizado,
sem acento/caixa) OU por valor aproximado mencionado no texto ("92 mil", "R$ 92.902,00",
formatação pt-BR) contra a lista de cotas JÁ EXIBIDAS (`listShownOffers`) — nunca inventa
(nome/valor ambíguos entre si, ou sem match → null).

Ponto de aplicação (`runner.ts`, bloco FIX-6/what-if): depois que `simulate_quota` retorna,
se o texto do turno resolve DETERMINISTICAMENTE pra um grupo diferente do que a LLM simulou,
a âncora (`meta.recommendedOffer`) usa o grupo resolvido — nunca o palpite da LLM. Isso fecha
o caso que importa pro fechamento (proposta REAL na Bevi nunca sai do grupo errado).

**Gap residual, honesto**: a correção age sobre a ÂNCORA pós-simulação, não sobre os
ARGUMENTOS da chamada `simulate_quota` em si (isso exigiria interceptar a tool no
`ai-sdk.ts`, fora do escopo declarado deste bloco). Ou seja: se a LLM simular o grupo
errado, o CARD daquele turno (`simulation_result`) ainda pode mostrar os números do
grupo errado por um turno — mas o estado que alimenta o fechamento (`recommendedOffer`)
já corrige antes de qualquer `contract-submit`. Registrado como item de follow-up (a
correção "na origem" da tool-call), não bloqueante pro P0.
