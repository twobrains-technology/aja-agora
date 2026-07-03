# Spec — Visibilidade do responsável + reatribuição + encerramento do atendimento de mesa

> 2026-07-03 · Kairo (verbal) + Claude · Status: **draft** (aguardando revisão do Kairo)
> Relacionados: [`../../referencia/mesa-de-operacao-fluxo.md`](../../referencia/mesa-de-operacao-fluxo.md) (fluxo as-built) ·
> [`../../visao/mesa-de-operacao.md`](../../visao/mesa-de-operacao.md) (visão).

## Contexto e problema

Hoje, depois que um caso é transbordado e um atendente dá **claim** ("Vou atender"), o front
**não mostra quem assumiu**: nem o `GET /api/admin/leads` (kanban) nem o `GET /api/admin/contacts/[id]`
juntam o handoff/atendente. O admin não tem como saber quem é o responsável por um cliente.

E quando o admin tenta transbordar um caso já assumido, o dialog dá um **409 seco** ("Este lead já tem
um transbordo ativo na mesa") — beco sem saída: não diz quem tem, não deixa **reatribuir** a outro
atendente, e não deixa **encerrar**. No código, `src/lib/mesa/handoff.ts` só tem `createMesaHandoff` +
`claimMesaHandoff` — **não existe** reatribuir, cancelar nem concluir um mesa handoff (o `closeHandoff`
de `whatsapp/proxy.ts` é do handoff de *chat de vendas*, outro conceito). Consequência colateral: um
mesa handoff, uma vez em `em_andamento`, **nunca fecha** (os status `concluido`/`cancelado` do enum
não são setados por ninguém).

## Norte (objetivo + critérios de sucesso verificáveis)

Dar ao admin **visibilidade e controle** sobre quem atende cada caso na mesa. Pronto quando:

1. **Visibilidade:** o card do kanban e o painel de detalhe mostram o **atendente responsável** (nome)
   de qualquer lead com handoff ativo; lead sem dono ainda (broadcast em aberto) mostra "aguardando mesa".
2. **Reatribuição:** o admin consegue **reatribuir** um caso já assumido a **um atendente específico**
   (dropdown de atendentes ativos); o dono muda no DB, o **antigo é notificado** que saiu e o **novo é
   notificado** com o dossiê do caso.
3. **Encerramento:** o admin consegue **encerrar** um atendimento — o handoff vai pra `concluido`
   (`closed_at` setado), o atendente é notificado, e o caso some das ações de "em atendimento".
4. Cada ação tem regressão (estrutural + componente + E2E route-level) verde.

## Abordagens consideradas (redistribuição)

| Abordagem | Trade-off | Veredito |
|---|---|---|
| **A. Re-broadcast à mesa** | Reseta dono→null, volta pra `aberto`, re-broadcasta; 1º a clicar reassume. Reusa 100% o claim; zero UI nova. Mas não-determinístico (o mesmo pode re-pegar). | ❌ descartada pelo Kairo |
| **B. Reatribuir a específico** *(escolhida)* | Admin escolhe o destino num dropdown; dono vira ele direto; notifica antigo + novo. Determinístico; exige seletor + endpoint próprio (não usa broadcast). | ✅ **escolhida** (2026-07-03) |
| **C. Ambos** | Cobre tudo, mas amplia UI/backend — menos "mínimo viável". | ❌ fora do MVP |

## Design

### Modelo de dados (sem migration no MVP)

`mesa_handoffs` já basta: `mesa_attendant_id` (dono), `status` (`aberto`/`em_andamento`/`concluido`/
`cancelado`), `closed_at`. As ações são `UPDATE`s:
- **Reatribuir:** `SET mesa_attendant_id = <novo>` (status permanece `em_andamento`; se estava `aberto`,
  vira `em_andamento` e o lead vai pra `em_atendimento`, reusando a transição do claim).
- **Encerrar:** `SET status = 'concluido', closed_at = now()`.

"Responsável desde ~" no MVP deriva de `updated_at` (aproximado). **Refinamento opcional (fora do MVP):**
coluna `claimed_at` pra timestamp preciso do claim.

### Endpoints

1. **Visibilidade (estender os 2 GET existentes):** `GET /api/admin/leads` e
   `GET /api/admin/contacts/[id]` passam a incluir, via `LEFT JOIN` do handoff ativo
   (`status ∈ {aberto, em_andamento}`) + `mesa_attendants`:
   ```
   activeHandoff: { id, status, attendant: { id, nome, whatsapp } | null, since } | null
   ```
   `attendant = null` enquanto o handoff está `aberto` (broadcast sem dono).
2. **Reatribuir:** `POST /api/admin/mesa/handoffs/[id]/reassign`, body `{ mesaAttendantId }`.
   Guard `requireRole("admin")`. Valida atendente ativo; `UPDATE` do dono (guardado por
   `status ∈ {aberto, em_andamento}`); se estava `aberto` → também claima (lead → `em_atendimento`).
   Notifica antigo (se havia) e novo. Erros: 404 handoff/atendente, 409 handoff já encerrado,
   400 reatribuir pro mesmo dono.
3. **Encerrar:** `POST /api/admin/mesa/handoffs/[id]/close`, body `{}`. Guard admin.
   `UPDATE status='concluido', closed_at=now()` (guardado por status ativo). Notifica o dono. Erros:
   404, 409 já encerrado. (O lead **não** muda de raia aqui — quem move é o fluxo de negócio; fora do MVP.)

O dropdown de reatribuição reusa `GET /api/admin/mesa-attendants`.

### UI — 3 pontos (onde vai nas telas)

**1. Card do kanban** (`src/components/admin/pipeline/lead-card.tsx`): selo do responsável quando há
handoff ativo (usa `activeHandoff` do payload).
```
┌───────────────────────────┐
│ Kairo                 [WA] │
│ 💰 R$ 200.000  · 🕐 há 2h  │
│ 🎧 Ana   (ou ⏳ aguardando mesa, se aberto) │
└───────────────────────────┘
```

**2. Painel de detalhe — bloco "Responsável pela mesa"** na aba **Atendimento** (compartilhado por
`ContactDetailPanel` e `LeadDetailPanel` — provável novo componente `MesaResponsavel`):
```
Atendimento
┌ Responsável pela mesa ────────────────────┐
│ 🎧 Ana Souza · +55 62 9xxxx-xxxx           │
│ responsável desde ~2h · em atendimento     │
│ Reatribuir para: [ Bruno            ▾ ]    │
│ [ Reatribuir ]              [ Encerrar ✓ ] │
└────────────────────────────────────────────┘
Chat com o cliente (ClientChatBox) ...
```

**3. Dialog de transbordo** (`mesa-transbordo-dialog.tsx`) quando já há dono — substitui o 409 seco:
```
Transbordar para a mesa                       ✕
────────────────────────────────────────────────
⚠ Este caso já está EM ATENDIMENTO.
🎧 Responsável: Ana Souza — desde ~2h

Reatribuir para: [ Selecione um atendente  ▾ ]
             [ Cancelar ]        [ Reatribuir ]
```

### Notificações (WhatsApp, via camada já existente)

- **Reatribuir** → antigo dono: "O caso de <cliente> foi reatribuído; você não está mais responsável."
  · novo dono: dossiê do caso (mesmo payload do broadcast, minimizando PII) + "Você foi designado para
  <cliente>."
- **Encerrar** → dono: "O atendimento de <cliente> foi encerrado."

### Erros / edge cases

- Reatribuir pro mesmo dono → 400 (no-op).
- Reatribuir/encerrar handoff já `concluido`/`cancelado` → 409.
- Handoff `aberto` (broadcast, sem dono): reatribuir = atribuição direta (claima); encerrar = cancela o
  broadcast (status `cancelado`).
- Concorrência: `UPDATE` guardado por `status` (mesma técnica do claim atômico).

### Testes (não-agêntico → sem cassette)

- **Camada 1 estrutural:** os 2 GET incluem `activeHandoff`; as rotas `reassign`/`close` existem e
  passam por `requireRole("admin")`.
- **Componente (render):** o bloco `MesaResponsavel` mostra nome + dropdown + botões; o dialog mostra o
  dono e o seletor quando há handoff ativo.
- **E2E route-level (integration, DB real, WhatsApp mockado):** estende
  `src/lib/mesa/mesa-flow.e2e.integration.test.ts` — reatribuir muda dono + notifica antigo/novo;
  encerrar seta `concluido`+`closed_at`; o payload de visibilidade traz o atendente.

## Decisões de design (→ docs/decisoes/)

- **Redistribuir = reatribuir a específico** (não re-broadcast) — Kairo, 2026-07-03.
- **MVP inclui encerrar** (fecha o gap do handoff que nunca termina) — Kairo, 2026-07-03.
- **Sem migration** — reusa colunas existentes; `claimed_at` preciso fica pra depois.

## Riscos e gaps honestos

- **PII pro novo atendente:** reatribuir manda dossiê do cliente pro WhatsApp do novo — mesmo cuidado
  (minimização) do broadcast; guard-rail já existente.
- **"desde ~" aproximado** (usa `updated_at`) até existir `claimed_at`.
- **Encerrar não move a raia do lead** — decisão de negócio (o que acontece com o lead ao encerrar o
  atendimento?) fica pra validar com o Kairo; MVP só fecha o handoff.

## Fora de escopo (YAGNI)

Re-broadcast; distinção fina concluído×cancelado com motivo; histórico/auditoria de reatribuições;
SLA/timeout de atendimento inativo; `claimed_at` preciso; mover a raia do lead no encerramento.
