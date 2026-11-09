---
slug: agente-nao-mostra-card-nome
titulo: "O agente pergunta o nome em texto e o card de nome (componente de digitar) não aparece; só os atalhos aparecem"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/agente-nao-mostra-card-nome-print.png
mexe_em:
  - src/components/chat/artifacts/name-prompt.tsx
  - src/lib/agent/pi/cards-livres.ts / tools-livres.ts
---

## Palavras do operador
> "as sugestões aparecem, o componente para digitar não... por exemplo aqui existe um componente de nome"

## Cenário
- **Rota/tela:** chat web local
- **Passos:** 1) "Quero comprar um carro." 2) o agente responde "Antes de eu te mostrar as opções, qual é o seu nome?" só em texto.
- **Print:** `_evidencia/agente-nao-mostra-card-nome-print.png`. Sem card de nome.

## Esperado × Atual
- **Esperado:** quando o agente pede o nome, o card de nome (`name-prompt`) aparece embaixo da fala, como acontece com os outros componentes de entrada.
- **Atual:** só texto (ou só os atalhos de fallback). É a mesma família dos bugs 5 (celular) e 6 (valor): os componentes de DIGITAR não aparecem, os de ESCOLHA/atalho sim.

## Pista de causa (A CONFIRMAR)
Ver como o `name-prompt` é emitido hoje (gate `name` do route, `src/app/api/chat/route.ts`, e o card de nome na `cards-livres.ts`) e por que o vendedor livre não o chama. Provável causa comum aos bugs 5, 6 e 9: o modelo não chama a tool de card na fala em que pede o dado, e o fallback do servidor só cobre `quick_reply`.
