---
bloco: bloco-r5-toolinput-rota
branch: fix/r5-toolinput-rota
workspace: fix-r5-toolinput-rota
onda: 1
depends_on: []
paralelo_com: [bloco-r5-fechamento-gates]
itens: [FIX-257, FIX-258]
escopo_arquivos: [src/lib/agent/tools/ai-sdk.ts, src/lib/agent/tools/schemas.ts, src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/analyze.ts]
---
# Bloco r5 tool-input + rota (Fable r4 5/10, P1 espiral de negação)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r4.md`. Ordem: FIX-257 (coerce tool inputs) → FIX-258 (rota nome→grupo).
