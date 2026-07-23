# Rodada 3 — Smoke reduzido, persona 1 (Helena) — Imóvel

> E2E reduzido pedido pelo juiz (veredito 7,5/10 condicional) pós-remoção do runtime Vercel:
> smoke rápido de ITEM 1/3 (código não mudou hoje) + checkpoint completo de ITEM 2/resume (único
> item que mudou de código). Coletado por agente (general-purpose, não Haiku — dado o histórico
> de instabilidade do coletor Haiku nesse fluxo multi-etapas, registrado em memória). Papel:
> só registro factual, sem julgamento de qualidade.

## ITEM 1 — Nunca oferece "Serviços"

**Confirmado: SIM (nunca apareceu).** Verificado por inspeção do card comparativo de ofertas
(RODOBENS, TRADIÇÃO, ÂNCORA, ITAÚ e outras) e por checagem programática
(`document.body.innerText` inteiro da sessão, 15.876 caracteres) — a string "Serviç"/"Servic"
não ocorre em nenhum momento.

## ITEM 3 — Fechamento com sucesso

**Confirmado: SIM.** Resposta ao "Confirmar e contratar":
> "Perfeito! Sua cota da RODOBENS está reservada, escolhida pela Aja Agora para o seu perfil —
> e a Aja Agora segue com você até a contemplação, e depois dela. Você não paga nada agora: a
> primeira parcela só vence quando o boleto chegar na sua casa."
> "Parabéns! Agora você está oficialmente mais perto da sua conquista! Só pra deixar claro
> desde já: a contemplação acontece por sorteio ou lance, e não tem data garantida — ninguém
> pode prometer isso. O que a gente garante é te acompanhar até lá."

Checagem programática: `innerText.includes('Parabéns')` = true, `innerText.includes('reservada')`
= true. Card "Sua proposta está pronta" (botão "Ver minha proposta") também presente.

## ITEM 2 — Resume pós-fechamento (checkpoint crítico da rodada)

Fluxo: reload → "Fale com a AJA" → modal "Continuar de onde você parou?" → "Voltar à conversa"
→ histórico completo recarrega → chip "Voltei" dispara automaticamente → resposta integral do
agente (sem cortes, confirmada via `document.body.innerText`):

> **"Oi, Helena, que bom que voltou! Sua reserva com a RODOBENS já está confirmada — R$ 2.037
> por mês em 216 meses — e um atendente da Aja Agora vai falar com você pelo WhatsApp em breve
> pra seguir com os próximos passos. Como posso te ajudar agora?"**

### Comparação com o critério de aceitação (ITEM 2)

| Critério | Atendido? |
|---|---|
| Primeira frase reconhece que a proposta já está fechada | ✅ "Sua reserva com a RODOBENS já está confirmada" |
| Reforça encaminhamento pro WhatsApp | ✅ "um atendente da Aja Agora vai falar com você pelo WhatsApp em breve" |
| Não repete pergunta de etapa anterior | ✅ nenhuma pergunta de decisão pendente |
| Linguagem natural, gerada pelo modelo | ✅ frase original, não texto fixo |

Segundo data point (após Marina, rodada 3 spot-check) confirmando o replantio do FIX-368 no
LangGraph — categoria diferente (Imóvel vs. Imóvel — mesma categoria, mas nome/oferta/valores
diferentes), mesmo resultado.

## Problemas de ambiente encontrados (separados de achados de produto)

- **Túnel LiteLLM caído no início da sessão** (mesmo padrão já documentado na skill
  `tunel-litellm`) — turnos travando com `finishReason: null`, tool `keepalive` em loop.
  Resolvido subindo o túnel SSM de novo e validando com chamada real ao gateway. Não é bug de
  produto.

## Observação de produto (registro factual, sem julgamento de causa)

Ao clicar "Fale com a AJA" logo após selecionar o chip "Imóvel" sem trocar mensagens (ainda no
gate de nome), o app pulou direto para o auto-resume ("Você voltou..." + "Voltei" automático) em
vez de mostrar o modal de escolha "Continuar/Começar nova". O modal de escolha só apareceu de
fato quando a conversa já estava fechada (pós-contratação). Não avaliado se é intencional —
registrado como observação.

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| ITEM 1 (nunca oferece Serviços) | ✅ Confirmado |
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume reconhece fechamento, pós-replantio LangGraph) | ✅ Confirmado — 2º data point da rodada 3 |
