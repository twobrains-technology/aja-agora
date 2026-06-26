---
bloco: bloco-c-estudo-remocao-letta
branch: chore/estudo-remocao-letta
workspace: chore-estudo-remocao-letta
onda: 1
depends_on: []
paralelo_com: [bloco-a-agente-passos-obrigatorios, bloco-b-bevi-fechamento]
itens: [FIX-80]
escopo_arquivos:
  - docs/correcoes/decisions/  # ADR 2026-06-25-remocao-letta-postgres.md
  - docs/                       # plano de migração
  - src/lib/memory/postgres-adapter.ts  # STUB novo, opcional — NÃO ligado no runtime
---
# Bloco C — ESTUDO/PLANO de remoção do Letta (NÃO arranca)

- **FIX-80** — estudar a fundo e PLANEJAR a remoção do Letta com re-home da memória pro
  Postgres. Veredito do arquiteto (Opus): o Letta é OVERKILL neste app (archival morto há
  tempos por OpenAI 429 sem impacto de UX; memória agêntica self-editing com ZERO uso; é
  usado como KV-store REST caro e remoto; o que chega ao prompt é projeção determinística
  do `conversations.metadata` que o app já tem no Postgres). O adapter pattern
  (`MemoryAdapter`) já existe = corte limpo possível via `PostgresMemoryAdapter`.

## Natureza — ESTUDO + PLANO + STUB, NÃO remoção

⚠️ **Este bloco NÃO arranca o Letta e NÃO toca código de runtime existente.** É refactor
grande, **PENDENTE-KAIRO**: o veredito é "forte por inferência de código" mas NÃO cravado
por dado de prod, e exige medição antes de executar. A entrega é **plano + ADR + stub** —
o Kairo decide depois se/quando executa.

Por isso é `chore/` (não `fix/`): não corrige defeito de runtime, entrega artefatos de
decisão. Não exige cassette nem integration test (não muda comportamento) — a regressão
relevante (preservar o contrato `MemoryAdapter`: read não-throw, write fire-and-forget,
degradação limpa, reativação) é responsabilidade da implementação FUTURA, não deste estudo.

Disjunto dos Blocos A (orchestrator/prompt) e B (adapter Bevi) — nível 1. NÃO modifica
orchestrator/runtime existente.
