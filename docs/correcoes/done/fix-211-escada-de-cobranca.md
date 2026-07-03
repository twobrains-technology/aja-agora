---
id: FIX-211
titulo: "Escada de cobrança de dado obrigatório (CPF/valor) com variação e saída após 3 tentativas"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/gate-reengage.ts
  - src/lib/whatsapp/identify-capture.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/agent/personas.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — reforma de conversa WhatsApp (Fase 1), spec docs/design/specs/2026-07-02-conversa-whatsapp-cadencia-design.md
---
## Palavras do operador
> "se o cara nao informar tem que cobrar ele ate informar"

## Cenário exato
- **Canal:** WhatsApp. Funil no gate `identify` (ou `credit`).
- **Passos:** 1) bot pede o CPF; 2) usuário **ignora** e manda outra coisa ("por que precisa disso?");
  3) o pedido do CPF **some** e a conversa segue sem o dado.

## Esperado × Atual
- **Esperado (C2 do spec):** cobrança com **escada** — o re-pedido varia por tentativa; NÃO avança sem
  o dado; cobra também quando o usuário **desvia**; após **3 tentativas** oferece falar com especialista
  (saída, pra não virar armadilha).
- **Atual:** só há re-pergunta quando o turno fecha **mudo** (`reengageQuestionForGate`, guard) ou após
  90s (watchdog). Se o usuário desvia (turno não fecha mudo, o LLM responde), o pedido não é re-emitido.
  E o re-pedido é sempre o MESMO texto, sem escalar.

## Root cause (INVESTIGADO)
`reengageQuestionForGate` (gate-reengage.ts:83) re-emite a MESMA pergunta uma vez, e só é acionado pelo
guard de turno-mudo (adapter.ts) ou pelo watchdog. Não existe contador de tentativas nem texto que
varia, nem gatilho de re-pedido quando o gate segue pendente após um turno em que o usuário desviou.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Contador de tentativas por gate no meta (`gateAttempts[gate]`), resetado ao capturar o dado, sem vazar entre gates | `src/lib/agent/personas.ts` (ConversationMetadata) + captures |
| Escada de re-pedido: texto varia por tentativa (1ª pedido direto, 2ª "só falta isso, é rapidinho", 3ª "é seguro/sem compromisso"), sem emoji | `gate-reengage.ts` (estender reengageQuestionForGate ou nova função) |
| Após 3 tentativas: injetar oferta de especialista (saída) | `gate-reengage.ts` + o ponto de entrega no `adapter.ts` |
| Gatilho de re-pedido quando o usuário DESVIA num gate de coleta obrigatória (gate segue pendente ao fim do turno) — não só quando fecha mudo | `adapter.ts` (consumeEvents / fim de turno) |

**Anti-armadilha:** teto de 3 + saída obrigatória pra especialista. Nunca loop infinito.
**Fora da janela 24h:** a escada não se aplica (é template Meta) — documentar, não cobrir aqui.

## Regressão exigida
- **Camada 1 (estrutural):** `reengageQuestionForGate`/escada retorna N textos DISTINTOS por tentativa
  pro identify e pro credit; na 4ª tentativa retorna a oferta de especialista.
- **Camada 2 (cassette em `tests/regression/agent-trajectory.test.ts`):** cassette do CPF em que o
  usuário desvia 3x → o bot escala a cobrança e na 3ª/4ª oferece especialista (NÃO "me perdi", NÃO
  segue sem o dado).
