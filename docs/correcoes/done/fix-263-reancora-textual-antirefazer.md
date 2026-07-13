---
id: FIX-263
titulo: "Confirmação TEXTUAL não re-ancora (aviso nomeia marca errada) + anti-refazer só no prompt (falha ao vivo)"
status: done
bloco: bloco-r6-contencao
arquivos: [src/lib/agent/orchestrator/index.ts, src/app/api/chat/route.ts, src/lib/bevi/contract-input.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, seam fechamento P1)
---
## Gap (veredito r5 — seam PARCIAL)
(a) Usuário confirma marca por TEXTO 3× mas confirmação textual NUNCA re-ancora `recommendedOffer` →
FIX-251 falha com 2 ofertas da mesma marca; o aviso de troca nomeia a marca anterior ERRADA.
(b) O anti-negação/anti-refazer é REGRA-NO-PROMPT e falhou ao vivo 2×: negou a proposta registrada,
afirmou falsamente que outra estava registrada (sem `check_proposal_status`), re-abriu o contract_form
de marca ≠ registrada — a 1 clique de uma 2ª proposta real.
## Correção (CÓDIGO)
- Confirmação textual de uma administradora/oferta EXIBIDA re-ancora `recommendedOffer` determinístico
  (resolveOfferMention pós-reveal por texto), igual ao choose_offer de clique.
- Anti-refazer em CÓDIGO: depois de uma proposta registrada, BLOQUEAR emitir contract_form de marca ≠
  a registrada (guard no handler) — não confiar no prompt. Status da proposta sempre via check_proposal_status.
## Regressão (TDD)
- confirmar ITAÚ por texto → recommendedOffer = ITAÚ (aviso nomeia a marca certa).
- pós-proposta, contract_form de outra marca → bloqueado (sem 2ª proposta).

## Implementação (2026-07-10)
- `index.ts` (`runTurn`): logo após `resolveOfferMentionForConversation`, quando o texto do turno
  resolve DETERMINISTICAMENTE pra uma cota já exibida (nome/valor) — pós-reveal, com os 3 números
  completos, e diferente do groupId já ancorado — persiste `recommendedAdministradora`/`recommendedOffer`
  ANTES de montar o systemContext/chamar o modelo. Mesma rota do clique `choose_offer` (route.ts), agora
  também pro caminho de texto. Sem menção clara (ambígua/nenhuma) ou pré-reveal: nunca ancora (Lei 3).
- `contract-input.ts`: `administradoraConflictsWithRegisteredProposal(registered, requested)` — função
  pura (mesma normalização de acento/caixa do FIX-251) que decide se o fechamento em curso conflita com
  uma proposta REAL já registrada nesta conversa.
- `route.ts` (handler `contract-submit`): novo guard ANTES de `startContract` — consulta
  `getLatestBeviProposal(conversationId)` (fonte de verdade, `bevi_proposals`, nunca o que o modelo
  afirma) e bloqueia com mensagem determinística (nomeia a administradora CERTA — a registrada — e
  convida a checar o status) quando a administradora pedida diverge da já registrada. Mesma
  administradora (retry legítimo) ou sem proposta ainda (1ª vez): segue normalmente pro gateway.
- Testes: `contract-input.test.ts` (+5 casos unit da função pura), `index.fix-263-reancora-textual.integration.test.ts`
  (DB real — confirma/ambíguo/pré-reveal) e `route.fix-263-antirefazer.integration.test.ts` (DB real —
  bloqueia 2ª proposta, permite retry mesma marca, permite 1ª proposta). `pnpm test:unit` 337/337
  arquivos, 3168/3168 testes verdes; `pnpm test:integration` (RUN_DB_TESTS=1) 74/74 arquivos, 297/297
  testes verdes — nenhuma regressão nos FIX r1-r5.
