---
bloco: bloco-r7-voz-polish
branch: fix/r7-voz-polish
workspace: fix-r7-voz-polish
onda: 1
depends_on: []
paralelo_com: [bloco-r7-recuperacao]
itens: [FIX-268, FIX-269]
escopo_arquivos: [src/lib/agent/orchestrator/directives.ts, src/lib/agent/orchestrator/sanitizer.ts, src/lib/web/adapter.ts, src/app/api/chat/route.ts, src/lib/telemetry/turn-trace.ts]
conflitos_esperados: ["nível 2 com bloco-r7-recuperacao em runner/index (regiões diferentes)."]
---
# Bloco r7 voz + polish (Fable r6, residuais r5)
Ordem: FIX-268 (residuais de voz) → FIX-269 (observabilidade).
