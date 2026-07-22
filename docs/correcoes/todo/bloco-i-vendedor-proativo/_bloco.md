---
bloco: bloco-i-vendedor-proativo
branch: fix/vendedor-lance-embutido-escassez
workspace: fix-vendedor-lance-embutido-escassez
onda: 2
depends_on: [bloco-g-remove-servicos]
paralelo_com: [bloco-h-resume-mesa]
itens: [FIX-366, FIX-367]
escopo_arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/embedded-bid-payload.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/scarcity-payload.ts
---
# Bloco I — Vendedor proativo: lance embutido + escassez

**Onda 2 — depende do bloco G ter integrado** (mesma razão do bloco H: `qualify-state.ts` e o
`Category` type ripplam). Paralelo com o bloco H (arquivos não coincidem).

FIX-366 e FIX-367 vão no mesmo bloco por afinidade: ambos são sobre o agente agir como
"vendedor inteligente" no ponto de decisão de lance, ambos tocam a região de
`orchestrator/index.ts` (escassez fica logo antes do card de decisão que o lance embutido
também influencia) — agrupar no mesmo bloco/sessão evita que dois blocos separados editem a
mesma região em paralelo (nível 2/4 de overlap, ver skill `todo-blocks`).

**Ambos os itens têm componente de investigação ANTES de corrigir** (não cravar paralelização
Bevi nem causa do card de escassez sem reproduzir) — trate como spike + fix, não como fix
direto.
