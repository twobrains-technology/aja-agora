---
slug: sem-loading-apos-enviar
titulo: "Mostrar feedback imediato de carregamento assim que o lead envia a mensagem"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia: []          # sem print nesta anotação
mexe_em:
  - src/components/chat/theater/theater-chat.tsx
  - src/components/chat/message-list.tsx
  - src/components/chat/streaming-dots.tsx
  - src/components/chat/chat-layout.tsx
---

## Palavras do operador
> "após mandar uma mensagem não tem feedback imediato de loading, mando a msg e ele fica em branco sem feedback para usuário"

## Cenário
- **Rota/tela:** chat web (landing e chat em tela cheia), local https://aja-app-develop.orb.local
- **Passos:** 1) abrir o chat 2) enviar uma mensagem 3) olhar a tela entre o envio e a primeira palavra do agente.
- **Observação do líder:** na primeira resposta do turno o servidor leva segundos (turno do Pi + tool calls), então o vazio é longo.

## Esperado × Atual
- **Esperado:** no mesmo instante do envio, a mensagem do lead aparece e um indicador de "digitando/carregando" (com rótulo de texto, não só cor ou animação) fica visível até a resposta começar. P0: a conversa não pode parecer morta.
- **Atual:** a tela fica em branco, sem sinal de que a mensagem saiu.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Existe `streaming-dots.tsx`; ver em que `status` do `useChat` ele aparece (`submitted` vs `streaming`) e se o `message-list` / `theater-chat` o renderiza já em `submitted`, antes do primeiro token. Pode haver também o caso do chip da landing, que abre o palco (`theater`) e dispara a primeira mensagem sem mostrar o balão do usuário nem o indicador.
