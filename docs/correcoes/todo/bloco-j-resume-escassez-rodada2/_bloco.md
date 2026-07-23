---
bloco: bloco-j-resume-escassez-rodada2
branch: fix/resume-escassez-rodada2
workspace: fix-resume-escassez-rodada2
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-368, FIX-369]
escopo_arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/index.ts
  - src/components/chat/theater/theater-chat.tsx
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/server-cards.ts
  - src/lib/agent/orchestrator/tool-policy.ts
project: ac2f26b2-a2ba-4148-96b8-47b55f0dd5ad
---
# Bloco J — resume pós-fechamento + escassez (rodada 2 da campanha vendedor-matador)

Achados do juiz Sonnet (fase ④, rodada 1) da campanha `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`.
Ambos os itens tocam `runner.ts` — mesmo bloco, ordem sequencial abaixo, para evitar
conflito de merge dentro do próprio worktree.

**Ordem de execução:**
1. **FIX-368 primeiro** (mais grave — achado mais consistente e mais severo da rodada 1,
   reproduzido em 3/3 personas; root cause já provado no código, sem investigação pendente).
2. **FIX-369 depois** — atenção: o card documenta que o root cause é uma HIPÓTESE de código
   (não confirmada ao vivo). O primeiro passo deste item é reproduzir o cenário da persona 2
   (moto, aceita lance embutido) e confirmar se `present_decision_prompt` foi chamado por
   tool-call direto do modelo ou pelo `dispatchDecisionCascade` determinístico, ANTES de
   escrever qualquer fix. Se a hipótese for refutada, documentar o achado real no `.done/`
   e investigar os 2 caminhos alternativos já listados no card (grupo não ancorado / oferta
   Bevi sem `availableSlots`) — não force um fix que não corresponde à causa real.

Esta é a **rodada 2** da campanha — depois deste bloco integrar na base
`integ/vendedor-matador`, a campanha volta pra fase ④ (harness de conversa real das 3
personas + juiz) pra verificar se os 2 achados foram fechados.
