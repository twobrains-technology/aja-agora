Você é o executor do bloco **bloco-mesa-b-transbordo** no worktree isolado deste branch
(`feat/mesa-transbordo`). Implemente o TRANSBORDO do kanban pra um atendente de mesa.

## Contexto obrigatório (leia ANTES de codar)
1. `docs/visao/mesa-de-operacao.md` — spec de negócio (§4 o fluxo, DEC-B o gatilho). A régua.
2. `docs/correcoes/README.md` + `docs/correcoes/todo/bloco-mesa-b-transbordo/` (cards FIX-64/65).
3. `CLAUDE.md` do projeto — "Regressão de agent — 3 camadas", "pnpm ÚNICO".

## O que JÁ EXISTE (fundação — NÃO recriar)
- Schema das tabelas mesa em `src/db/schema.ts` (`mesa_handoffs`, `mesa_attendants`,
  `administradoras`, `bevi_proposals`, `leads`) + migration `0026`. JÁ aplicado.
- Kanban: `src/components/admin/pipeline/{kanban-board,lead-card,lead-detail-panel}.tsx`. O
  detalhe do lead abre em `lead-detail-panel.tsx` — é onde o botão "Transbordar para a mesa" entra.
- Envio WhatsApp: `src/lib/whatsapp/api.ts` (`sendTextMessage`). Use pra o outbound.
- A administradora do caso resolve da cota: `bevi_proposals.administradora` (varchar) → casa com a
  entidade `administradoras` (por nome/código). O `mesa_handoffs.administradora_id` guarda o match.

## Itens (ordem)
### FIX-64 — Botão de transbordo no kanban + registro do handoff
- No `lead-detail-panel.tsx`: ação "Transbordar para a mesa" (dialog
  `mesa-transbordo-dialog.tsx`) que lista os `mesa_attendants` ativos e deixa escolher um.
- API `POST /api/admin/leads/[id]/transbordo` (guard `requireRole("admin")`): cria linha em
  `mesa_handoffs` (leadId, conversationId, beviProposalId da cota escolhida, mesaAttendantId,
  administradoraId resolvida, status='aberto', createdBy=admin). Lógica em `src/lib/mesa/handoff.ts`.
- DEC-B: gatilho é **manual** (botão). Auto-transbordo por estágio NÃO entra agora.

### FIX-65 — Outbound: dossiê + orientação pro WhatsApp do atendente
- `src/lib/whatsapp/mesa/outbound.ts`: `sendCaseToAttendant(handoff)` monta o dossiê do caso
  (nome do cliente, contato, cota escolhida: grupo/carta/parcela/administradora, link da proposta
  Bevi) e envia ao `whatsapp` do atendente via `sendTextMessage`.
- **Minimização de PII** (spec §8): manda só o necessário pra contratar. NÃO injetar CPF cru.
- Persistir a 1ª mensagem do copiloto em `mesa_copilot_messages` (role='assistant') já é do bloco C
  — aqui só dispare o outbound do dossiê; deixe um `TODO(bloco-c):` se precisar do gancho do copiloto.

## DESIGN (passo 2 — decida sozinho, NÃO trave)
Decisões reais: o que vai no dossiê (campos), formato da mensagem, idempotência (transbordar 2×?).
Use o raciocínio do `superpowers:brainstorming` mas **você decide** (recomendada). Registre em
`docs/correcoes/decisions/2026-06-21-bloco-mesa-b.md`, commit `docs:`. NÃO pergunte, NÃO trave.

## Regressão exigida (CLAUDE.md)
- Camada 1 (structural): a API existe com guard `requireRole("admin")`; `handoff.ts` resolve a
  administradora pela proposta; o dossiê NÃO contém CPF cru.
- Integration-db: POST transbordo → linha em `mesa_handoffs` com os FKs certos (assert de valor);
  outbound chama `sendTextMessage` com o número do atendente (mock só a fronteira da Meta API).
- E2E (golden path, opcional se couber): admin abre lead no kanban → transborda → assert do registro.

## Entrega
- TDD strict; 1 commit Conventional (PT-BR) por item. Mover cards pra `done/`.
- `pnpm test:unit` verde ANTES de finalizar (rode no container do workspace via `local-dev`).
- RESUMO FINAL com as decisões de design.

## ⛔ LINHA VERMELHA (inviolável)
Implementa, commita e **push da branch** (`git push origin feat/mesa-transbordo`). **NÃO** abra PR,
**NÃO** merge, **NÃO** deploy/restart de prod. Integração é do orquestrador.
