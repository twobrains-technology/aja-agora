---
bloco: bloco-r5-fechamento-gates
branch: fix/r5-fechamento-gates
workspace: fix-r5-fechamento-gates
onda: 1
depends_on: []
paralelo_com: [bloco-r5-toolinput-rota]
itens: [FIX-259, FIX-260, FIX-261]
escopo_arquivos: [src/lib/adapters/bevi/partner-offer-mapper.ts, src/lib/agent/orchestrator/directives.ts, src/lib/web/adapter.ts, src/lib/agent/orchestrator/index.ts, src/components/chat/artifacts/recommendation-card.tsx]
conflitos_esperados: ["nível 2 com bloco-r5-toolinput-rota em analyze/index (regiões diferentes)."]
---
# Bloco r5 fechamento + gates (Fable r4, P1 seam + gates por texto)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r4.md`. Ordem: FIX-259 (seam troca marca) → FIX-260 (gates texto) → FIX-261 (avisos/rawCreditValue).
