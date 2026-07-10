---
id: FIX-242
titulo: "Parcela arredondada (sem centavos) em 4 cards — cutuca CDC art. 30"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/components/chat/artifacts/comparison-table.tsx, src/components/chat/artifacts/contemplation-dial.tsx, src/components/chat/artifacts/two-paths.tsx, src/components/chat/artifacts/embedded-bid.tsx]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P2 #8)
---

## Gap (veredito Fable §D2.3, gap #8)
`maximumFractionDigits: 0` em `comparison-table.tsx:13`, `contemplation-dial.tsx:21`,
`two-paths.tsx:13`, `embedded-bid.tsx:11` → parcela R$ 2.182,01 renderiza "R$ 2.182/mês".
Inconsistente com recommendation-card/real-offer (que usam centavos, `brl2`) e cutuca "nunca
arredonda valor monetário" (CDC art. 30). Pra PARCELA é arredondamento real.

## Correção
- Usar o formatador com centavos (`brl2`/`maximumFractionDigits: 2`) pra PARCELA nos 4 componentes.
  Carta (valor redondo) pode seguir sem centavos — o problema é a parcela.

## Regressão (TDD)
- render dos 4 cards: parcela com centavos (ex.: "R$ 2.182,01"), não "R$ 2.182".
