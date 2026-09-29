---
bloco: bloco-reentrada
branch: feat/reentrada-parados
workspace: feat-reentrada-parados
onda: 2
depends_on: [bloco-regua]
paralelo_com: [bloco-comunicacoes, bloco-investimento, bloco-custo]
itens: [FIX-385, FIX-386]
escopo_arquivos:
  - src/lib/remarketing/regua.ts
  - src/lib/remarketing/motor.ts
  - src/lib/remarketing/entrada.ts
  - src/app/api/admin/remarketing/
  - src/components/admin/remarketing/
---
# Bloco reentrada — abrir a porta do bolo parado

Ordem interna: **386 → 385** (primeiro travar que esgotar NÃO vira `perdido`; depois a ação de
reentrada, que é o que a cliente quer para poder ligar e tocar).

`depends_on: bloco-regua` porque o 377 (contador próprio de toques) e o 376 (cadência) mexem no mesmo
caminho de disparo — lançar junto seria retrabalho, não paralelismo.
