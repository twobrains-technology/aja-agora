---
bloco: bloco-r8-estado-verdade
branch: fix/r8-estado-verdade
workspace: fix-r8-estado-verdade
onda: 1
depends_on: []
paralelo_com: [bloco-r8-acabamento]
itens: [FIX-270]
escopo_arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/orchestrator/runner.ts, src/app/api/chat/route.ts, src/lib/agent/system-prompt.ts]
---
# Bloco r8 estado-verdade (Fable r7 8/10 — O ÚNICO BLOQUEADOR real pra prod)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r7.md`. O agente FABRICA estado. Invariante em CÓDIGO (Lei 1/4/5), não prompt.
