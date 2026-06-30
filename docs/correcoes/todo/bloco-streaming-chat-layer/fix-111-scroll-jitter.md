---
id: FIX-111
titulo: "Scroll do chat oscila (jitter) — briga auto-scroll x intent / reflow durante o stream"
status: todo
bloco: bloco-streaming-chat-layer
arquivos:
  - src/components/chat/message-list.tsx
  - src/components/chat/scroll-intent.ts
  - src/components/chat/theater/theater-chat.tsx
rodada: 2026-06-30 — uso manual do Kairo
evidencia: []
---

## Palavras do operador
> "estamos tendo um problema no scroll, ele fica bugadno indo e voltando"

## Cenário
Chat web — o scroll "fica indo e voltando" (oscila sozinho), atrapalha a leitura.
Provável durante o streaming da resposta e/ou ao montar cards/artefatos no meio da
conversa. ⚠️ Falta repro com passo exato (gravar tela: é só no stream ou parado?).

## Root cause INVESTIGADO (parcial — onde olhar, falta o repro)
Já existe `src/components/chat/scroll-intent.ts` (detecta stick-to-bottom × usuário
rolou pra cima). O jitter cheira a:
- **threshold flickando:** a cada delta de token o `scroll-intent` alterna entre
  "no fim" e "rolou" → `message-list.tsx` ora gruda no fim, ora solta → oscila.
- **reflow durante o stream:** a altura do conteúdo muda (token novo, card/artefato
  montando, imagem sem dimensão reservada) e o "manter no fim" recalcula e salta.
- `theater/theater-chat.tsx` pode ter o MESMO efeito de auto-scroll duplicado
  (dois controladores competindo).

**Falta provar:** capturar o momento exato; confirmar se some quando o usuário NÃO
está no fim; medir se é o `scrollIntoView` por token ou layout shift.

## Correção proposta
| O quê | Onde |
|---|---|
| Estabilizar o intent: histerese/threshold com folga (não alternar a cada px) + só auto-scroll quando JÁ está colado no fim | `scroll-intent.ts` |
| Auto-scroll throttled (rAF/idle), não 1× por token; reservar altura de cards/imagens pra evitar reflow | `message-list.tsx` |
| Garantir 1 único controlador de scroll (não duplicar no teatro) | `theater/theater-chat.tsx` |

## Regressão exigida
- **Camada 1 (structural):** `scroll-intent.test.ts` já existe — estender: dado um
  scrollTop oscilando perto do fim, o intent NÃO troca de estado a cada px
  (histerese). Asserts determinísticos da função pura de intent.
- **(E2E opcional, fora do PR):** Playwright que envia uma resposta longa e mede que
  o scrollTop é monotônico no fim (sem voltar) — gated, não no CI.
