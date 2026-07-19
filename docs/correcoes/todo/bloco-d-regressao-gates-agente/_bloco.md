---
bloco: bloco-d-regressao-gates-agente
branch: fix/regressao-gates-agente
workspace: fix-regressao-gates-agente
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-354]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/adapter.ts
---
# Bloco D — regressão dos gates de reveal (achado colateral, sem relação com /kv)

Bloco único (sem paralelismo — item isolado, investigação de causa raiz
compartilhada entre os 4 testes). Base própria (`integ/fix-regressao-gates-agente`,
forkada direto da `develop`), independente da campanha de migração da landing
(`integ/kv-producao`) — arquivos totalmente disjuntos, sem relação temática.
