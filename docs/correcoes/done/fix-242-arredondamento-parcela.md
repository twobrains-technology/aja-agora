---
id: FIX-242
titulo: "Parcela arredondada (sem centavos) em cards — cutuca CDC art. 30"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
  - src/components/chat/artifacts/two-paths.tsx
rodada: 2026-07-10 rodada 2 (Fable r1, gap P2 #8)
commit: 7e97ec7
executado_em: "2026-07-10"
nota: >
  embedded-bid.tsx (listado no card original) foi REFUTADO: EmbeddedBidPayload não
  tem campo de parcela/monthlyPayment (só valores de carta — embeddedBidValue,
  netCredit), nada a arredondar ali. Documentado no teste
  parcela-centavos.fix-242.test.tsx em vez de alterar o arquivo.
---

## Gap (veredito Fable §D2.3, gap #8)
`maximumFractionDigits: 0` em `comparison-table.tsx:13`, `contemplation-dial.tsx:21`,
`two-paths.tsx:13`, `embedded-bid.tsx:11`: parcela R$ 2.182,01 renderiza
"R$ 2.182/mês". Inconsistente com recommendation-card/real-offer (que usam centavos,
`brl2`) e cutuca "nunca arredonda valor monetário" (CDC art. 30). Pra PARCELA é
arredondamento real (pra carta, valor já redondo, seria inócuo).

## Correção
- `comparison-table.tsx`: novo `formatBRL2` (com centavos) aplicado às 4 ocorrências
  de parcela (carrossel + QuotaSelector do reveal, aria-label e display). Carta e
  lance médio seguem em `formatBRL` (0 decimais) — não são o problema.
- `contemplation-dial.tsx`: novo `brl2` aplicado às 2 parcelas (antes/depois da
  contemplação). Lance necessário/crédito líquido/lance declarado seguem em `brl`.
- `two-paths.tsx`: `formatBRL` só formata parcela nesse card (não há carta) — trocado
  direto pra centavos, sem precisar de um segundo formatador.
- `embedded-bid.tsx`: **achado refutado** — verificado o tipo `EmbeddedBidPayload`,
  não existe campo de parcela; o veredito citou o arquivo por engano (provável
  copy-paste da lista de 4 arquivos sem checar cada um). Nenhuma alteração.

## Regressão (TDD — vista falhar antes, verde depois)
`parcela-centavos.fix-242.test.tsx` — parcela com centavos (R$ 2.182,01) nos 3
componentes reais; carta segue sem centavos (comparison-table); e teste explícito
documentando que `embedded-bid.tsx` não tem campo de parcela (achado refutado).

## Achados extras corrigidos de quebra (consequência direta e esperada do fix)
- `contemplation-dial.oferta-real.test.tsx`: fixava literalmente "9.829" com o
  comentário "brl arredonda pra inteiro" — era o próprio bug codificado como
  esperado no teste. Atualizado pra "9.828,92" (valor real, sem arredondar).
- `reveal-hero-seletor.fix-196.test.tsx`: assumia "hero mostra centavos, chip do
  seletor mostra sem centavos" pra distinguir os dois na query — agora os dois
  batem (ambos corretos, com centavos), causando `getMultipleElementsFoundError`.
  Escopada a query no `data-testid="recommendation-secondary-payment"` do hero.
