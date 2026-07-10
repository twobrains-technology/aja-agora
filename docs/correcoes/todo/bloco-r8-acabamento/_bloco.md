---
bloco: bloco-r8-acabamento
branch: fix/r8-acabamento
workspace: fix-r8-acabamento
onda: 1
depends_on: []
paralelo_com: [bloco-r8-estado-verdade]
itens: [FIX-271, FIX-272]
escopo_arquivos: [src/lib/agent/orchestrator/runner.ts, src/lib/agent/orchestrator/directives.ts, src/lib/web/adapter.ts, src/app/api/chat/route.ts]
conflitos_esperados: ["nível 2 com bloco-r8-estado-verdade em runner/route (regiões diferentes)."]
---
# Bloco r8 acabamento (Fable r7, o resto honesto)
Ordem: FIX-271 (empty-turn roda resolver) → FIX-272 (voz: reserva na prosa + picotado + dup-click).
