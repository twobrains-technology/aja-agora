---
bloco: bloco-a-remove-letta-postgres
branch: feat/memoria-postgres-remove-letta
workspace: feat-memoria-postgres-remove-letta
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-81]
escopo_arquivos:
  - src/lib/memory/
  - src/db/schema.ts
  - drizzle/
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/lead-collection.ts
  - src/app/api/admin/simulator/sessions/[id]/memory/route.ts
---
# Bloco A — Remover o Letta, re-homear a memória pro Postgres

Bloco ÚNICO (refactor coeso de 1 dev) que executa a **Opção B** do ADR
`docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md` (FIX-80). Não
paraleliza — é uma migração estrutural do backend de memória, toca toda a pasta
`src/lib/memory/` + schema/migration + 3 call-sites de runtime. Serializar é
correto aqui: dividir geraria retrabalho de contrato (a interface `MemoryAdapter`
é o ponto de corte único).

Gate exige PG de teste (ver memória `project_aja_typecheck_debt_gate`): o
integration test do novo adapter toca DB.
