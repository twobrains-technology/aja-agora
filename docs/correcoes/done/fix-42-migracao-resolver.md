---
id: FIX-42
titulo: "Backfill de contacts + resolveContact() + religar pontos de captura"
status: done
commit: fa62081
executado_em: 2026-06-14
bloco: bloco-a-identidade-contatos
arquivos:
  - src/lib/contacts/resolve.ts        # novo
  - src/lib/contacts/index.ts          # novo
  - src/lib/leads/contact-capture.ts
  - src/lib/whatsapp/session.ts
  - src/lib/agent/orchestrator/lead-collection.ts
  - src/lib/conversation/identity.ts
  - scripts/migrate-guard.mjs
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-42 — Backfill + `resolveContact()` + religar captura

## Palavras do operador

> (F2) *"precisa ter uma forma de buscar, com base no telefone do usuário talvez,
> as propostas dele e tudo que ele já fez."*

## Cenário / problema

Criada a tabela (FIX-41), ela nasce vazia e ninguém a popula. Os dados de
cliente existentes (leads, conversas, CPF cifrado) precisam ser **consolidados**
por cliente real, e os pontos de captura precisam passar a alimentar `contacts`
daqui pra frente. Sem isso, a consulta por telefone/CPF (bloco C) e a visão
consolidada (bloco B) não têm de onde ler.

## Root cause investigado (provado no código)

- Pontos de captura existentes, hoje sem entidade cliente:
  - `contact-capture.ts:72-157` — `saveContactName` / `saveContactWhatsapp`.
  - `whatsapp/session.ts:21-66` — `getOrCreateConversation(waId)` cria lead solto.
  - `lead-collection.ts:183-195` — captura web (form) dispara reconciliação Letta.
  - gate identify — `storeIdentity()` cifra CPF+celular em `conversations.metadata`.
- `normalizePhoneBR()` em `src/lib/leads/phone.ts:8-16` — canônico pra dedup.
- CPF cifrado é determinístico (`identity.ts:64-76`) — decifrável no backfill
  com `IDENTITY_ENC_KEY` pra popular `contacts.cpf` raw.

## Correção proposta

| O quê | Onde |
|---|---|
| `resolveContact({ phone?, cpf?, email?, name? })` — find-or-create com MERGE quando identificadores apontam pro mesmo cliente (telefone existia + chega CPF → consolida no mesmo id) | `src/lib/contacts/resolve.ts` (novo) |
| Religar pontos de captura: cada captura de telefone/CPF/e-mail chama `resolveContact` e grava `contactId` na conversa/lead | contact-capture, session, lead-collection, identity |
| Backfill idempotente: agrupa leads/conversas por telefone normalizado; decifra `identityEnc`→`contacts.cpf` raw; cria 1 contato por cliente; religa FKs. Leads anônimos ficam sem contactId | `scripts/migrate-guard.mjs` (roda no container) |

## Regras invioláveis

- **Migração só no container** (CLAUDE.md) — backfill via `migrate-guard`, nunca
  `drizzle-kit push` nem psql na mão.
- CPF decifrado no backfill **nunca é logado**.
- Backfill **idempotente** (re-rodável sem duplicar contatos).

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural):** unit de `resolveContact` (find-or-create, merge de
  identificadores, normalização de telefone). Função quase-pura → unit cabe.
- **Integration (obrigatória, toca DB real):** em `tests/integration/` — semeia
  leads duplicados (mesmo telefone, web + WhatsApp) + 1 com CPF cifrado, roda o
  backfill, asserta: 1 contato criado, FKs religadas, CPF raw populado,
  idempotência (rodar 2× = mesmo resultado). Ver falhar antes do backfill existir.
- **Camada 2 (cassette):** dispensada — não toca comportamento do agente.
