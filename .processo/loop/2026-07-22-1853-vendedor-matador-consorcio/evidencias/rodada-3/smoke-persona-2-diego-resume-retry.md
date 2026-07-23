# Rodada 3 — Reteste isolado do resume, persona Diego (moto) — sem paralelismo

> Reteste do checkpoint ITEM 2 que colidiu no smoke original (`smoke-persona-2-diego.md`) por
> paralelismo com outro agente no mesmo perfil de Chrome. Desta vez rodado SOZINHO (nenhum
> outro agente ativo). Nome "Diego2" e conversa nova, pra garantir isolamento.

## ITEM 3 — Fechamento com sucesso

**Confirmado: SIM.** Fluxo: chip "Moto" → nome "Diego2" → valor "uns 25 mil" → CPF
037.802.511-24 / celular (62) 99464-1111 + LGPD → busca real (4 ofertas: Tradição, Banco do
Brasil) → recomendação Tradição (R$ 25.231, parcela R$ 551,27/mês, 61 meses) → "Confirmar e
contratar". Verificação programática: `hasParabens: true`, `hasReservada: true`.

## ITEM 2 — Resume pós-fechamento (checkpoint crítico, isolado)

Reload → "Fale com a AJA" → modal "Continuar de onde você parou?" → "Voltar à conversa" →
histórico completo carregado → chip "Voltei" → resposta integral do agente:

> **"E aí, Diego! Sua reserva com a Tradição já está confirmada — parcela de R$ 551,27 por 61
> meses — e em breve um atendente da Aja Agora fala com você pelo WhatsApp pra seguir com os
> próximos passos. Ficou alguma dúvida que eu possa ajudar agora?"**

**Confirmação de isolamento** (sem colisão desta vez): checagem programática confirmou
`hasCPF: true` (037...24), `hasCelular: true` ((62) 99464-1111), `hasDiego: true`,
`hasMoto: true`, `hasTradicao: true` — parcela (R$ 551,27) e prazo (61 meses) citados na
resposta batem exatamente com os valores fechados nesta mesma sessão, antes do reload.

### Comparação com o critério de aceitação (ITEM 2)

| Critério | Atendido? |
|---|---|
| Primeira frase reconhece que a proposta já está fechada | ✅ "Sua reserva com a Tradição já está confirmada" |
| Reforça encaminhamento pro WhatsApp | ✅ "em breve um atendente da Aja Agora fala com você pelo WhatsApp" |
| Não repete pergunta de etapa anterior | ✅ nenhuma pergunta de decisão pendente |
| Linguagem natural, gerada pelo modelo | ✅ frase original, não texto fixo |

**Quarto data point** confirmando o replantio do FIX-368 no LangGraph, e o primeiro na
categoria Moto — completa a cobertura das 3 categorias pedidas pelo juiz (Imóvel × Marina/
Helena, Automóvel × Renata, Moto × Diego).

## Problemas de ambiente

- A extensão `claude-in-chrome` caiu uma vez ("Browser extension is not connected") durante a
  digitação, reconectou sozinha na chamada seguinte, sem perda de estado da conversa.

## Achado funcional fora do escopo deste checkpoint (registro factual, sem julgamento)

No funil pré-fechamento, o card de recomendação com botão "Tenho interesse" e o formulário
"Vamos confirmar seu plano" apareceram simultaneamente na mesma leva de mensagens — dois botões
"Tenho interesse" idênticos na tela antes de qualquer clique. O coletor não clicou em nenhum dos
dois (foi direto pro formulário, já disponível e funcional). Não investigado se é duplicação
real de UI ou timing de streaming — registrado pro juiz avaliar, não é o item que motivou esta
rodada.

## Status por checkpoint

| Checkpoint | Resultado |
|---|---|
| ITEM 3 (fechamento compliant) | ✅ Confirmado |
| ITEM 2 (resume, isolado, categoria Moto) | ✅ Confirmado — 4º data point da rodada 3, completa as 3 categorias |
