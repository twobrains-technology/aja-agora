---
slug: fechar-status-atendimento-ao-confirmar-carta
titulo: "Ao confirmar a carta (fechamento), mover o lead no funil pra aba 'administradora', marcar status fechado/ganho e notificar os atendentes da mesa"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-07-22 — Kairo revisando o card de confirmação de carta (feature, não bug de regressão)
evidencia:
  - _evidencia/2026-07-22-fechar-status-atendimento-ao-confirmar-carta.png
mexe_em:
  - src/db/schema.ts (enum leadStageEnum — já existem os stages "na_administradora", "em_atendimento", "fechado_ganho")
  - src/lib/admin/lead-stages.ts (STAGE_ORDER — ordem canônica, forward-only)
  - src/lib/admin/dashboard-types.ts (FUNNEL_STAGES — label "Na Administradora" já existe na aba do funil)
  - src/lib/whatsapp/mesa/notify.ts (notifyMesaAttendant — mecanismo já existente de notificação de atendente via WhatsApp)
  - src/lib/whatsapp/mesa/outbound.ts (buildDossierMessage — monta detalhes do caso pro atendente)
  - src/lib/mesa/handoff.ts (claimMesaHandoff — transição pra "em_atendimento" quando atendente assume)
  - src/app/api/chat/route.ts:789 (action "contract-submit" → startContract(), fluxo web)
  - src/lib/whatsapp/contract-capture.ts:201 (fireContract(), fluxo WhatsApp)
---

## Palavras do operador
> "Aqui vamos fazer o seguinte e aqui já é uma feature mesmo né. Quando for notificado esse card aqui a nossa status do nosso atendimento lá tem que ser fechado já, ganho né? Deixa eu lembrar aqui o funil pra nós, ó: ele tem que ir pra administradora, ele tem que estar em nosso funil na aba de administradora, e já tem que notificar o atendente de que tem alguém para ser atendido, ou seja os atendentes da mesa, igual a gente tem lá no back-end entendeu? Já tem que notificar isso lá e considerar também como uma tarefa a ser executada aqui porque daqui a pouco a gente vai executar todas."

## Cenário
- **Rota/tela:** Chat web/WhatsApp do Aja Agora, momento em que o cliente clica "Confirmo essa carta" (fechamento da proposta de consórcio, ex. Itaú).
- **Passos:** 1) Cliente confirma a carta 2) Agente responde "Perfeito! Sua cota está reservada... Parabéns! Agora você está oficialmente mais perto da sua conquista!" + card "O próximo passo é com a gente" (atendente vai chamar via WhatsApp) 3) **Hoje**: não está claro/confirmado que o status do lead no funil interno muda pra "fechado/ganho" nem que a mesa é notificada automaticamente nesse instante.
- **Dados usados:** N/A — comportamento estrutural do funil, vale pra qualquer proposta confirmada.

## Esperado × Atual
- **Esperado:**
  1. Ao confirmar a carta, o **status do atendimento do lead no funil interno deve virar "fechado/ganho"** automaticamente.
  2. O lead deve **aparecer na aba "administradora"** do funil (Kanban do admin).
  3. Os **atendentes da mesa devem ser notificados** (igual ao mecanismo que já existe hoje no back-end pra outros avisos de mesa) de que há alguém pronto pra ser atendido.
- **Atual:** A confirmação dispara a resposta de sucesso pro cliente e o card de "próximo passo com a gente" (WhatsApp), mas **não está confirmado que o pipeline interno reflete o fechamento nem que a notificação de mesa dispara** — Kairo está pedindo isso explicitamente como próxima entrega, não relatando uma regressão observada.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Confirmado por busca ampla (find-code): **toda a peça já existe no código**, só falta confirmar se estão conectadas no momento certo:

- O enum `leadStageEnum` (`schema.ts`) **já tem** `na_administradora`, `em_atendimento` e `fechado_ganho` — não precisa criar stage novo.
- A aba "Na Administradora" **já existe** no funil do admin (`dashboard-types.ts`, `FUNNEL_STAGES`).
- O mecanismo de notificar atendente de mesa **já existe** (`notifyMesaAttendant`, `buildDossierMessage`, `claimMesaHandoff`) — é o "a gente já tem lá no back-end" que o Kairo mencionou.
- O ponto de confirmação da carta é conhecido: web = `contract-submit` → `startContract()` (`route.ts:789`); WhatsApp = `fireContract()` (`contract-capture.ts:201`).

**O que falta confirmar (não investigado a fundo aqui):** se `startContract()`/`fireContract()`, no momento em que a proposta é confirmada com sucesso, (a) já move o lead pro stage `na_administradora`/`fechado_ganho`, e (b) já chama `notifyMesaAttendant()`. Se as três peças existem mas não estão ligadas nesse gatilho específico, é conectar; se já estão ligadas, o pedido do Kairo pode já estar satisfeito e vale só validar em produção (não assumir bug sem checar o código de `startContract`/`fireContract` linha a linha — evidência antes de cravar).
