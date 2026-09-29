---
bloco: bloco-comunicacoes
branch: feat/comunicacoes-por-fase
workspace: feat-comunicacoes-por-fase
onda: 2
depends_on: [bloco-regua]
paralelo_com: [bloco-reentrada, bloco-investimento, bloco-custo]
itens: [FIX-387, FIX-388, FIX-389]
escopo_arquivos:
  - src/lib/admin/sinais-do-funil.ts
  - src/lib/remarketing/motor.ts
  - src/lib/whatsapp/template-dispatch.ts
  - src/lib/workers/remarketing-cycle.ts
---
# Bloco comunicações — a mensagem certa para a fase certa

Ordem interna: **387 → 388 → 389**.

**O texto NÃO é código.** Ele entra por cadastro (template na Meta) e por prompt; este bloco entrega a
ESTRUTURA (a fase como fato do servidor, a lista ordenada de chaves candidatas e a arte do bem). O texto
aprovado vai em `docs/decisoes/` como proposta e é cadastrado fora do repo.
