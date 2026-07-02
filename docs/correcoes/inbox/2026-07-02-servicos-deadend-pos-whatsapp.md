---
slug: servicos-deadend-pos-whatsapp
titulo: "Após capturar o WhatsApp, a conversa não retoma a intenção de contratar — exige nudge manual (momentum perdido)"
status: inbox
severidade: baixa
projeto: aja-agora
rodada: 2026-07-02 — QA dono-de-produto, jornada SERVIÇOS, canal WEB, produção
evidencia: []
mexe_em:
  - src/lib/agent/orchestrator/directives.ts  # funil de contatos → retomada do fechamento
  - src/lib/agent/system-prompt.ts
---

## Palavras do operador
> (QA autônomo) "Eu disse 'quero seguir e contratar a Âncora'. O agente abriu o card de WhatsApp, eu preenchi e cliquei 'Quero receber'. Ele respondeu só 'Anotei seu WhatsApp ✅' e PAROU — não retomou a contratação. Tive que digitar de novo 'vamos seguir com a contratação' pra ele avançar pro card de decisão."

## Cenário
- **Rota/tela:** chat, funil de contatos (captura de WhatsApp) inserido entre o "quero contratar" e o card de decisão
- **Passos:** 1) "quero seguir e contratar a Âncora" 2) aparece card "Continuar pelo WhatsApp" 3) preenche + "Quero receber" 4) agente confirma o WhatsApp e para 5) só avança após novo nudge do usuário
- **Dados usados:** WhatsApp (62) 99464-1111

## Esperado × Atual
- **Esperado:** após anotar o WhatsApp, o agente retoma automaticamente a intenção pendente (contratar) e mostra o card de decisão / próximo passo, sem exigir que o usuário repita.
- **Atual:** conversa estaciona em "Anotei seu WhatsApp ✅"; a intenção de contratar (dita ANTES do funil) é perdida; precisa de nudge manual. Momentum perdido no ponto mais crítico da conversão.

## Pista de causa (A CONFIRMAR)
O side-quest de captura de contato consome o turno e não re-injeta a intenção pendente ("contratar") na directive seguinte. Olhar como o funil de contatos devolve o controle ao fluxo de fechamento (proposta-funil-contatos-retorno.md). Candidato a cassette (comportamento de agent).
