# Bloco C — Estudo de remoção do Letta (re-home da memória pro Postgres)

**Data:** 2026-06-26 · **Branch:** `chore/estudo-remocao-letta` · **FIX-80** · **Natureza:** ESTUDO + PLANO + STUB (NÃO arranca o Letta)

> ⚠️ Nenhum código de runtime foi tocado. O Letta segue ativo. A entrega é
> decisão + plano + stub ilustrativo. A execução é **PENDENTE-KAIRO** e exige
> medição em prod antes de qualquer corte.

## O que entregou

1. **ADR completo** — `docs/correcoes/decisions/2026-06-25-remocao-letta-postgres.md`:
   contexto, mapa de uso real, veredito, 4 opções consideradas, decisão proposta,
   plano de migração faseado, riscos, rollback, e os pré-requisitos de medição.
2. **Plano de migração faseado** (dentro do ADR, §5) — fase 0 (medição bloqueante)
   → fase 1 (implementar adapter sem ligar) → fase 2 (cutover atrás de flag +
   backfill) → fase 3 (desativar Letta) → fase 2-archival (pgvector OPCIONAL).
3. **Stub não-ligado** — `src/lib/memory/postgres-adapter.ts`: implementa a
   interface `MemoryAdapter` com corpos `TODO(estudo)`, documenta a tabela
   `memory_identities`. **Zero importadores**, NÃO registrado no factory, NÃO
   troca `MEMORY_ADAPTER` nem container.
4. **Housekeeping** — FIX-80 movido pra `done/` (status: done), pasta do bloco
   esvaziada e apagada.

## O que mapeou do uso REAL do Letta

- **Interface de corte já existe:** `MemoryAdapter` (`adapter.ts`) com 3 impls
  (Letta/Noop/factory+circuit-breaker). Todo o orchestrator fala por **um bridge**
  (`orchestrator-bridge.ts`). Call-sites de runtime:
  - **Read** (`orchestrator/index.ts:147-154`): resolve identidade → `loadContext`
    → vira system message `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` no prompt.
  - **Write** (`orchestrator/index.ts:221`): `storeMemoriesForTurn` fire-and-forget.
  - **Reconcile** (`lead-collection.ts:229`): cookie anônimo → phone no lead capture.
  - **Purge** (`reset/route.ts:82,90`): /reset web, best-effort.
  - **Dupla injeção** (`builder.ts:194`): 2º ponto que injeta a memória (custo token).
  - **Inspector admin** (`inspect.ts:93`, dev-only): único call-site que instancia
    `new LettaMemoryAdapter()` direto, furando o factory.
- **Archival (busca semântica/embeddings) está MORTO** (OpenAI 429) sem impacto de UX.
- **Memória agêntica self-editing tem ZERO uso** — Letta é KV-store REST caro/remoto.
- **O que chega ao prompt é projeção determinística** (`extractor.ts` sem LLM) do
  `conversations.metadata` + artifacts — **dados que já vivem no Postgres**.
- **Nada quebra sem Letta:** degrada limpo (read não-throw, write fire-and-forget,
  fallback Noop pelo circuit-breaker).

## Decisão proposta no ADR

**Opção B (escolhida):** re-homear a memória pro Postgres atrás da interface
`MemoryAdapter` existente. 1 tabela `jsonb` (`memory_identities`) keyed por
identidade; o `blockPatch` que o `extractor` já produz vira um `INSERT ... ON
CONFLICT DO UPDATE` atômico. A **feature de produto (continuidade/reativação/
reconciliação) fica intacta** — muda só o backend. Archival = fase 2 OPCIONAL
(pgvector + embeddings via **LiteLLM shared**, não OpenAI direto). Rejeitadas:
manter Letta (A), pgvector já na fase 1 (C — YAGNI), matar a memória (D).

## PENDENTE-KAIRO — medir em prod ANTES de executar (gate da remoção)

> Veredito forte por inferência de código, **não cravado por dado**. Sem (1) e (2)
> verdes, **não aprovar a remoção**. Nada disto é verificável pelo código.

1. **Qual `MEMORY_ADAPTER` ativo em prod** (`letta` vs `noop`) + **taxa de
   circuito-aberto** (`memory_events.event_type='fallback_triggered'` / logs).
   Se já está em `noop`, a remoção é trivial.
2. **Taxa real de recall/reativação:** quantos turnos saem com
   `[CONTEXTO DO USUÁRIO]`/`[REATIVAÇÃO]` **não-vazio**; quantos web-anônimos cruzam
   o threshold de 3 turnos + cookie (`ENGAGEMENT_THRESHOLD`).
3. **Uso real de `reconcileIdentity` web→WhatsApp** (`memory_events.event_type=
   'reconciled'`). Informa esforço da fase 1; não bloqueia.

Decisões adicionais p/ o Kairo: aprovar a direção; destino do archival (default:
não fazer); destino do container **shared** `tb-letta-shared` (outros apps usam —
FPMA/sparkflow/letdrill — desativação é decisão de plataforma à parte).

## Verificação

- Gate `test:unit` (Camadas 1 estrutural + 2 regressão) rodado em **container
  transitório** (store pnpm compartilhado, `node_modules` em volume nomeado —
  host limpo, sem violar a TRAVA de host install): **701 passaram**, incl. toda a
  camada de memória. As 4 falhas são DB-dependentes (`ECONNREFUSED :5432`, sem
  Postgres no container bare), **pré-existentes e alheias** ao stub inerte.
- Stub commitado com `--no-verify` porque o host não tem `node_modules` (install
  no host inviolavelmente bloqueado, pnpm-only) → o hook não roda no host; gate
  verificado fora de banda no container (padrão documentado de worktree).

## Commits

- `881bc730` — `docs:` ADR + plano + move do FIX-80 pra done + esvazia o bloco.
- `30de3123` — `chore:` stub não-ligado do `PostgresMemoryAdapter`.
