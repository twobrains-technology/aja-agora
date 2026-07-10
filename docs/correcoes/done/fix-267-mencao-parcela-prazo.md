---
id: FIX-267
titulo: "Menção por parcela/prazo não resolve (só creditValue)"
status: done
bloco: bloco-r7-recuperacao
arquivos: [src/lib/agent/orchestrator/choose-offer.ts]
rodada: 2026-07-10 rodada 7 (Fable r6)
---
## Gap (veredito r6)
`resolveOfferByMention` casa por nome+creditValue, mas menção por PARCELA ("a de 1.200 por mês")
ou PRAZO não resolve.
## Correção
- Estender o resolver pra casar também parcela (monthlyPayment) e prazo (termMonths) de um grupo
  EXIBIDO — determinístico, ancorado em shown-groups.
## Regressão (TDD)
- "a de 1.200 por mês" com esse grupo exibido → resolve o groupId certo.

## Implementado (2026-07-10)
`matchValueMentions` generalizada em `matchByNumericField` (campo numérico parametrizável) e reusada
pra 2 extrações novas: `extractMonthlyPaymentMentions` ("parcela de R$X"/"X por mês"/"X/mês", tolerância
5%) e `extractTermMentions` ("X meses"/"X anos", match exato em meses). `resolveOfferByMention` une os
3 conjuntos de matches (crédito/parcela/prazo) via `unionByGroupId` antes de aplicar a mesma semântica
de nome×valor do FIX-264 (nunca desiste se um grupo exibido casa). Testes: 6 casos novos em
`choose-offer.test.ts` (parcela exata, exemplo literal do veredito "1.213,85", prazo em meses/anos,
nome+parcela coerentes, sem match → null) — 35/35 verdes, incluindo as regressões FIX-252/258/264/265.
Suíte completa: 3206/3206 verde.
