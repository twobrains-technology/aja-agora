---
id: FIX-251
titulo: "P0: what-if re-ancora recommendedOffer → fechamento fecha o plano ERRADO (âncora stale)"
status: done
bloco: bloco-r4-ancora
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/choose-offer.ts
  - src/lib/bevi/contract-input.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-A P0)
executado_em: "2026-07-10"
---
## Gap (veredito FINAL §N-A, P0 — reproduzível, proposta REAL errada na Bevi)
Fluxo B: reveal recomenda RODOBENS 90k. What-if "quero a ITAÚ" → 161.258 → o runner
**re-ancora `meta.recommendedOffer` no artifact do what-if** (`runner.ts:706,736`). Usuário
REJEITA e reconfirma RODOBENS 3×; `contract_form` mostra RODOBENS. Mas `contract-submit` usa
`valor = meta.recommendedOffer.creditValue` = 161.258 (`contract-input.ts:43`, oferta stale
vence o creditMax falado); o clamp de 20% então EXCLUI a RODOBENS e fecha **ITAU 161.258**
(79% acima, 2,4× a parcela), sem aviso possível (carta==input stale → FIX-247 cego). Agente
promete corrigir e re-serve a MESMA proposta (mesmo proposalId) — loop morto. Lei violada:
"nunca aja sobre entidade não-ancorada" no ponto mais caro.
## Correção (cirúrgica — o Fable indicou as duas opções)
- (a) `runner.ts`: what-if (re-simulação de valor/grupo) NUNCA re-ancora `recommendedOffer` —
  só avanço EXPLÍCITO (decision/choose_offer) ancora. E/OU
- (b) `contract-input.ts`: no fechamento, validar `valor`/grupo contra a ÚLTIMA confirmação
  explícita do usuário (choose_offer/decision/creditMax), não a oferta stale.
## Regressão (TDD + E2E)
- Fluxo B: reveal RODOBENS 90k → what-if ITAÚ → rejeita → reconfirma RODOBENS → `contract-submit`
  fecha RODOBENS 90k (NÃO ITAU 161k). Teste reproduz a sequência exata.
- what-if não altera recommendedOffer (teste unit do runner).

## Correção aplicada
Opção (b) cirúrgica, sem tocar no comportamento legítimo do what-if (FIX-6 — o dial
continua acompanhando o último detalhamento simulado):
- `choose-offer.ts`: `findOfferByAdministradora`/`listShownOffers`/`resolveOfferForAdministradora`
  resolvem, server-side, a cota REALMENTE exibida cuja administradora bate com a anunciada —
  nunca inventa (ambíguo/não-exibida → null).
- `runner.ts`: no turno de `present_contract_form`, re-ancora `recommendedOffer`/
  `recommendedAdministradora` pela administradora que o PRÓPRIO turno de fechamento anuncia
  (`input.administradora`) sempre que ela divergir do snapshot em `meta` — mata a âncora stale
  no ponto mais caro, sem tocar no snapshot do what-if em si.
- `contract-input.ts`: defesa em profundidade — se `recommendedOffer.administradora` e
  `recommendedAdministradora` divergirem por qualquer caminho não coberto, `valor`/`prazoPreferido`
  NUNCA usam o snapshot da administradora abandonada (cai pro `creditMax`/`creditMin` pedido).
- Testes: `choose-offer.test.ts` (unit), `contract-input.test.ts` (unit, defesa em profundidade),
  `runner.ancora-fechamento.integration.test.ts` (TDD vermelho→verde reproduzindo o Fluxo B
  ponta-a-ponta via `runTurn`, com DB real).
