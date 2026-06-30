---
slug: agente-nao-responde-ate-novo-input
titulo: "Agente às vezes não responde — só volta quando o usuário manda outra mensagem"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-06-30 — uso manual do Kairo (apontado em PROD; checar em dev também)
evidencia:
  - _evidencia/agente-nao-responde-ate-novo-input-print.png
mexe_em:
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
  - src/lib/chat/actions.ts
---

## Palavras do operador
> "anota esse bug, esta em prod tbm tenho que checar em dev. do nada o agente nao
> responde, fico esperando a resposta e nada. ai qd eu falo ele volta"

## Cenário
- **Rota/tela:** chat web (jornada do consórcio), passo de lance embutido →
  descoberta de grupos.
- **Canal/ambiente:** observado em **PRODUÇÃO**. ⚠️ Falta checar se reproduz em dev.
- **Passos (do print):**
  1. Agente explica lance embutido e pergunta "Quer considerar esse tipo de lance
     nas suas simulações?"
  2. Usuário responde "Não, prefiro sem lance embutido" (quick-reply / mensagem).
  3. **Nada acontece** — sem resposta, sem indicador de digitando, fica esperando.
  4. Usuário digita "travou?".
  5. **Aí o agente volta**: responde "Não travou, tá tudo certo!" e dispara
     `search_groups` ("Buscando grupos…").
- **Frequência:** intermitente ("do nada") — não é todo turno.

## Esperado × Atual
- **Esperado:** após a resposta do usuário (passo 2), o agente responde no mesmo
  turno (stream começa em poucos segundos).
- **Atual:** o turno fica **mudo** — nenhuma resposta nem erro visível. Só a
  **próxima** mensagem do usuário destrava o processamento (o agente então
  responde, aparentemente referente ao input anterior).

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Cheira a **turno preso / dropado no streaming sem surfacear erro** (o assistant
turn não inicia ou erra silenciosamente; a próxima mensagem do usuário "acorda" o
processamento). Onde olhar:
- `src/app/api/chat/route.ts` — o `streamText`/SSE: tem `onError`? Um erro no
  stream está sendo engolido sem fechar o turno nem avisar o client?
- `src/lib/chat/provider.tsx` (cliente, `useChat`) — tratamento de `error`/`finish`
  e estado de "loading": se o stream morre sem evento de fim, a UI fica esperando
  pra sempre (sem timeout/retry).
- `src/lib/chat/actions.ts` — caminho do **quick-reply** ("Não, prefiro sem lance
  embutido" pode ter sido botão): o `sendAction` inicia o turno do agente, ou só
  enfileira e o turno só roda no próximo input de texto?
- ⚠️ **Correlação a investigar (achado desta sessão):** a conta **Anthropic está
  sem crédito** (`"credit balance too low"` → API 400). Um stream que falha por
  isso **sem error-surfacing** explicaria o "fica esperando e nada". MAS o "volta
  quando o usuário fala de novo" NÃO casa com falha pura de crédito (se fosse só
  crédito, não voltaria) — então provavelmente há **também** um turno preso/race +
  ausência de tratamento de erro no client. Validar as duas pontas.

**Falta provar:** reproduzir em dev; confirmar se é quick-reply-específico ou
qualquer mensagem; ver se há erro no console/network/log do servidor no turno mudo.
