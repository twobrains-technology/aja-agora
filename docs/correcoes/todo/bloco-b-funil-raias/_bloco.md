---
bloco: bloco-b-funil-raias
branch: feat/funil-acionavel
workspace: feat-funil-acionavel
onda: 2
depends_on: [bloco-a-identidade-contatos]
paralelo_com: [bloco-c-retorno-web]
itens: [FIX-43, FIX-44, FIX-45]
escopo_arquivos:
  - src/db/schema.ts                              # enum lead_stage (regra de migração)
  - src/lib/admin/lead-stages.ts
  - src/lib/admin/lead-transitions.ts
  - src/lib/admin/lead-stage-tracker.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/whatsapp/proxy.ts
  - src/lib/bevi/proposal-repo.ts
  - src/lib/bevi/fulfillment.ts
  - src/app/api/admin/leads/[id]/stage/route.ts
  - src/app/api/admin/contacts/*                  # novo (visão consolidada)
  - src/components/admin/pipeline/*
conflitos_esperados:
  - "schema.ts: bloco-a adiciona tabela contacts/FKs; aqui mexe no enum lead_stage. Regiões diferentes do MESMO arquivo — merge mecânico. Mergear A primeiro (já é onda 1)."
---

# Bloco B — Funil acionável (raias + automação + visão de contato)

**Feature 1.** Redesenha as raias como máquina de estados forward-only movida por
eventos, fecha os buracos de automação (`proposta_enviada`/`fechado_ganho` hoje
manuais) e troca o `lead-detail` (uma conversa) pela **visão consolidada do
contato** (timeline web+WhatsApp + propostas + simulações + histórico de raia).

> **Gate de aval:** só lançar após o Kairo aprovar a Parte 2 (raias) e a Parte 3
> da `proposta-funil-contatos-retorno.md`, e definir o N de dias de inatividade
> pra `Perdido`.

## Depende de bloco-a (mergeado)

Usa `contacts.contactId` e `resolveContact()` (FIX-45 lê o contato inteiro). Por
isso onda 2. Os itens de raias/automação (FIX-43/44) quase não tocam contacts —
mas compartilham `schema.ts` e a migração com A, então esperam A pra evitar
migração concorrente.

## Ordem interna

1. **FIX-43** — raias (enum) + máquina forward-only. (base)
2. **FIX-44** — automação das transições faltantes + bloqueio de regressão. (comportamento)
3. **FIX-45** — visão consolidada do contato no admin. (UI, usa contacts)

## Prompt de lançamento (colar no Superset)

> Leia `docs/correcoes/README.md` e `docs/jornada/proposta-funil-contatos-retorno.md`
> (Partes 2 e 3) e execute `docs/correcoes/todo/bloco-b-funil-raias/` na ordem
> FIX-43 → FIX-44 → FIX-45. **Pré-requisito:** bloco-a (contacts) mergeado no
> develop — rebaseie em cima. TDD strict. Mudança de enum `lead_stage` = migração
> no container via `migrate-guard` (nunca na mão). 1 commit `test+feat:` por item;
> mover pra `done/` ao concluir. Regressão: Camada 1 obrigatória (raias no enum,
> mapa tool→raia, forward-only no transition). **Camada 2 (cassette) obrigatória
> no FIX-44** — a automação reage a tools do agente (`simulate_quota`,
> `recommend_groups`, criação de proposta), então cassette determinístico em
> `tests/regression/agent-trajectory.test.ts` provando que a tool dispara a raia
> certa. Integration pro `transitionLeadStage` e pra rota de stage (DB real).
