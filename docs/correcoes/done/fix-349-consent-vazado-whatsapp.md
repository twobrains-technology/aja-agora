---
id: FIX-349
titulo: "P1 — o reveal em dois tempos (consentimento) vazou no WhatsApp: número específico sem consent (2/8)"
status: done
bloco: bloco-g-consent-wa-fallback
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/sanitizer.test.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/whatsapp/adapter.fix-349-reco-consent-silencioso.test.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-349 — o consentimento do reveal não vale no WhatsApp

## Cenário (imovel-whatsapp t6, servicos-whatsapp t6)
O agente entrega **número específico da oferta top-1 sem o consentimento** ("Posso te mostrar a
opção que eu recomendo?"). Em `servicos-whatsapp` o gate de consentimento **nunca aparece na
conversa inteira**.

Contraria decisão explícita do cliente (Rodada 10: "reveal em dois tempos — a lista sozinha; o
hero só depois do consent"). O canal web respeita; o WhatsApp não.

## Root cause PROVADO — DOIS bugs distintos, não um

### Bug A — `isPrematureTopOfferClaim` cego ANTES de `recommend_groups` rodar (o vazamento em si)

O fluxo obrigatório do reveal (`buildSearchSummaryDirective`, `directives.ts`) manda o modelo: (1)
chamar `search_groups` e **já anunciar** o resultado, (2) só DEPOIS chamar `recommend_groups` (que é
quem preenche `rank` — único campo que `pickBestRankedGroup`, `recommendation-payload.ts`, aceita
pra decidir "qual é a oferta top-1"). `search_groups` **já devolve administradora/parcela por
grupo** (mesmo shape de `recommend_groups`, via `toModelGroupSummary`) — se o modelo narrar a
"melhor opção" nessa janela (ANTES de `recommend_groups` rodar), `ctx.pendingTopOffer`
(`sanitizer.ts`) ainda está `null` (nenhum grupo tem `rank`), e `isPrematureTopOfferClaim` retorna
`false` **sem olhar o segmento** — o vazamento passa direto pro usuário. Confirmado em código
(`recommendation-payload.ts:238-246`, comentário do FIX-286: "`search_groups` sozinho não basta pra
materializar o hero") e reproduzido em teste unitário puro (`sanitizer.test.ts`, describe
"FIX-349").

**Bug irmão, achado no mesmo guard:** mesmo com `pendingTopOffer` populado, o regex
`\\b${administradora}\\b` nunca fechava pra nomes terminados/começados em letra acentuada (ex.:
"ITAÚ", "ÂNCORA") — `\b` do JS só entende `[A-Za-z0-9_]` como caractere de palavra; a letra
acentuada quebra o boundary silenciosamente. Corrigido com boundary manual via lookaround
Unicode-aware (`\p{L}`/`\p{N}`).

### Bug B — o gate `reco-consent` fica mudo no WhatsApp quando `modelAsked` é falso-positivo

Provado com o dossiê real (`servicos-whatsapp` t9): o modelo fecha o turno da resposta de
"experience" com uma pergunta genérica e sem relação nenhuma com o consentimento — *"Bora ver essas
três opções que achei pra você?"*. `EphemeralTextFilter.hasHeldQuestion()` (`sanitizer.ts`) é uma
heurística CEGA: só verifica se a ÚLTIMA sentença do modelo terminou em ALGUMA pergunta, nunca se
ela tem relação com o gate corrente. Isso marca `modelAskedGateQuestion=true` no evento `gate` de
`reco-consent`.

`reco-consent` é TEXT-ONLY no WhatsApp (`gateInteractive` devolve `null`) — e
`whatsapp/adapter.ts` (`gateTextPrompt`) aplicava `ev.modelAsked ? null : gateQuestion(...)`: sem
NENHUM fallback estrutural, isso apaga o gate por completo (nem interactive, nem texto — só o
`console.error("[gate-undelivered]")`). O usuário nunca é perguntado; `recoConsentAnswered` só é
resolvido depois por um clique/menção que "passa" como consentimento implícito — nunca por resposta
a uma pergunta que ele viu. Reproduzido byte-a-byte em teste (mock de `runTurn` alimentando o evento
`gate` com `modelAsked: true`).

## Correção aplicada

1. **`sanitizer.ts`** — `StateVerificationContext` ganha `pendingOffers` (TODAS as ofertas já
   indexadas neste turno, via `search_groups` OU `recommend_groups`, não só a de `rank` mínimo).
   `isPrematureTopOfferClaim` passa a checar `pendingTopOffer` **e** `pendingOffers`. Boundary de
   nome de administradora trocado pra lookaround Unicode-aware (`wholeWordRegex`).
2. **`runner.ts`** — `stateVerificationContext()` popula `pendingOffers` a partir de
   `revealGroupsById` (mesma fonte já usada por `shownAdministradoras`, duas linhas acima).
3. **`whatsapp/adapter.ts`** — novo `WHATSAPP_GATES_WITHOUT_FALLBACK` (hoje só `reco-consent`):
   pra gates SEM interactive nenhum, `modelAsked` nunca apaga o textPrompt — a pergunta canônica
   sempre sai quando não há outro jeito de representar o gate. Escopo deliberadamente restrito ao
   gate com bug provado (não generalizei pra `identify`/`credit`/`desire` sem evidência).

⚠️ **Invariante que não quebrou:** `modelAsked` continua suprimindo a canônica pra gates COM
interactive (experience/timeframe/etc.) — lá um falso positivo é inofensivo (o card aparece com
corpo neutro).

## Regressão

- `sanitizer.test.ts` (describe "FIX-349"): `isPrematureTopOfferClaim` dropa menção a administradora
  indexada só via `search_groups` (sem `recommend_groups` ainda), preserva o comportamento anterior
  (`pendingTopOffer` sozinho), preserva texto sem menção pendente, e nunca dropa pós-consentimento.
- `whatsapp/adapter.fix-349-reco-consent-silencioso.test.ts`: `modelAsked=true` (falso positivo)
  ainda assim entrega a pergunta canônica de `reco-consent`; `modelAsked=false` continua funcionando
  (sem regressão).
- Suite completa `sanitizer.test.ts` (112 testes) e `system-prompt`/`orchestrator` não-DB tocados
  seguem verdes.
