---
bloco: bloco-percurso9
branch: feat/percurso-lista-parados
workspace: feat-percurso-lista-parados
onda: 1
depends_on: []
paralelo_com: [bloco-pessoa, bloco-regua, bloco-toques]
itens: [FIX-382, FIX-383, FIX-384]
escopo_arquivos:
  - src/lib/admin/percurso-types.ts
  - src/lib/admin/percurso-queries.ts
  - src/app/api/admin/percurso/route.ts
  - src/lib/exportacao/
  - src/lib/admin/limpeza.ts
  - src/lib/admin/limpeza-queries.ts
  - src/app/admin/(dashboard)/exportacao/page.tsx
---
# Bloco percurso9 — a lista que a Bruna usa para LIGAR

Ordem interna: **382 → 384 → 383**.

**Overlap textual (nível 2) com o bloco-pessoa:** os dois tocam `percurso-types.ts` /
`percurso-queries.ts` / `exportacao/`. Regiões diferentes (aqui é o SHAPE da lista e a limpeza; lá é a
CONTAGEM por pessoa). **Paralelo mesmo assim.** Ordem de merge: **bloco-pessoa primeiro**.

**Entregável que este bloco habilita (não é código):** com o shape do FIX-382 mergeado, sai a resposta
"quem são os 9" — uma linha por pessoa, com nome, telefone, etapa, última interação (data + autor),
canal/origem, se pediu simulação, se está na régua e o motivo nomeado quando não está. É o que a cliente
pediu para poder ligar (25/09).
