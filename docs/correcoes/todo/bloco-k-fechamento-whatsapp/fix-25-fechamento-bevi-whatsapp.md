---
id: FIX-25
titulo: "MC-5 — fechamento Bevi no WhatsApp: captura de confirmação/CPF + máquina de estado do contrato no canal"
status: todo
bloco: bloco-k-fechamento-whatsapp
arquivos:
  - src/lib/whatsapp/processor.ts (roteamento do estado de contratação)
  - src/lib/whatsapp/interactive-handlers.ts (botões de confirmação)
  - src/lib/whatsapp/identify-capture.ts (padrão de captura — referência/extensão)
  - src/lib/whatsapp/formatter.ts (contractFormToWhatsApp — fluxo guiado)
  - tests/regression/agent-trajectory.test.ts (cassette)
rodada: 2026-06-11 (agregação de pendências pós-merge da onda G/H/I)
---

# FIX-25 — Fechar contrato Bevi pelo WhatsApp (gap MC-5 do PR #19)

## Palavras do operador

> "boa vamos agregar tudo pendente e fazer novos waves"

Gap registrado desde a entrega da jornada Bevi (PR #19, 2026-06-03):
"MC-5 — fechamento Bevi é WEB-ONLY (...) Precisa construir captura de CPF +
máquina de estado do contrato no canal WhatsApp."

## Cenário exato

Usuário de WhatsApp percorre a jornada 1→4 normalmente (o orquestrador é
canal-agnóstico). No passo 5, o agente emite `present_contract_form`; o
formatter degrada pra texto (`contractFormToWhatsApp`, formatter.ts:1023)
pedindo os dados — e a conversa morre ali: a resposta do usuário cai no fluxo
normal do agent, sem handler que reconheça o contexto de contratação e dispare
o fechamento.

## Root cause INVESTIGADO

Provado por grep (2026-06-11): `startContract` tem ZERO referências em
`src/lib/whatsapp/` — só o caminho web (componente do contract_form) chama o
fluxo de criação de proposta. O canal WhatsApp tem captura conversacional de
identidade (identify-capture.ts, gate identify) mas nenhuma máquina de estado
pro fechamento. O card web coleta confirmação + LGPD num submit; no WhatsApp
isso precisa virar diálogo guiado multi-mensagem com estado persistido (meta).

## Correção proposta

| O quê | Onde |
|---|---|
| Estado `contractCollection` no meta (espelho do `leadCollection`): stages de confirmação dos dados (identidade JÁ coletada no identify — FIX-9 mascara CPF), aceite LGPD e disparo | `processor.ts` + meta |
| Handler que intercepta turno do usuário quando `contractCollection` ativo (mesmo padrão early-return do leadCollection no orquestrador) e chama `startContract` no aceite | `processor.ts` / orquestrador |
| Botões interactive do WhatsApp pra confirmação (sim/não) em vez de parse de texto livre onde possível | `interactive-handlers.ts` |
| `contractFormToWhatsApp` passa a abrir o fluxo guiado (1ª mensagem do diálogo) em vez de despejar pedido de dados solto | `formatter.ts` |
| Pós-fechamento: mesma mensagem "Parabéns" e estado terminal `contractClosed` do canal web (tool-policy do FIX-19 já cobre o terminal por ser canal-agnóstico) | — |

## Regressão exigida (3 camadas)

- **Camada 1**: testes do estado `contractCollection` (transições, aceite,
  recusa, abandono) + assert de CPF nunca em claro em payload/log.
- **Camada 2**: cassette novo em agent-trajectory.test.ts — replay do fluxo
  WhatsApp passo 5 completo (form → confirmação → startContract chamado 1x,
  idempotente como o EC-7 do web).
- **Camada 3**: cenário nightly persona × canal WhatsApp estendido até o
  fechamento (hoje os cenários WhatsApp param antes do passo 5).
