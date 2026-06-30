---
id: FIX-110
titulo: "Agente fica mudo (turno preso) — stream fecha sem surfacear erro; só destrava no próximo input"
status: todo
bloco: bloco-streaming-chat-layer
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/chat/provider.tsx
rodada: 2026-06-30 — uso manual do Kairo (PROD; checar dev)
evidencia:
  - _evidencia/agente-nao-responde-ate-novo-input-print.png
---

## Palavras do operador
> "do nada o agente nao responde, fico esperando a resposta e nada. ai qd eu falo
> ele volta"

## Cenário exato (print)
Agente pergunta sobre lance embutido → usuário "Não, prefiro sem lance embutido" →
**silêncio** (sem typing, sem resposta) → usuário "travou?" → aí o agente responde
"Não travou, tá tudo certo!" + dispara `search_groups`. Intermitente. Visto em PROD.

## Root cause INVESTIGADO (parcial — provado no código, falta o repro)
- `src/app/api/chat/route.ts` cria **vários** `createUIMessageStream<AjaUIMessage>`:
  linhas **299, 345, 1071, 1085**. Mas só **2** caminhos têm `onError` no
  `createUIMessageStreamResponse` (linhas **1040** e **1103**). **Os demais streams
  não têm `onError`** → um throw dentro do `execute`/`streamText` é **engolido**: o
  stream fecha sem emitir erro nem `finish`, e o client (`useChat`) fica preso em
  `status: "streaming"` pra sempre. O próximo input do usuário abre um turno novo
  que processa o estado pendente → "volta quando eu falo". Bate com o sintoma.
- `src/lib/chat/provider.tsx` (`useChat`, `chat.status` ∈ submitted|streaming|ready|
  error) **não tem `onError`/timeout** que recupere um stream morto: sem evento de
  fim, a UI não sai do "streaming".
- ⚠️ Hoje (30/06) a conta Anthropic chegou a ficar **sem crédito** (já recarregada,
  billing OK agora). Um stream que falhe por 400 SEM `onError` produziria exatamente
  este sintoma — por isso o `onError` em TODO path é o conserto de fundo (não depende
  do motivo do erro).

**Falta provar:** reproduzir o turno mudo e confirmar QUAL stream sem `onError`
disparou; checar se é específico de quick-reply (`sendAction`) ou qualquer input.

## Correção proposta
| O quê | Onde |
|---|---|
| `onError` em TODOS os `createUIMessageStream`/`...Response` (emitir erro tipado pro client, fechar o turno) | `route.ts` (299, 345, 1071, 1085) |
| No client, tratar `onError`/`status:"error"` + timeout de stream parado → libera o input e mostra "tenta de novo" (nunca ficar preso em "streaming") | `provider.tsx` |

## Regressão exigida (3 camadas — comportamento de agente/stream)
- **Camada 1 (structural):** teste afirmando que cada `createUIMessageStream` em
  `route.ts` registra `onError` (ou um wrapper único que garante isso).
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — stream que
  ERRA no meio → o client recebe evento de erro e o `status` sai de "streaming"
  (não fica mudo). Mock via `MockLanguageModelV2`/`simulateReadableStream`.
- (Camada 3 nightly cobre o caminho real.)
