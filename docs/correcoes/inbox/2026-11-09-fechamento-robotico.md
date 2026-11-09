---
slug: fechamento-robotico
titulo: "O fechamento ficou robótico e com informação demais: textão, proposta, 'Parabéns' e card do WhatsApp em sequência"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/fechamento-robotico-print.png
mexe_em:
  - src/lib/bevi/closing-presentation.ts (o roteiro: texto, signature_handoff, texto "Parabéns", atendimento_handoff; linhas ~195-300)
  - src/lib/bevi/closing-presentation.test.ts
  - src/lib/agent/hard-rules.ts (§1.9, exceção da copy pós-fechamento)
  - src/lib/eval/jornada-rubric.ts (rubrica exige a frase "cota reservada" literal)
  - src/components/chat/artifacts/atendimento-handoff.tsx / signature-handoff.tsx
---

## Palavras do operador
> "esse ponto aqui ficou muito robótico, eu gostaria que tivesse apenas o 'parabéns, agora você está oficialmente mais perto...' depois o card de falar no WhatsApp... não precisa ser travado como falei, olhe para a premissa do agente inteligente, só achei que aí ficou um textão enorme e depois a proposta, depois o parabéns, depois o card do WhatsApp... ou seja, muita info"

## Cenário
- **Rota/tela:** chat web, logo depois de o lead clicar "Confirmo essa carta".
- **Print:** `_evidencia/fechamento-robotico-print.png`: (1) bolha longa "Perfeito! Sua cota da CANOPUS está reservada, escolhida pela Aja Agora para o seu perfil. A Aja Agora segue com você até a contemplação, e depois dela. Você não paga nada agora..."; (2) card "Sua proposta está pronta" com botão "Ver minha proposta"; (3) bolha "Parabéns! Agora você está oficialmente mais perto da sua conquista!"; (4) card "O próximo passo é com a gente" com o botão "Falar no WhatsApp".

## Esperado × Atual
- **Esperado:** o fecho curto: a celebração ("Parabéns! Agora você está oficialmente mais perto da sua conquista!") e logo o card de falar no WhatsApp. Sem o textão. Não precisa ser literal nem travado: a premissa é a do agente inteligente (P9/P11: conversa é do modelo, o código garante só a verdade).
- **Atual:** quatro blocos fixos em sequência, texto jogado e repetitivo.

## Decisões que o worker deve tratar (sem perder o produto)
1. A proposta ("Ver minha proposta") é o entregável. A fala do Kairo lista o card da proposta entre o que é "muita info". Não sumir com o acesso à proposta sem ele saber: propor onde ela vive (por exemplo dentro do card do WhatsApp, ou o card da proposta no lugar do textão) e deixar a escolha final com ele se for ambíguo.
2. O código afirma que a copy "cota reservada" é decisão de produto (FIX-278, Ata 2026-07-04) e que só se mexe com decisão explícita do Kairo. Esta mensagem é essa decisão para a copy do fecho; atualizar `closing-presentation.test.ts`, `hard-rules.ts` §1.9 e a rubrica `jornada-rubric.ts` que a exige.
3. O "oi" pelo WhatsApp tem função técnica (abre a janela de 24h): o card com botão fica.
4. O fecho roda também no canal WhatsApp (`interactive-handlers.ts`); a mudança vale para os dois.
