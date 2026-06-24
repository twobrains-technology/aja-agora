---
id: FIX-64
titulo: "Botão de transbordo no kanban + registro do handoff"
status: done
executado_em: 2026-06-21
bloco: bloco-mesa-b-transbordo
arquivos:
  - src/components/admin/pipeline/lead-detail-panel.tsx
  - src/components/admin/pipeline/mesa-transbordo-dialog.tsx
  - src/app/api/admin/leads/[id]/transbordo/
  - src/lib/mesa/handoff.ts
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-64 — Botão de transbordo no kanban

**Spec:** `docs/visao/mesa-de-operacao.md` §4 + DEC-B (gatilho manual).

## O quê × onde
- `lead-detail-panel.tsx`: ação "Transbordar para a mesa" → dialog que lista `mesa_attendants`
  ativos e escolhe um.
- `POST /api/admin/leads/[id]/transbordo` (guard admin): cria `mesa_handoffs` (leadId,
  conversationId, beviProposalId, mesaAttendantId, administradoraId resolvida da proposta,
  status='aberto', createdBy). Lógica em `src/lib/mesa/handoff.ts`.

## Regressão
- Integration-db: POST → linha em `mesa_handoffs` com FKs certos (assert de valor).
- Camada 1: guard `requireRole("admin")` presente; administradora resolvida pela proposta.
