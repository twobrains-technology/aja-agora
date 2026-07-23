# Rodada 3 — spot-check ao vivo do FIX-368 no runtime real (LangGraph)

> Não é uma rodada E2E completa das 3 personas — é a verificação pontual que motivou a
> descoberta do pivô de runtime (ver seção "Descoberta crítica" no goal doc) e a confirmação de
> que o replantio do FIX-368 no LangGraph funciona. Coletado pelo orquestrador, só registro
> factual.

## Contexto

Persona ad-hoc "Marina" (Imóvel, apartamento R$ 250 mil, sem lance) criada especificamente pra
este spot-check, na mesma base `integ/vendedor-matador`, DEPOIS do commit `90270707` (remoção do
runtime Vercel + replantio do FIX-368 no LangGraph) e com o container reiniciado pra garantir
código fresco.

## Checkpoint — resume "Voltei" pós-fechamento

- Fluxo completo até "Confirmar e contratar" → sucesso confirmado via JS
  (`hasParabens: true`, `hasReservada: true`).
- `navigate` (reload) → "Fale com a AJA" → modal "Continuar de onde você parou?" → "Voltar à
  conversa" → histórico completo carrega (incluindo o fechamento) → banner "Você voltou —
  continue de onde parou" + chip "Voltei" (auto-disparado).
- **Resposta integral do agente:** "Que bom te ver de novo, Marina! Sua reserva com a ITAÚ já
  está confirmada, e um atendente da Aja Agora vai te chamar no WhatsApp em breve pra seguir com
  os próximos passos da adesão. Alguma dúvida enquanto isso?"

## Comparação com o critério de aceitação original (ITEM 2, goal doc)

| Critério | Atendido? |
|---|---|
| Primeira frase reconhece que a proposta já está fechada | ✅ "Sua reserva com a ITAÚ já está confirmada" |
| Reforça encaminhamento pro WhatsApp | ✅ "um atendente da Aja Agora vai te chamar no WhatsApp em breve" |
| Não repete pergunta de etapa anterior / não trata como se estivesse em aberto | ✅ nenhuma pergunta de decisão pendente, nenhum "quer seguir com a contratação" |
| Linguagem natural, não travada em texto fixo | ✅ frase gerada pelo modelo, não regex |

## Nota de ambiente (não é achado de produto)

Durante este spot-check o túnel LiteLLM caiu 2x (SSM port-forward, sintoma documentado na skill
`tunel-litellm`) — a primeira tentativa de turno ficou 45s e não persistiu resposta visível
(túnel caiu no meio); resolvido subindo o túnel de novo e confirmando latência normal (1.8s)
antes de repetir o teste. Não é bug de código — registrado aqui só pra explicar por que o
primeiro screenshot desta sessão não mostrou resposta nova.

## Status

| Item | Resultado |
|---|---|
| FIX-368 (resume reconhece fechamento) no runtime LangGraph | ✅ Confirmado ao vivo, critério de aceitação batido |
| FIX-369 (escassez) | ✅ Já vivia em código compartilhado (`server-cards.ts`), consumido por `emit-card.ts` sem alteração necessária |

## Pendente pra próxima rodada

Este spot-check cobre só 1 persona e só o checkpoint de resume. Uma rodada E2E completa das 3
personas (repetindo o roteiro da rodada 1) contra o LangGraph pós-remoção-do-Vercel ainda não foi
feita — é o próximo passo antes de re-lançar o juiz Sonnet pra veredito final.
