# Rodada 3 — Smoke reduzido, persona 3 (Renata) — Automóvel, "meio a meio"

> E2E reduzido pedido pelo juiz (veredito 7,5/10 condicional) pós-remoção do runtime Vercel.
> Coletado por agente (general-purpose, aba dedicada `tabId 1375915921`). Papel: só registro
> factual, sem julgamento de qualidade.

## ITEM 1 — Nunca oferece "Serviços"

**Confirmado: SIM (nunca apareceu).** Verificado programaticamente (busca case-insensitive por
"serviç" no texto completo do painel, 3093 caracteres, pós-busca real com ~28 ofertas). Todas as
ofertas eram de administradoras de automóvel (Itaú, Tradição, Banco do Brasil, Rodobens,
Canopus, Âncora).

## ITEM 4 — Lance embutido proativo/consultivo

**Confirmado: SIM.** Ao responder "Então, eu tenho uma parte do dinheiro pro lance, mas não
tenho tudo. Fico na dúvida se vale a pena dar o lance ou não.":

> "Olha só como isso se traduz na prática: sem lance você fica no fluxo normal (até 49 meses);
> com um lance de ~14% (uns R$ 12.800) a expectativa cai bastante; e com 30% (~R$ 28.000) você
> entra no grupo dos primeiros a contemplar. Como não é o valor cheio, dá pra combinar uma parte
> em dinheiro com lance embutido da própria carta — quer que eu monte esse mix pra caber no que
> você já tem guardado?"

Sugestão consultiva e proativa, texto gerado pelo modelo (não botão fixo).

## ITEM 3 — Fechamento com sucesso

**Confirmado: SIM.** `innerText.includes('Parabéns')` = true, `.includes('reservada')` = true:

> "Perfeito! Sua cota da ITAÚ está reservada, escolhida pela Aja Agora para o seu perfil — e a
> Aja Agora segue com você até a contemplação, e depois dela. Você não paga nada agora: a
> primeira parcela só vence quando o boleto chegar na sua casa. Parabéns! Agora você está
> oficialmente mais perto da sua conquista! Só pra deixar claro desde já: a contemplação
> acontece por sorteio ou lance, e não tem data garantida — ninguém pode prometer isso. O que a
> gente garante é te acompanhar até lá."

Compliant: sem promessa de contemplação garantida nem prazo.

## ITEM 2 — Resume pós-fechamento (checkpoint crítico)

Fluxo: reload → "Fale com a AJA" → modal "Continuar de onde você parou?" → "Voltar à conversa" →
histórico completo restaurado (incluindo card "Sua proposta está pronta") → "Você voltou —
continue de onde parou" → chip "Voltei" → resposta integral do agente:

> **"Oi de novo, Renata! Sua cota do Itaú já está garantida — R$ 92.902 em 49 meses, sem lance.
> Nosso time vai te chamar no WhatsApp em breve pra seguir com os próximos passos. Precisa de
> alguma coisa agora?"**

### Comparação com o critério de aceitação (ITEM 2)

| Critério | Atendido? |
|---|---|
| Primeira frase reconhece que a proposta já está fechada | ✅ "Sua cota do Itaú já está garantida" |
| Reforça encaminhamento pro WhatsApp | ✅ "Nosso time vai te chamar no WhatsApp em breve" |
| Não repete pergunta de etapa anterior | ✅ nenhuma pergunta de decisão pendente |
| Linguagem natural, gerada pelo modelo | ✅ frase original, não texto fixo |

Terceiro data point (junto com Marina/spot-check e Helena/smoke) confirmando o replantio do
FIX-368 no LangGraph — terceira categoria (Automóvel), mesmo resultado consistente.

## Problemas de ambiente

Nenhum. Túnel LLM estável durante toda a sessão, sem travas >40s nem "Tentar novamente".

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| ITEM 1 (nunca oferece Serviços) | ✅ Confirmado |
| ITEM 4 (lance embutido consultivo) | ✅ Confirmado |
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume reconhece fechamento, pós-replantio LangGraph) | ✅ Confirmado — 3º data point da rodada 3 |
