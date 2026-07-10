---
id: FIX-267
titulo: "Menção por parcela/prazo não resolve (só creditValue)"
status: todo
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
