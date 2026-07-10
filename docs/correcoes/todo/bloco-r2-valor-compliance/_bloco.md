---
bloco: bloco-r2-valor-compliance
branch: fix/r2-valor-compliance-consorcio
workspace: fix-r2-valor-compliance-consorcio
onda: 1
depends_on: []
paralelo_com: [bloco-r2-funil-cards]
itens: [FIX-240, FIX-241, FIX-242, FIX-243, FIX-244, FIX-245]
escopo_arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/components/chat/artifacts/real-offer.tsx
  - src/lib/agent/dial-payload.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/consorcio/contemplation-dial.ts
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/two-paths.tsx
  - src/components/chat/artifacts/embedded-bid.tsx
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
  - src/app/api/chat/route.ts
conflitos_esperados:
  - "nível 2 com bloco-r2-funil-cards em route.ts (contract-submit guard vs handlers de funil — regiões diferentes)."
---

# Bloco r2 valor-compliance — gaps de VALOR/MOTOR + COMPLIANCE + higiene (Fable r1)

Rodada 2. Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r1.md`. Corrige carta 211k,
âncora de dinheiro morta, arredondamento de parcela, compliance de fala, contract-submit guard, higiene.

## Ordem interna
FIX-240 (carta 211k — P0) → FIX-241 (âncora — P1) → FIX-243 (compliance fala — P1) →
FIX-242 (arredondamento — P2) → FIX-244 (contract-submit guard — P2) → FIX-245 (higiene — P3).

## DECISÃO DE PRODUTO (Kairo, rodada 2): carta 211k
Clampar à faixa pedida + aviso obrigatório: o fecho NUNCA confirma carta muito acima da ancorada
sem o aviso de ajuste (rawCreditValue/FIX-197 renderiza), e saltos grandes (>~20%) são clampados
no fechamento. Ver FIX-240.
