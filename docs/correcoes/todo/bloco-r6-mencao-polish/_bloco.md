---
bloco: bloco-r6-mencao-polish
branch: fix/r6-mencao-polish
workspace: fix-r6-mencao-polish
onda: 1
depends_on: []
paralelo_com: [bloco-r6-contencao]
itens: [FIX-264, FIX-265]
escopo_arquivos: [src/lib/agent/orchestrator/choose-offer.ts, src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/web/adapter.ts, src/lib/agent/orchestrator/index.ts, src/lib/bevi/fecho-pedir-oi.ts]
conflitos_esperados: ["nível 2 com bloco-r6-contencao em index.ts (regiões diferentes)."]
---
# Bloco r6 menção v2 + polish (Fable r5)
Ordem: FIX-264 (resolver de menção v2) → FIX-265 (menores).
