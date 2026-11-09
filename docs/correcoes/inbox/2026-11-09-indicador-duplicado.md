---
slug: indicador-duplicado
titulo: "Bolha de carregamento mostra dois indicadores juntos: 'Montando sua resposta' e 'Digitando…'"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/indicador-duplicado-print.png
mexe_em:
  - src/components/chat/message-list.tsx (AguardandoAgente, commit 95bea2e9)
  - src/components/chat/chat-message.tsx (isStreamingEmpty / pílula "Montando sua resposta")
---

## Palavras do operador
> "bug visual" (print da bolha do agente)

## Cenário
- **Rota/tela:** chat web, enquanto o agente processa a mensagem do lead.
- **Print:** `_evidencia/indicador-duplicado-print.png`: dentro da mesma bolha aparecem a pílula "Montando sua resposta" com os pontos e, ao lado, o texto "Digitando…".

## Esperado × Atual
- **Esperado:** UM indicador por vez e com rótulo de texto legível: "Digitando…" até o agente começar, e a pílula "Montando sua resposta" quando houver atividade de ferramenta. Nunca os dois ao mesmo tempo.
- **Atual:** os dois aparecem juntos e a bolha fica apertada.

## Pista de causa (A CONFIRMAR)
Regressão do bug 3: a correção `95bea2e9` renderiza `AguardandoAgente` quando `isStreaming && visiveis.at(-1)?.role === "user"`. Quando o servidor já abriu a mensagem do assistente com a pílula de atividade (`isStreamingEmpty` em `chat-message.tsx`), essa mensagem pode não contar como "visível" e os dois renderizam. Deve valer: se existe mensagem do assistente em andamento (mesmo vazia ou só com atividade), o `AguardandoAgente` não aparece. Esta correção já está no dev (run 42630754091).
