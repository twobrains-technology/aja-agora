---
bloco: bloco-r4-cards-polish
branch: fix/r4-cards-polish
workspace: fix-r4-cards-polish
onda: 1
depends_on: []
paralelo_com: [bloco-r4-ancora]
itens: [FIX-253, FIX-254, FIX-255, FIX-256]
escopo_arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/web/adapter.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/agent/orchestrator/directives.ts
conflitos_esperados:
  - "nível 2 com bloco-r4-ancora em route.ts/index.ts (regiões diferentes)."
---
# Bloco r4 cards-polish — fecha os caminhos descobertos + P2/P3 (Fable FINAL)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-final.md`. Ordem: FIX-253 (decision_prompt
fora do toolset + scarcity incondicional + embedded_bid texto) → FIX-254 (dedup educação) →
FIX-255 (copy identidade canal + acento Bevi + notice coerente) → FIX-256 (migration 0033 + reserva).
