---
bloco: bloco-g-remove-servicos
branch: fix/remove-servicos-categoria
workspace: fix-remove-servicos-categoria
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-363]
escopo_arquivos:
  - drizzle/
  - src/db/schema.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/categories.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/recommendation.ts
  - src/lib/consorcio/plan-estimate.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/routing.ts
  - src/lib/agent/tools/assistant-tools.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/chat/types.ts
  - src/lib/chat/ui-message.ts
  - src/lib/diagnose/types.ts
  - src/lib/agent/personas-repo.ts
  - src/lib/agent/reactivation.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/adapters/bevi/partner-offer-mapper.ts
  - src/lib/validations/persona.ts
---
# Bloco G — Remover a modalidade "Serviços" de todas as camadas

**Roda SOZINHO na onda 1, sem paralelo.** É cross-cutting: muda o type `Category`
(`personas.ts:9`), que rippla em ~30 arquivos que os blocos H e I (onda 2) também tocam.
Rodar em paralelo com eles garantiria conflito de merge e branch quebrando no typecheck da
base. Os blocos H e I só são lançados DEPOIS que este bloco integrar na base com typecheck
limpo (é a condição de entrada da onda 2 — ver goal doc `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`, seção "Plano de blocos").

Único item (FIX-363), mas com blast radius grande — é uma migração estrutural (CHECK
constraint de produção + mapeamento de segmento externo da Bevi), não uma remoção cosmética.
Trate com o cuidado de uma migração de schema real: ordem de operações importa (deletar a
persona antes de aplicar o novo CHECK).
