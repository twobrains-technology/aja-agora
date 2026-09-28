---
bloco: bloco-investimento
branch: feat/investimento-oficial
workspace: feat-investimento-oficial
onda: 2
depends_on: [bloco-pessoa]
paralelo_com: [bloco-reentrada, bloco-comunicacoes, bloco-custo]
itens: [FIX-390]
escopo_arquivos:
  - src/lib/admin/campanhas-queries.ts
  - src/lib/admin/performance-queries.ts
  - src/components/admin/campanhas/resumo-campanhas.tsx
  - src/components/admin/campanhas/tabela-campanhas.tsx
---
# Bloco investimento — o número oficial tem nome

`depends_on: bloco-pessoa` porque o rótulo do investimento precisa do mesmo recorte de pessoas já
corrigido; rotular em cima de número errado seria auditar a coisa errada.

**Um item só, e é de rótulo.** Não mexa em NENHUMA soma: a decisão do dono nomeia a leitura oficial
(Meta), mas as duas continuam aparecendo.
