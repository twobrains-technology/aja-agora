---
bloco: bloco-r4-ancora
branch: fix/r4-ancora-fechamento
workspace: fix-r4-ancora-fechamento
onda: 1
depends_on: []
paralelo_com: [bloco-r4-cards-polish]
itens: [FIX-251, FIX-252]
escopo_arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/bevi/contract-input.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/choose-offer.ts
conflitos_esperados:
  - "nível 2 com bloco-r4-cards-polish em route.ts/index.ts (regiões diferentes)."
---
# Bloco r4 âncora — o P0 do fechamento (Fable FINAL 4/10)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-final.md`. Corrige o P0 N-A (fecha plano
ERRADO por âncora stale) + a rota nome→grupo. Ordem: FIX-251 (âncora) → FIX-252 (nome→grupo).
