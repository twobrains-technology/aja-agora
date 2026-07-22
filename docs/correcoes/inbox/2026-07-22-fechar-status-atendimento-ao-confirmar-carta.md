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
  - (a confirmar — ver achados do find-code sobre stage do funil, aba administradora e notificação de mesa)
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
Isto é pedido de **feature/comportamento**, não regressão confirmada — precisa antes checar se já existe algo parcial (pode ser que o stage mude mas a notificação de mesa não dispare, ou vice-versa). Busca ampla disparada via `find-code` pra localizar: (1) enum/coluna de stage do funil e onde fica a "aba administradora", (2) mecanismo existente de notificação de atendentes de mesa (já citado por Kairo como algo que "a gente já tem lá no back-end" — reaproveitar, não reinventar), (3) o handler/rota acionado quando o cliente confirma a carta. Resultado do find-code ainda pendente no momento da captura deste card — atualizar `mexe_em:` assim que chegar.
