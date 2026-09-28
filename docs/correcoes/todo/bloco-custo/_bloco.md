---
bloco: bloco-custo
branch: feat/custo-de-ia-e-mensagem
workspace: feat-custo-de-ia-e-mensagem
onda: 2
depends_on: []
paralelo_com: [bloco-reentrada, bloco-comunicacoes, bloco-investimento]
itens: [FIX-391, FIX-392, FIX-393]
escopo_arquivos:
  - src/lib/admin/custo-de-ia.ts
  - src/lib/admin/custo-de-mensagem.ts
  - src/lib/admin/performance-queries.ts
  - src/components/admin/performance/
  - src/app/api/admin/
---
# Bloco custo — o CPC que a cliente quer fechar

Ordem interna: **391 → 392 → 393** (a fonte do custo de IA primeiro, a contagem de mensagem depois, a
tela por último).

`depends_on: []` — é o único bloco da onda 2 sem dependência: seus arquivos são novos e o ponto de
contato com o resto é só a tela de Performance.

**Decisão do dono (fechada com a Nebulosa em 28/09): rota B** — o custo de IA vem da **fonte atual (o
Langfuse)**, cruzada com o Postgres por `sessionId` do Langfuse = `conversationId`. **Não** criar tabela
de preço versionada em código e **não** gravar tokens por turno no banco.
