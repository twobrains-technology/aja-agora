---
bloco: bloco-pessoa
branch: feat/medicao-pessoa
workspace: feat-medicao-pessoa
onda: 1
depends_on: []
paralelo_com: [bloco-regua, bloco-toques, bloco-percurso9]
itens: [FIX-370, FIX-371, FIX-372, FIX-373, FIX-374, FIX-375]
escopo_arquivos:
  - src/lib/admin/performance-queries.ts
  - src/lib/admin/performance-types.ts
  - src/lib/admin/sinais-do-funil.ts
  - src/lib/admin/percurso-queries.ts
  - src/lib/admin/percurso-types.ts
  - src/lib/exportacao/percurso.ts
  - src/components/admin/performance/
---
# Bloco pessoa — o funil passa a contar PESSOA

Ordem interna: **370 → 371 → 373 → 372 → 375 → 374**. Os quatro primeiros são a mesma cirurgia
(unidade pessoa: contagem, paradas, proposta, ponte); 375 unifica o critério de "parado"; 374 é a
declaração de teste fora do recorte — mexe no mesmo arquivo da contagem, então vai por último para não
conflitar com o meio do caminho.

**É a mudança que faz os números CAÍREM.** É correção, não regressão: a janela 01–21/09 tem 123
conversas e 102 pessoas. Não "arredonde" para o número antigo em nenhum Teste.

**Ordem de merge:** este bloco é o que mais toca `performance-queries.ts` — se outro bloco encostar lá
(não deve), este entra primeiro.
