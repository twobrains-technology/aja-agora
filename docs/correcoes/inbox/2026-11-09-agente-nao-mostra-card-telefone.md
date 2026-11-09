---
slug: agente-nao-mostra-card-telefone
titulo: "O agente pede o WhatsApp em texto corrido em vez de mostrar o card de telefone"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/agente-nao-mostra-card-telefone-print.png
mexe_em:
  - src/lib/agent/prompt-do-vendedor.ts (linhas 115 e 270: instrução "mostrar_card com tipo whatsapp_optin")
  - src/lib/agent/pi/cards-livres.ts (TIPOS_DE_ESCOLHA, linha 84, não inclui whatsapp_optin)
  - src/lib/agent/pi/tools-livres.ts
  - src/components/chat/artifacts/whatsapp-optin.tsx / telefone-do-desbloqueio.tsx
---

## Palavras do operador
> "temos componente de celular, o agente deve mostrar o componente"

## Cenário
- **Rota/tela:** chat web local (https://aja-app-develop.orb.local)
- **Passos:** 1) "Quero comprar um carro." 2) responder o nome ("kairo") 3) o agente escreve "Antes de eu te mostrar as opções, me passa seu WhatsApp? Se a conexão cair ou a tela fechar, a gente não perde nada e eu retomo daqui." 4) o lead digita o número no campo de mensagem ("62992496793").
- **Print:** `_evidencia/agente-nao-mostra-card-telefone-print.png`. Não aparece card de telefone em nenhum momento.

## Esperado × Atual
- **Esperado:** quando o agente pede o WhatsApp, o card de telefone (componente `whatsapp_optin`) aparece embaixo da fala, com máscara e botão. P6: o contato é o ativo; P2: o card converte.
- **Atual:** o agente pede só em texto e o lead digita o número como mensagem comum, sem validação nem formato.

## Observação anexa (verificar, pode ser outro bug)
Depois da pergunta "qual é o valor do carro que você está pensando em comprar?", os atalhos exibidos são "Pode seguir" e "Tenho uma dúvida", que não respondem à pergunta. O worker deve conferir de onde vêm e relatar; só corrigir se for a mesma causa.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
O prompt manda chamar `mostrar_card` com tipo `whatsapp_optin`, mas `TIPOS_DE_ESCOLHA` (`cards-livres.ts:84`) só aceita `quick_reply`, `value_picker`, `topic_picker`; a recusa devolve "não é um card conhecido". Ou o `whatsapp_optin` tem outra porta, ou o modelo nunca o chama, ou a ferramenta o rejeita. Ver o log `[pi-livre]` do turno (chamadas=) para saber se o modelo chamou e foi recusado.
