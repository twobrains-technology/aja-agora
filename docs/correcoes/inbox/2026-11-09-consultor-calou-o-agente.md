---
slug: consultor-calou-o-agente
titulo: "Mensagem enviada para Consultor: o agente se cala sem humano ter assumido; tem que seguir"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/consultor-calou-o-agente-print.png
mexe_em:
  - src/lib/agent/quem-responde.ts (quemRespondePara: findMany de todo handed_off, casa por telefone)
  - src/app/api/chat/route.ts (~545-595: humanoNoCaso, relay, texto "Mensagem enviada para ...")
  - src/lib/agent/quem-responde.fila.test.ts (teste (c) congela o comportamento a mudar)
---

## Palavras do operador
> "porque a mensagem foi para o consultor nesse caso? não deveria, tem que seguir"

## Cenário (print)
Web, dev. Depois do card de valor, o cliente escreve "Até R$ 3.050 por mês" e a resposta é "Mensagem enviada para Consultor. Aguarde a resposta aqui." O agente não respondeu e nenhum humano tinha assumido.

## Causa (lida no código)
`quemRespondePara` carrega TODA conversa `handed_off` e devolve `humano` se o telefone bate, mesmo com `handedOffUserId == null` (marcado `semDestinatario`). O telefone de teste do operador tem conversas antigas `handed_off` sem dono (herança do bug de `POST /api/leads`, removido em 7ade3558, e do clique de interesse do WhatsApp, `proxy.ts:469`). Toda conversa nova com esse número é tratada como "humano no caso", o `route.ts` relaya à fila (entrega "ok" porque há atendentes) e escreve a promessa.

AGENTS.md P8: chamar a fila NÃO silencia o agente; só o claim de um atendente e o caso aberto na mesa silenciam. Sem claim e sem caso aberto na mesa, o agente conduz.

## Esperado × Atual
- **Esperado:** `handed_off` sem dono e sem caso ativo na mesa NÃO cala o agente (em nenhum canal); o turno segue normal. Claim ou caso aberto na mesa continuam calando. Linha velha não cala conversa nova.
- **Atual:** cala e promete resposta de um "Consultor" que ninguém assumiu.

## Direção
Em `quemRespondePara`, `humano` só se `handedOffUserId` existe OU há caso ativo na mesa (`mesa_handoffs`) para aquela conversa. Ajustar o teste (c) ao contrato certo e provar com teste que falhava antes. Conferir se o webhook do WhatsApp usa a mesma função e ficou coerente.
