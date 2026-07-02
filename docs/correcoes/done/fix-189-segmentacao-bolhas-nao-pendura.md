---
id: FIX-189
titulo: "Turno multi-step vira UMA bolha gigante (FIX-182 só cola \\n\\n, é cosmético) + streaming pendura em 'Buscando grupos' até o usuário mandar novo input"
status: done
commit: 8a0db893
executado_em: 2026-07-01
severidade: media-alta
projeto: aja-agora
bloco: bloco-streaming-chat-layer
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/web/adapter.ts
  - src/lib/whatsapp/adapter.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-01 — refino do print "vazamento de processo + proposta fantasma" (Kairo)
evidencia:
  - _evidencia/agente-nao-responde-ate-novo-input-print.png
---

## Palavras do operador
> (print do Kairo: várias falas concatenadas numa bolha só, algumas coladas SEM espaço —
> "…com os dados corretos.**S**how, esse plano encaixa bem". Print `agente-nao-responde-ate-
> novo-input`: agente trava em "Buscando grupos ⋯" e só responde "Não travou, tá tudo certo!"
> depois que o usuário manda "travou?".)

## Cenário exato
- **Rota/tela:** chat (web e WhatsApp).
- **Passos (bolha gigante):** turno multi-step → todas as falas dos N steps saem numa bolha só,
  às vezes coladas sem espaço.
- **Passos (pendura):** usuário responde o gate → aparece o chip "Buscando grupos" → o texto
  do agente **não chega** → só quando o usuário manda outra mensagem ("travou?") a resposta sai.

## Esperado × Atual
- **Esperado:** cada intenção do agente é uma bolha própria (status ≠ resposta final); nunca
  duas falas coladas sem separador; e a resposta da busca **chega sozinha** quando a descoberta
  resolve, sem depender de novo input do usuário.
- **Atual:** uma bolha = um turno inteiro; e o stream pendura até novo input.

## Root cause INVESTIGADO (provado no código)
- **Uma bolha = um turno:** todo texto dos N steps concatena em `fullResponse`
  (`runner.ts:242`) → **uma** `saveMessage` por turno (`runner.ts:443-451`). Web:
  `pipeOrchestratorToWriter` (`src/lib/web/adapter.ts:184`) usa **um único `textId`** pra todos
  os `text-delta` (fecha só em artifact/gate/transition). WhatsApp: `consumeEvents` acumula tudo
  em `textBuffer` (`src/lib/whatsapp/adapter.ts:201`); `flushText` (`adapter.ts:135-150`) só
  dispara em transition/gate/lead-collection/finish.
- **FIX-182 é cosmético:** o `textBlockSeparator` (`runner.ts:103-113`) só insere `\n\n` entre
  blocos de `id` DIFERENTE dentro de um `fullStream`. Não separa trechos colados no MESMO bloco
  ("corretos.Show" = mesma geração, `newBlockId===prevBlockId` → `return ""`, `runner.ts:109`)
  nem concatenação cross-turn. O teste (`runner.fix-182-multi-tool-text.test.ts`) usa `id`
  hardcoded — não prova o comportamento real do provider por step.
- **Pendura até novo input (a confirmar — NÃO cravado no diagnóstico):** hipótese é que o
  fechamento do stream / flush da bolha final na descoberta não dispara sem um evento seguinte
  (transition/gate). O executor deve reproduzir e cravar antes de corrigir (ver evidência).

## Correção proposta
| O quê | Onde |
|-------|------|
| Segmentar bolhas por intenção (status × resposta final × artifact), não por `id` de stream | `runner.ts` (composição) + `web/adapter.ts` (textId por segmento) + `whatsapp/adapter.ts` (flush por segmento) |
| Garantir separador mesmo em trechos do MESMO bloco quando forem falas distintas coladas | `runner.ts` (`textBlockSeparator`) |
| Fazer a resposta da descoberta **flushar sozinha** quando resolve (não depender de novo input) — investigar e cravar a causa da pendura primeiro | `runner.ts` / adapters (`flushText`) |

## Regressão exigida (3 camadas — CLAUDE.md §"Regressão de agent")
- **Camada 1 (structural):** ampliar `runner.fix-182-multi-tool-text.test.ts` pra cobrir
  id-igual e cross-turn; assert de flush por segmento.
- **Camada 2 (cassette OBRIGATÓRIO):** `tests/regression/agent-trajectory.test.ts` — cassette
  multi-step: detector reprova bolha única com múltiplas falas e reprova texto colado sem
  separador; valida que status e resposta final saem separados.
- **Camada 3 (eval nightly):** persona na descoberta — a resposta chega sem o usuário precisar
  cutucar.

## Nota
A parte "pendura até novo input" e a evidência `fim-proposta-bugado` NÃO foram investigadas a
fundo — o executor reproduz e crava antes de corrigir; se a causa divergir do escopo de
composição, registra no `.done/`. Não inventar root cause.
