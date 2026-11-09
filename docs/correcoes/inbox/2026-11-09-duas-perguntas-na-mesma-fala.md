---
slug: duas-perguntas-na-mesma-fala
titulo: "O agente faz duas perguntas na mesma fala (WhatsApp + valor) e solta dois cards"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/rafael-e-duas-perguntas-print.png
mexe_em:
  - src/lib/agent/prompt-do-vendedor.ts (conduta: uma pergunta por fala)
  - src/lib/agent/pi/tools-livres.ts (~616/620: texto da tool mostrar_card)
---

## Palavras do operador
> "duas perguntas na mesma mensagem... isso não pode acontecer"
> "não quero código determinístico para mostrar o card... se for deixar ele burro, deixa como está"

## Cenário (print)
Depois do nome: "Prazer, Kairo! Pra eu te mandar as melhores opções, qual o seu WhatsApp? E me diz também, mais ou menos quanto de carro você quer." com o card de WhatsApp E o card de valor embaixo.

## Esperado × Atual
- **Esperado:** UMA pergunta por fala, com UM card no máximo. Pediu o WhatsApp, espera; depois o valor.
- **Atual:** duas perguntas e dois cards.

## Direção (decisão do operador)
Conduta é do prompt (P9/P11). NADA de código determinístico que escolha ou force card, nem que corte pergunta do texto. Só texto de conduta no prompt e nas descrições das tools. O card de NOME que às vezes não sai fica como está: não vira regra de código.
