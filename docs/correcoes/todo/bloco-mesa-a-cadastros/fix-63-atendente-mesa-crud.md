---
id: FIX-63
titulo: "Atendente de mesa — cadastro simples (nome + whatsapp)"
status: todo
bloco: bloco-mesa-a-cadastros
arquivos:
  - src/app/admin/(dashboard)/atendentes-mesa/
  - src/app/api/admin/mesa-attendants/
  - src/lib/validations/mesa.ts
  - src/components/admin/mesa-attendants/
  - src/components/admin/app-sidebar.tsx
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-63 — Atendente de mesa (cadastro simples)

**Spec:** `docs/visao/mesa-de-operacao.md` §3.3 + §2 (distinção do atendente-com-login). DEC-A:
entidade nova simples, SEM login.

## O quê × onde
- Tabela `mesa_attendants` (JÁ no schema): nome, whatsapp (E.164, unique), isActive.
- CRUD `/admin/atendentes-mesa`: só nome + whatsapp + ativo. **SEM** login/convite/email
  (≠ `/admin/attendants`). Guard `requireRole("admin")`. Item na sidebar.
- whatsapp normalizado E.164 (reuse `normalizePhoneBR` / normalizador existente do projeto).

## Regressão
- Camada 1: Zod (whatsapp E.164 válido, nome obrigatório, whatsapp único).
- Integration-db: CRUD com valor no DB; whatsapp duplicado rejeitado.

## ⚠️ Não confundir
`mesa_attendants` (esta) ≠ `user role=attendant` (handoff de conversa, já existe). São papéis
distintos — ver vocabulário na spec §2.
