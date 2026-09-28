---
bloco: bloco-toques
branch: feat/toques-lista
workspace: feat-toques-lista
onda: 1
depends_on: []
paralelo_com: [bloco-pessoa, bloco-regua, bloco-percurso9]
itens: [FIX-379, FIX-380, FIX-381]
escopo_arquivos:
  - src/app/api/admin/remarketing/route.ts
  - src/lib/admin/remarketing-queries.ts
  - src/lib/admin/remarketing-tela.ts
  - src/components/admin/remarketing/resumo-da-regua.tsx
  - src/components/admin/remarketing/insights-da-regua.tsx
  - src/components/admin/remarketing/tabela-remarketing.tsx
---
# Bloco toques — "para quem foi, e como"

Ordem interna: **380 → 379 → 381** (a forma do envio é insumo da lista de quem recebeu; o teto do
cadastro é a última coluna a acertar).

**Overlap textual (nível 2) com o bloco-regua:** os dois tocam
`src/lib/admin/remarketing-tela.ts` e `src/app/api/admin/remarketing/route.ts`, em regiões diferentes
(este bloco mexe em lista/filtro/forma; o outro em motivo e cadência). **Paralelo mesmo assim.**
Ordem de merge: **bloco-regua primeiro**, este resolve o conflito.
