# Diário — Loop autônomo de refino do agente (modo urgência)

> **Contexto:** Kairo saiu (`/to-saindo`) e pediu pra rodar em loop, desacompanhado,
> corrigindo TODO problema de conversa/UX do agente (web) até ele voltar. Regime:
> `modo-urgencia` (fix inline, sem gate/suíte, effort alto) + coletor≠juiz (Haiku
> pilota o Chrome e monta dossiê factual; eu/Opus confirmo com evidência
> determinística antes de cravar e conserto). Serial sempre (Bevi write-conflict +
> race de AI_MODEL). Commits locais por fix, **sem push**.

**Ambiente:** container `aja-app-refactor-desamarra-agente` (branch `main`), DB
`aja_agora_ws_refactor_desamarra_agente`, LLM `claude-haiku-4-5` via túnel SSM
LiteLLM (porta 4000). URL: http://aja-refactor-desamarra-agente.orb.local
Conta de teste: CONTA1 (Kairo) — homologação Bevi.

---

## Infra destravada (pré-loop)

- **DB errado:** container subia em `aja_agora` (vazio) → 500 `relation "conversations"
  does not exist`. Apontado pro DB do workspace (`WORKSPACE_DB_NAME` no `up`).
- **AI_MODEL vazio:** `docker-compose.yml` fazia `AI_MODEL: ${AI_MODEL:-}` → string
  vazia; `?? "claude-sonnet-5"` não pega vazio → app chamava gateway com model
  vazio no `/responses` → 400 → turno vazio → fallback "me perdi". Fix na fonte:
  `${AI_MODEL:-claude-haiku-4-5}`. Commit `367c3846`.
- **Cota Anthropic estourada + container sem rota pelo gateway (rodada 1 do loop):**
  o coletor Haiku reportou "APP INOPERANTE — trava em Processando… em toda entrada".
  Ajo como juiz (prova determinística, não aceito o dossiê como fato): `docker exec`
  + `node fetch` mostrou que o container chama `api.anthropic.com` DIRETO e leva
  **HTTP 400 "workspace API usage limits… regain access on 2026-08-01"** — a
  `ANTHROPIC_API_KEY` do workspace está com cota estourada até 01/08. Causa raiz: o
  `docker-compose.yml` NUNCA repassava `LITELLM_BASE_URL`/`LITELLM_API_KEY` ao
  container (comentário antigo até proibia), então `resolveGatewayHost()` retornava
  `null` e o app ia direto pro Anthropic (bloqueado) em vez do gateway shared. Fixes:
  (1) compose passa as duas vars (`.env.local` já traz `host.docker.internal:4000` +
  virtual key); (2) `gateway-anthropic.ts`/`gateway-openai.ts` trocam
  `LITELLM_API_KEY ?? X` por `?.trim() || X` (mata o footgun de key vazia que o
  próprio comentário do compose documentava). Prova pós-fix: completon real
  `HTTP 200` "ok" do `claude-haiku-4-5` via gateway. **Watchdog** do túnel rodando em
  background (resube se o SSM cair — o túnel cai sozinho). Falha do coletor NÃO era
  bug do agente: era infra.

## Bugs de conversa/UX (loop)

### FIX-A — espelho de motivo travava o funil (chat morto)
- **Sintoma (Kairo, print):** agente dá o espelho+objetivo ("Entendo bem — quando o
  carro dá trabalho... objetivo já fica claro: te colocar num Corolla novo") e PARA,
  sem próxima pergunta. Chat parece encerrado.
- **Causa (turn-trace + código):** `decideShowGate` fazia `shouldMirrorMotivation →
  return false` (FIX-296): segurava o gate seguinte pro próximo turno. `gate=null`,
  `artifactsEmitted=[]`. O `system-prompt.ts:320` reforçava "turno próprio, sem
  pergunta, NENHUM card, PARE".
- **Fix (decisão do Kairo — Opção "emenda a próxima pergunta"):** `return true` no
  beat do espelho (força o gate seguinte a disparar JUNTO com a fala) + prompt passo
  3 passa a instruir a emenda da ponte pro próximo passo. Commit `367c3846`.
- **Status:** aplicado; a validar no loop.

<!-- Próximos achados do loop entram aqui, um bloco por bug: sintoma → causa
     (com evidência determinística) → fix → commit → status. -->
