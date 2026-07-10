---
bloco: bloco-r6-contencao
branch: fix/r6-contencao
workspace: fix-r6-contencao
onda: 1
depends_on: []
paralelo_com: [bloco-r6-mencao-polish]
itens: [FIX-262, FIX-263]
escopo_arquivos: [src/lib/agent/orchestrator/runner.ts, src/lib/agent/orchestrator/index.ts, src/app/api/chat/route.ts, src/lib/bevi/contract-input.ts]
---
# Bloco r6 CONTENÇÃO (Fable r5 5/10 — TROCA DE ÂNGULO: conter o LLM fora do trilho, em CÓDIGO)
Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r5.md`. A nota estagnou 5→5 porque os invariantes
seguem no PROMPT (falham ao vivo). Este bloco põe a contenção em CÓDIGO. Ordem: FIX-262 (tool-error+cap) → FIX-263 (re-ancora textual + anti-refazer código).
