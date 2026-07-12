---
bloco: bloco-r9-compliance-copy
branch: fix/r9-compliance-copy
workspace: fix-r9-compliance-copy
onda: 1
depends_on: []
paralelo_com: [bloco-r9-gate-funil]
itens: [FIX-277, FIX-278]
escopo_arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/bevi/closing-presentation.ts
  - src/lib/bevi/closing-presentation.test.ts
---
# Bloco r9 compliance-copy (veredito baseline Sonnet, 3/10)

Os 2 itens deste bloco são as duas violações de **UI/Compliance** que travaram a nota do
baseline r9 no piso (3/10, mínimo das dimensões) — ambas P0, ambas puro texto/copy, sem
decisão de design em aberto (root cause já provado, correção já fechada):

- **FIX-277** — o agente (e o próprio card hero) afirma falsa exatidão do valor da carta
  quando ela diverge do pedido (risco CDC art. 30/37, reproduzido em 4/5 dossiês).
- **FIX-278** — o fechamento usa "contratando um consórcio", terminologia banida pela Ata
  2026-07-04 ("reserva de cota"), reproduzido em 3/3 fechamentos e ainda **pinado por
  teste** que prova o texto errado.

Ambos vivem na cauda do funil (reveal → fechamento) e são texto/copy — cabem no mesmo pacote
por afinidade (mesmo tema de compliance/terminologia, nenhum toca lógica de gate). Ordem
sugerida: **FIX-278 primeiro** (mudança isolada, 1 arquivo + teste, sem dependência de
nenhum outro campo) → **FIX-277 depois** (mexe em 3 arquivos, incluindo uma nova regra de
prompt). Sem dependência real entre os dois — a ordem é só organização, não bloqueio.

`escopo_arquivos` é DISJUNTO do `bloco-r9-gate-funil` (nenhum arquivo em comum) — paralelo
sem conflito esperado.
