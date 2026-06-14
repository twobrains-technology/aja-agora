---
id: FIX-45
titulo: "Visão consolidada do contato (timeline web+whatsapp + propostas + histórico de raia)"
status: todo
bloco: bloco-b-funil-raias
arquivos:
  - src/app/api/admin/contacts/[id]/route.ts          # novo
  - src/app/api/admin/leads/route.ts                  # dedup por contato no kanban
  - src/components/admin/pipeline/contact-detail-panel.tsx  # novo (substitui lead-detail)
  - src/components/admin/pipeline/lead-card.tsx
  - src/components/admin/pipeline/conversation-timeline.tsx
  - src/components/admin/pipeline/kanban-board.tsx
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-45 — Visão consolidada do contato

## Palavras do operador

> *"que tenha todos os dados de contato do cliente de uma forma muito excelente
> dentro da plataforma — além da visão da intenção dele, adicionar uma visão de
> todos os contatos que ele fez, seja por whatsapp ou web."*

## Cenário / problema

O `lead-detail-panel` abre **uma conversa** (a do lead). Se o cliente falou por
web e WhatsApp, o admin vê dois cards e duas conversas separadas — nunca "tudo
que ele fez" num lugar. A intenção (insights LLM) já existe; falta a **visão de
todos os contatos** + propostas + histórico de movimentação.

## Root cause investigado (provado no código)

- `api/admin/leads/[id]/conversation/route.ts` — carrega `with: { conversation }`
  no **singular** (a conversa do lead), não todas as conversas do cliente.
- `api/admin/leads/route.ts:7-41` — lista leads sem dedup por telefone → mesmo
  cliente aparece 2×.
- `lead-detail-panel.tsx:36-118` — abas Conversa/Insights de UMA conversa.
- `lead_events` (`schema.ts:221-232`) — auditoria de raia **nunca exibida**.
- `bevi_proposals` (`schema.ts:239-276`) e artifacts (`schema.ts:190-198`,
  `simulation_result`/`recommendation_card`) existem mas não aparecem juntos.

## Correção proposta

| O quê | Onde |
|---|---|
| `GET /api/admin/contacts/[id]` — agrega TODAS as conversas do contato (web+WhatsApp), mensagens, propostas, simulações/recomendações, `lead_events` | novo route |
| `contact-detail-panel` — cabeçalho (nome, telefone, CPF mascarado, e-mail, canais, raia), timeline unificada cross-channel (selo de canal por msg), intenção (insights existentes), histórico do que fez (propostas/simulações), histórico de raia (`lead_events`) | novo componente |
| Kanban dedup: 1 card por **contato** (não por lead), com badge multi-canal | `api/admin/leads/route.ts`, `lead-card.tsx`, `kanban-board.tsx` |

## Depende de

bloco-a (contacts + resolveContact) **mergeado** — é a fonte da agregação.

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural):** shape do `GET /api/admin/contacts/[id]`
  (campos/seções esperados); kanban agrupa por contactId.
- **Integration (toca DB real):** semeia contato com 2 conversas (web+WhatsApp) +
  1 proposta + 2 artifacts + 3 lead_events → asserta agregação completa e
  ordenada por tempo; CPF vem mascarado por default.
- **E2E (Playwright):** abrir contact-detail no admin, ver timeline com mensagens
  dos dois canais e a seção de propostas/movimentação. Screenshot.
- **Camada 2 (cassette):** dispensada — UI/admin, não toca o agente.
