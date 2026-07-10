---
id: FIX-263
titulo: "Confirmação TEXTUAL não re-ancora (aviso nomeia marca errada) + anti-refazer só no prompt (falha ao vivo)"
status: todo
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
