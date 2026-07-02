# Bloco — Streaming / camada de composição da mensagem (onda 2)

**Data:** 2026-07-01 · **Branch:** `fix/composicao-mensagem-efemera` · **Base:** onda 1 já integrada (FIX-186/187).
**Escopo:** a **camada de exibição** do chat — QUE texto vira bolha, QUANDO e em quantas bolhas.
Segunda metade da correção do print do Kairo (vazamento de processo + resposta que não chegava).

## O que entregou (pitch)

O agente do Aja Agora deixou de "pensar em voz alta". Antes, num turno com busca, ele empilhava
numa bolha só uma sequência de "deixa eu buscar…", "vou puxar os números…", "um segundo…" — o
cliente via o robô narrando a própria mecânica, às vezes com falas coladas sem espaço
("corretos.Show"), e a resposta da busca **nem chegava**: ficava pendurada em "Buscando grupos ⋯"
até o cliente cutucar ("travou?"). Agora:

- **Só a resposta de resultado vira mensagem.** Preâmbulo de processo é tratado como texto
  **efêmero** e removido em tempo de execução — nunca é enviado nem salvo. O status da busca é o
  chip determinístico do sistema, não uma fala do modelo.
- **A resposta da descoberta chega sozinha.** Um turno de busca que fechava mudo (só o chip) agora
  é detectado e recuperado deterministicamente — o cliente nunca mais precisa "cutucar" pra
  destravar.
- **Falas nunca saem coladas.** Frases distintas ganham separador; status e resposta ficam em
  bolhas distintas.
- **O agente nunca manda "atualiza a página".** Além da regra no prompt (já existente), há agora
  uma **barreira em código** que dropa a frase em runtime.

A confiança é o produto: cada uma dessas correções remove um jeito de o agente **parecer** um bot
com defeito, sem tocar na inteligência da conversa.

## Itens (todos com 3 camadas de regressão — CLAUDE.md §"Regressão de agent")

| Item | O quê | Commit |
|------|-------|--------|
| **FIX-188** | Preâmbulo de processo vira EFÊMERO via sanitizer runtime (`EphemeralTextFilter`) — barreira em código (Lei 1/4), reforço no prompt/HARD_RULES 1.8 | `e3545421` |
| **FIX-189** | Segmentação (anti-colagem `normalizeGluedSentences`) + a descoberta responde sem cutucar (correção do falso-negativo do `isTurnEmpty` + guard de turno-mudo nos dispatches de busca web/WhatsApp) | `8a0db893` |
| **FIX-190** | Barreira em código contra fallback de refresh (`isTechnicalFallback`) — as camadas de prompt/HARD_RULES/cassette já vinham do FIX-52 | `b8a23a28` |

## Decisões de implementação (detalhe em `docs/correcoes/decisions/2026-07-01-bloco-streaming-chat-layer.md`)

- **Streaming por FRASE** (não por bloco nem só-persistência): o sanitizer checa cada frase completa
  antes de emitir, garantindo o invariante "preâmbulo nem enviado" sem matar o streaming.
- **Blocklist é DETECÇÃO de frase**, não governança de fluxo (a allowlist da 2ª lei governa
  transição de estado; aqui é reconhecer meta-narrativa, como os detectores já existentes).
- **Pendura corrigida na FONTE:** `isTurnEmpty` (`empty-turn-guard.ts`) tratava `search_groups` como
  "tool visível" — falso-negativo que ENCODAVA a pendura (o premisso errado do FIX-172). Descoberta
  não é emissão visível por si; só `present_*`/texto/artifact contam. Isso tocou 2 arquivos fora do
  `escopo_arquivos` declarado (`empty-turn-guard.ts` + os adapters), justificado por não haver bloco
  paralelo (onda 1 já mergeada) — risco de conflito zero.
- **FIX-190 já vinha do FIX-52** nas 3 camadas de prompt/HARD_RULES/cassette (a diagnose "nenhuma
  camada veta" do card estava desatualizada — verificado, não cravado no escuro). O valor real desta
  onda foi a barreira em código que faltava.

## Testes

- `pnpm test:unit` — **2397 verdes** (container transitório + Postgres migrado).
- `pnpm typecheck` — **verde**.
- Integração do runner real (discovery-failed/contract-guard/eco/simulator-gate) — 14 verdes.
- Camada 1: `sanitizer.test.ts`, `empty-turn-guard.test.ts` (casos FIX-189), `adapter.fix-189.test.ts` (web+WhatsApp).
- Camada 2 (cassettes, `tests/regression/agent-trajectory.test.ts`): FIX-188, FIX-189, FIX-190.
- Camada 3 (eval nightly, `tests/eval/agent-flow.eval.test.ts`): cenário descoberta-OK sem preâmbulo/colagem + FIX-190 (falha nunca sugere refresh).

## Invariantes verificados

- [x] Nenhum preâmbulo de processo persistido/enviado (sanitizer runtime, testado).
- [x] Nunca duas falas coladas; status ≠ resposta final em bolhas distintas.
- [x] A resposta da descoberta chega sem depender de novo input.
- [x] Nenhuma frase de fallback técnico ("atualiza a página"/"recarregue"/"refresh").
- [x] Sincronia `system-prompt.ts` ↔ `HARD_RULES.md` ↔ `hard-rules.ts` (travada por `HARD_RULES.test.ts`/`assistant-prompt.test.ts`).
- [x] Copy PT-BR correta (acentos/cedilha).

## Triagem / gaps

- **`fim-proposta-bugado`** (evidência do `_bloco.md`): investigado e **já resolvido** — a parte de
  INTENT ("bora" lido como recusa no fechamento) foi corrigida pelo **FIX-112** (commit `3e3b4885`,
  system-prompt §"'bora'/'ok, estou pronto' no fechamento é AVANÇO"); a parte de COMPOSIÇÃO confusa
  agora é coberta pelo sanitizer do FIX-188/189 (aplica a todos os turnos, inclusive o directive de
  fechamento). **Nada aberto** — não inventei root cause novo.
- **Footgun corrigido de passagem:** o comando de regeneração no cabeçalho do `hard-rules.ts` usava
  regex sem âncora (`^`/`m`) e casava a própria menção no comentário, comentando o export inteiro.
  Ancorado (`^…$/m`) + nota.
- **Edge fora de escopo (anotado, não corrigido):** um `present_*` DROPADO pelo guard sem texto ainda
  é rescuado por `hasVisibleTool` (present_* segue "visível"). O caso da pendura (só-descoberta) está
  fechado; esse edge de present-dropado-mudo é mais raro e fica pra uma rodada futura se aparecer.

## Não feito (linha vermelha respeitada)

Sem PR, sem merge, sem deploy/restart/migration. Branch empurrada; integração é do orquestrador.
