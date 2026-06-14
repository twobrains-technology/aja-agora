---
bloco: bloco-a-identidade-contatos
branch: feat/identidade-contatos
workspace: feat-identidade-contatos
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-41, FIX-42]
escopo_arquivos:
  - src/db/schema.ts
  - src/db/migrations/*
  - src/lib/contacts/*            # novo módulo (resolveContact)
  - src/lib/leads/phone.ts
  - src/lib/conversation/identity.ts
  - src/lib/leads/contact-capture.ts
  - src/lib/whatsapp/session.ts
  - src/lib/agent/orchestrator/lead-collection.ts
  - scripts/migrate-guard.mjs     # backfill roda no container
---

# Bloco A — Identidade unificada (entidade `contacts`)

**Fundação compartilhada das duas features.** Cria o conceito de CLIENTE
(`contacts`) resolvido por telefone + CPF + e-mail, religa conversas/leads/
propostas a ele, e expõe `resolveContact()`. Sem isso, nem o funil consolidado
(bloco B) nem a recuperação por telefone/CPF (bloco C) existem.

> **Gate de aval:** só lançar depois que o Kairo aprovar
> `docs/jornada/proposta-funil-contatos-retorno.md` (Parte 1).

## Por que é onda 1 (serializa antes de B e C)

Nível 4 (dependência estrutural dura). A e B e C **todos** editam `schema.ts` e
geram migração. Se rodassem em paralelo, seriam 3 migrações concorrentes sobre o
mesmo schema + colunas `contactId` inexistentes pros consumidores → conflito
estrutural, não mecânico. A entrega a tabela + FKs + `resolveContact` **mergeado**;
B e C consomem em cima, em paralelo. Stub não resolve: não dá pra "stubar" uma
coluna de banco que a migração real precisa criar.

## Ordem interna

1. **FIX-41** — schema: tabela `contacts`, FKs `contactId`, índices. (estrutura)
2. **FIX-42** — migração/backfill + `resolveContact()` + religar pontos de captura. (comportamento)

## Decisão registrada — CPF raw

`contacts.cpf` em texto puro, índice direto (decisão Kairo 2026-06-14: *"preciso
do CPF, não tem problema estar raw por hora"*). Dívida técnica `DES-CPF-RAW`
anotada no FIX-41 — endurecer pós-piloto. Mitigações que entram já: nunca logar
CPF, nunca no prompt do LLM, mascarar na UI por padrão.

## Prompt de lançamento (colar no Superset)

> Leia `docs/correcoes/README.md`, `docs/jornada/proposta-funil-contatos-retorno.md`
> (Parte 1) e execute o bloco `docs/correcoes/todo/bloco-a-identidade-contatos/`
> na ordem FIX-41 → FIX-42. TDD strict (teste falha primeiro, ver falhar, então
> implementar). Migração roda no container via `migrate-guard` — NUNCA na mão
> contra o banco. CPF raw por hora (decisão do Kairo) — mas nunca logar nem
> injetar no prompt do LLM. 1 commit `test+feat:` por item. Ao concluir cada
> item, mover o arquivo pra `docs/correcoes/done/` com `status: done`, `commit:`
> e `executado_em:`. Regressão: Camada 1 (structural) obrigatória; integration
> test pro backfill e pro `resolveContact` (toca DB real). Cassette (Camada 2) só
> se tocar comportamento do agente — aqui não toca, então dispensado.
