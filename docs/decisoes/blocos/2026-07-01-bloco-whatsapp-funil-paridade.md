# Decisões — bloco-whatsapp-funil-paridade (2026-07-01)

ADR local do bloco (auditoria jornada 2026-07-01). Segue o template canônico
`padrao-de-docs/templates/decisao.md`.

### 2026-07-01 — FIX-120: coletar o valor do bem no WhatsApp por TEXTO determinístico

- **Contexto:** a jornada canônica (D5/Passo 2) manda o gate `credit` no WhatsApp
  virar **conversa** ("o usuário fala 'uns 80 mil'"), não uma lista de faixas. O web
  já obedece (FIX-115: agulha simples → texto livre → `parseAssetValue`). Ao tirar a
  lista de faixas do WhatsApp, a pergunta do valor viajava **dentro** do body da lista
  (`formatter.ts:499-500`); removendo a lista, a pergunta some. Precisa decidir COMO
  emitir a pergunta.
- **Decisão:** enviar a pergunta como **texto determinístico** — `gateInteractive("credit")`
  retorna `null` e o adapter manda `gateQuestion("credit", category)` ("Qual valor do bem
  faz mais sentido pra você?") por `sendTextMessage`, espelhando **exatamente** o tratamento
  textual do gate `identify` (`IDENTIFY_WHATSAPP_PROMPT`). Vale nos dois caminhos do gate
  credit: o evento `gate` em `consumeEvents` e o `fireGate` direto. A resposta livre é
  capturada pelo analyzer (LLM) + backstop determinístico `parseAssetValue` (FIX-115),
  que grava o `creditMax` e avança o funil. **Confirmado via `AskUserQuestion`** (opção
  recomendada selecionada).
- **Alternativas descartadas:**
  - **Directive do agente (LLM formula a pergunta)** — mais caloroso/contextual, mas
    **não-determinístico**: depende do LLM não narrar mecanismo nem variar a copy, e
    arrisca divergir do texto canônico da web. A jornada pede paridade determinística.
  - **Manter a lista de faixas (status quo)** — é o próprio defeito D5 (grava o teto da
    faixa `range.max`, não o valor real dito). Sentenciado pela jornada.
- **Sub-decisão (b) — código morto:** REMOVER `creditRangeQuestionToWhatsApp` +
  `resolveCreditReply` + roteamento `credit_` (`dispatchInteractiveReply`) + `handleCredit`,
  que viram código morto após o corte (nenhuma lista → nenhum reply `credit_*`). Decidido
  sem perguntar (decisão técnica óbvia: sem dead code / import órfão, regra global do Kairo).
  `CREDIT_BUCKETS` **fica** — segue servindo `lanceValueOptions` e como referência de faixa.
  `parseAssetValue` fica **intacto** (rede anti-trava do funil, requisito do Kairo).
- **Consequências:** ✅ paridade com a web (mesma coleta conversacional); ✅ determinístico
  (pergunta nunca some, não depende do LLM); ✅ menos código (lista + resolver + handler
  saem). ⚠️ um clique tardio numa lista antiga já enviada em conversa em andamento cai no
  fallback de texto — seguro em homologação (sem UI persistida). 🎲 se o analyzer LLM cair
  e o texto do usuário fugir das formas cobertas por `parseAssetValue`, o gate credit
  re-dispara (mesma rede que já protege a web).
- **Reversibilidade:** fácil (git revert do commit do FIX-120).
- **Status:** aceita.
- **Evidência:** commit do FIX-120 (`test+fix:`) + `src/lib/whatsapp/adapter.fix-120.test.ts`
  + `src/lib/agent/qualify-config.fix-120.test.ts` + cassette em `tests/regression/agent-trajectory.test.ts`.
