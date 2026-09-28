---
bloco: bloco-regua
branch: feat/regua-cadencia
workspace: feat-regua-cadencia
onda: 1
depends_on: []
paralelo_com: [bloco-pessoa, bloco-toques, bloco-percurso9]
itens: [FIX-376, FIX-377, FIX-378]
escopo_arquivos:
  - src/lib/remarketing/
  - src/lib/workers/remarketing-cycle.ts
  - src/lib/admin/remarketing-tela.ts
  - src/lib/admin/remarketing-queries.ts
  - src/app/api/admin/remarketing/route.ts
  - src/components/admin/remarketing/
---
# Bloco régua — os três toques saem de verdade

Ordem interna: **376 → 377 → 378**. O 377 depende do 376 no comportamento (a escala curta é o que faz
o toque 2 e 3 caírem no portão), e o 378 só faz sentido depois que o motivo existe para ser mostrado.

**A régua MANDA MENSAGEM DE VERDADE.** Nada neste bloco pode fazer a régua disparar para o cliente
durante os testes: use fixture/`deps` injetadas e número da equipe. Se algum teste precisar de envio,
ele precisa de mock — nunca do caminho real de WhatsApp.
