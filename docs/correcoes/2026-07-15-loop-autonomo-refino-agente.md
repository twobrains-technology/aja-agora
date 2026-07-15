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

### Rodada 2 (pós-infra) — conversa pré-CPF LIMPA + 2 achados rejeitados

Coletor Haiku percorreu início → nome → motivo → valor → gate de CPF. Com a infra
destravada, o agente respondeu com contexto em TODOS os turnos:
- **FIX-A validado ao vivo:** no motivo, o agente deu o espelho E emendou a próxima
  pergunta no mesmo fôlego ("Entendo bem — quando o carro dá trabalho, atrapalha
  tudo. Então o objetivo já fica claro: te colocar num carro novo… Qual valor do bem
  faz mais sentido pra você?"). Não morreu seco. Turn-trace: gate `credit` logo após,
  `finishReason:ok`.
- **Copy do identify correta na web:** "Pra trazer as ofertas reais das
  administradoras, preciso do seu CPF e celular." SEM a frase de WhatsApp. (a que eu
  tinha visto no print pré-fix era artefato do LLM quebrado, confirmado.)
- Zero erro de console; funil avançou liso até o card de CPF.

**Dois achados do coletor REJEITADOS como juiz (evidência determinística):**
- **OBS-1 "me perdi" na 1ª mensagem** → REJEITADO. Turn-trace: só 1 conversa, 4
  turnos, TODOS `finishReason:ok`; o `EMPTY_TURN_FALLBACK` (empty-turn-guard.ts) não
  disparou (nenhum turno com os ~48 chars da frase). Era **scrollback velho da rodada
  1** (infra quebrada → todo turno caía no "me perdi"), restaurado na tela. Fantasma.
- **OBS-2 chips "Pode me chamar de Kairo"/"quero trocar de carro"** → REJEITADO.
  Nenhum código emite esses chips (welcome só tem Imóvel/Automóvel/Moto; card do gate
  `name` é INPUT, não chips; a frase só existe como EXEMPLO no system-prompt.ts). Era
  o **dropdown nativo de autofill do Chrome** (o input de nome tem
  `autoComplete="given-name"`), lido pelo coletor como "botão do app".

### FIX-B — foco do input após a resposta (pedido do Kairo) + autofill do chat
- **Sintoma (Kairo):** "após cada resposta deixe o foco no componente ou no chat pra
  o usuário responder imediatamente". O coletor não pega isso (a ferramenta de
  pilotagem foca sozinha) — vale o pedido + a prova no código.
- **Causa (código):** `chat-input.tsx` tinha `disabled={isStreaming}` no textarea
  (perde o foco no streaming) e NENHUM efeito devolvia o foco quando o streaming
  termina. Só focava no mount.
- **Fix:** `useEffect([isStreaming])` que refoca o textarea quando `isStreaming` vira
  false, com guarda `requestAnimationFrame`+`document.activeElement` pra NÃO roubar o
  foco de um card de gate auto-focado (CPF/nome). + `autoComplete="off"` no textarea
  (mata o dropdown de autofill que confundiu o coletor). Commit: ver abaixo.
- **Status:** aplicado; a validar com humano (o coletor não distingue).

<!-- Próximos achados do loop entram aqui, um bloco por bug: sintoma → causa
     (com evidência determinística) → fix → commit → status. -->
