---
bloco: bloco-mesa-transbordo-auto
branch: feat/mesa-transbordo-auto
workspace: feat-mesa-transbordo-auto
project: tb-aja-agora
onda: 1
depends_on: []
paralelo_com: [bloco-whatsapp-funil-paridade, bloco-entrada-welcome-upload]
itens: [FIX-123, FIX-124, FIX-125, FIX-126]
escopo_arquivos:
  - src/lib/mesa/handoff.ts
  - src/lib/whatsapp/mesa/outbound.ts
  - src/lib/whatsapp/mesa/routing.ts
  - src/app/api/admin/leads/[id]/transbordo/route.ts
  - src/components/admin/pipeline/mesa-transbordo-dialog.tsx
  - src/db/schema.ts
  - src/lib/workers/proposal-status-poll.ts
---
# Bloco — Transbordo auto-broadcast + claim (FEATURE NOVA da mesa, auditoria 2026-07-01)

A jornada canônica (Parte 2, EDIÇÃO #6) pede que o transbordo deixe de ser manual: ao o
lead entrar na fase, o sistema transborda automaticamente, faz **broadcast** a todos os
atendentes com botão "Vou atender", e o **primeiro que clica ASSUME** (claim/lock). Hoje
é 100% manual (botão single-select, `transbordo/route.ts` FIX-64).

> **Reaproveitar o padrão que JÁ existe:** o handoff de CHAT de vendas em `src/lib/whatsapp/proxy.ts`
> já faz broadcast (`handoffToAgents` notifica todos) + claim atômico (primeiro a responder
> assume via `handedOffUserId`). A mesa deve reusar essa mecânica, não reinventar.

## Ordem interna (há dependência de dados entre os itens → ordem importa)
1. **FIX-125** (D16) — PRIMEIRO: `mesa_attendant_id` nullable (migration Drizzle) + claim atômico
   (`UPDATE ... WHERE mesa_attendant_id IS NULL`). É a base do estado "sem dono". ⚠️ Migration
   roda no ambiente (container), nunca na mão — regra de migrations.
2. **FIX-123** (D14) — acoplar a transição de raia (worker `proposal-status-poll.ts` FIX-44 já
   mapeia status Bevi→raia) ao disparo do transbordo automático.
3. **FIX-124** (D15) — broadcast: iterar `getMesaAttendantList` (routing.ts:32, já existe) e enviar
   o dossiê a TODOS com botão interativo "Vou atender" (não texto plano).
4. **FIX-126** (D17) — ao assumir (claim), mover a raia. ⚠️ decidir se "em atendimento" é raia nova
   no `leadStageEnum` (schema.ts:38-48) ou alias de `na_administradora` — DECISÃO DE DESIGN, perguntar.

Bloco GRANDE de produto (feature nova) → fica sozinho. Disjunto dos outros 2 blocos.
Cross-ref: memória `project_transbordo_kanban_contrato_shape` (testar contrato de shape API↔dialog).
