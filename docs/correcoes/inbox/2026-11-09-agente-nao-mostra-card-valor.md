---
slug: agente-nao-mostra-card-valor
titulo: "O agente pergunta o valor em texto corrido em vez de mostrar o card de valor (com abas valor do bem e valor da parcela)"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/agente-nao-mostra-card-valor-print.png
mexe_em:
  - src/components/chat/artifacts/value-picker.tsx
  - src/lib/agent/pi/cards-livres.ts (TIPOS_DE_ESCOLHA inclui value_picker; validação do payload)
  - src/lib/agent/prompt-do-vendedor.ts:141 (instrução de oferecer value_picker)
---

## Palavras do operador
> "temos também o componente de valor, que inclusive ele tem aba de valor do bem e valor da parcela"

## Cenário
- **Rota/tela:** chat web local (https://aja-app-develop.orb.local)
- **Passos:** 1) "Quero comprar um carro." 2) nome 3) telefone 4) o agente pergunta "qual é o valor do carro que você está pensando em comprar?" só em texto.
- **Print:** `_evidencia/agente-nao-mostra-card-valor-print.png`. Aparecem os atalhos "Pode seguir" e "Tenho uma dúvida", que não respondem à pergunta, e nenhum card de valor.

## Esperado × Atual
- **Esperado:** o agente mostra o card de valor (`value_picker`), com as abas "Valor do bem" e "Valor da parcela", para o lead escolher por número em vez de digitar. P2: o card converte.
- **Atual:** pergunta em texto, com atalhos genéricos fora de contexto.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
- `value_picker` está em `TIPOS_DE_ESCOLHA` (`cards-livres.ts:84`), então a porta existe; ver por que o modelo não o chama ou por que a ferramenta o recusa (log `[pi-livre] ... chamadas=`).
- O comentário em `value-picker.tsx:18-26` diz que o componente virou uma "agulha simples só do VALOR DO BEM" e que a parcela entrou só como leitura. O operador descreve abas "valor do bem" e "valor da parcela": conferir se o componente atual as tem ou se houve regressão. A premissa do operador vence o comentário do arquivo.
- Os atalhos "Pode seguir / Tenho uma dúvida" podem ser os `quick_reply` de uma etapa anterior reaparecendo; mesma pista da observação do bug 5.
