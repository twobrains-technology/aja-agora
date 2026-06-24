---
id: FIX-41
titulo: "Entidade contacts (cliente unificado) + FKs contactId + índices"
status: done
commit: 2d45bcd
executado_em: 2026-06-14
bloco: bloco-a-identidade-contatos
arquivos:
  - src/db/schema.ts
  - src/db/migrations/*
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-41 — Entidade `contacts` (cliente unificado)

## Palavras do operador

> *"além do telefone temos também o CPF."* · *"eu preciso do CPF, não tem
> problema estar raw por hora."* · (F1) *"adicionar uma visão de todos os
> contatos que ele fez, seja por whatsapp ou web."*

## Cenário / problema

Hoje **não existe entidade cliente**. `leads` é 1:1 com `conversation`
(`schema.ts:201-218`), sem índice em `phone`/`email`. O mesmo cliente que fala
por web e depois por WhatsApp vira **dois leads separados** no kanban. Só o Letta
unifica (memória, por identidade) — o admin e o banco veem silos. O CPF existe
mas cifrado dentro de `conversations.metadata.identityEnc`
(`conversation/identity.ts:64-108`), **não pesquisável**.

## Root cause investigado (provado no código)

- `schema.ts:201-218` — `leads` referencia só `conversationId`; nenhuma entidade
  agrega múltiplas conversas do mesmo cliente.
- `schema.ts:146-164` — `conversations` tem `waId` (telefone WhatsApp) mas nada
  liga uma conversa web à identidade real até a reconciliação Letta.
- `schema.ts:239-276` — `bevi_proposals` tem `conversationId` + `leadId`
  (opcional), sem ponteiro direto pro cliente.
- Não há índice pesquisável por telefone nem por CPF em lugar nenhum.

## Correção proposta

| O quê | Onde |
|---|---|
| Tabela `contacts` (id, phone, cpf, email, name, timestamps) — todos os identificadores nullable, índice em phone/cpf/email; invariante: ≥1 identificador presente | `schema.ts` |
| `conversations.contactId` uuid FK → contacts (nullable até resolver) | `schema.ts` |
| `leads.contactId` uuid FK → contacts | `schema.ts` |
| `bevi_proposals.contactId` uuid FK → contacts (denormaliza p/ consulta direta por telefone/CPF) | `schema.ts` |
| Índices: `contacts_phone_idx`, `contacts_cpf_idx`, `contacts_email_idx`, e `leads_phone_idx` (consulta legada) | `schema.ts` |
| Migração gerada via drizzle-kit (aplicada pelo container, não na mão) | `src/db/migrations/` |

### CPF raw — dívida técnica `DES-CPF-RAW`

`contacts.cpf` é **texto puro por hora** (decisão Kairo). Anotar `// DES-CPF-RAW:
endurecer pós-piloto (HMAC determinístico ou cifra+hash pesquisável)` na coluna.
Mitigações que entram já: a coluna nunca é logada, nunca vai pro prompt do LLM,
e a UI admin a exibe mascarada por padrão.

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural, obrigatória):** teste em `src/db/schema.contacts.test.ts`
  — asserta que `contacts` existe com colunas/índices esperados; que
  `conversations`/`leads`/`bevi_proposals` têm `contactId`; que o invariante
  ≥1-identificador está documentado. Ver falhar antes (tabela não existe).
- **Camada 2 (cassette):** dispensada — não toca comportamento do agente.
- Migração validada contra DB real no FIX-42 (integration).
