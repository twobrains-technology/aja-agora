---
slug: card-antes-da-pergunta
titulo: "O card de preenchimento aparece ACIMA da pergunta; tem que vir sempre depois dela"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/card-antes-da-pergunta-print.png
mexe_em:
  - src/lib/agent/pi/turno-livre.ts (emitirCardsNovos, ~linhas 796-845; aoResultado ~908)
  - src/lib/agent/pi/tools-livres.ts (~616: "chame esta tool junto, antes de escrever a pergunta"; ~620 idem para quick_reply)
  - src/lib/agent/pi/cards-livres.ts (CARDS_DE_ESTADO / classes dos cards)
---

## Palavras do operador
> "o card deve vir sempre depois da pergunta"

## Cenário
- **Rota/tela:** chat web, 1ª fala do agente depois de "Quero comprar um carro."
- **Print:** `_evidencia/card-antes-da-pergunta-print.png`: o card "Continuar pelo WhatsApp" (telefone, "Quero receber / Agora não") aparece ANTES da bolha "Carro, anotado! Pra eu te mandar as melhores opções, qual o seu WhatsApp?".

## Esperado × Atual
- **Esperado:** a pergunta primeiro, o card de preenchimento (nome, WhatsApp, valor, formulários) embaixo dela, sempre.
- **Atual:** o card sai na ordem em que a ferramenta devolveu, e o modelo a chama antes de escrever a pergunta.

## Causa (lida no código, a confirmar com teste)
`turno-livre.ts:807-811` já tem a regra certa só para os cards de ESCOLHA (`TIPOS_DE_ESCOLHA` = quick_reply, value_picker, topic_picker): eles esperam o fim do beat e saem DEPOIS da pergunta ("o modelo pede o card antes de escrever a pergunta, é o que a skill ensina"). Os cards de PREENCHIMENTO (`whatsapp_optin`, `name_prompt`, `lead_form`, `contract_form`) são tratados como "fato" e saem no resultado da ferramenta, na ordem do stream. Além disso, o commit de8b302e escreveu em `tools-livres.ts:616` "chame esta tool junto, antes de escrever a pergunta", que induz exatamente isso.

## Direção
Invariante de layout (verdade do servidor, não conduta): o card de preenchimento espera o fim do beat e sai depois do texto do turno, como o de escolha. Corrigir também o texto da ferramenta para não mandar o modelo chamar "antes de escrever a pergunta". Vale web e WhatsApp.
