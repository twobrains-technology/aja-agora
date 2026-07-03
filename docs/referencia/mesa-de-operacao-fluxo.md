# Mesa de operação — o fluxo COMO CONSTRUÍDO (referência)

> Criado: 2026-07-02 · Tipo: guia temático de referência (as-built) · Status: **implementado e em uso**
> Fonte da verdade do **comportamento**; a visão original (o plano) vive em
> [`../visao/mesa-de-operacao.md`](../visao/mesa-de-operacao.md) e está datada ("feature ainda NÃO
> planejada"). Este doc descreve o que **realmente roda** hoje (blocos FIX-61…67, FIX-82…87,
> FIX-123…126 + a aba "Atendimento" de 2026-07-02).
> Relacionados: [`../visao/mesa-de-operacao.md`](../visao/mesa-de-operacao.md) (plano + DEC-A…E) ·
> [`../specs/attendants-crud.md`](../specs/attendants-crud.md) (atendente-COM-login — papel distinto) ·
> [`contas-teste-homologacao.md`](../integracoes/contas-teste-homologacao.md) (contas de QA).

## 1. Visão de 30 segundos

Quando um lead chega na fase **"Na administradora"** (`na_administradora`), o sistema **transborda**
o caso pra **mesa de operação**: cria um handoff **sem dono**, faz **broadcast** por WhatsApp pra
**todos** os atendentes de mesa cadastrados, e o **primeiro que clica "Vou atender"** (claim atômico)
**assume** — o caso **some** (shadow) pros outros. Um **copiloto** (agente) orienta o atendente no
WhatsApp injetando o **PDF/dossiê da administradora** da cota. O admin também pode, do **Kanban**,
transbordar manualmente e **mandar mensagem pro cliente** (aba "Atendimento").

```
lead → funil → [na_administradora]
        │  (auto) worker proposal-status-poll → dispatchAutoTransbordo
        │  (manual) Kanban → aba "Atendimento" → "Transbordar para a mesa"
        ▼
   mesa_handoffs (mesa_attendant_id = NULL)  ── broadcast "Vou atender" ──▶ TODOS atendentes
        │                                                                        │
        │◀──────────── primeiro claim (UPDATE ... WHERE mesa_attendant_id IS NULL) ┘
        ▼
   handoff em_andamento + raia → [em_atendimento]   (perdedores: "já assumido")
        │
        ▼
   COPILOTO no WhatsApp do atendente  ◀── injeta administradora_docs.texto_extraido (PDF)
```

## 2. As entidades (tabelas reais — `src/db/schema.ts`)

| Tabela | Papel |
|---|---|
| `mesa_attendants` | Atendente de operação. **Cadastro simples: nome + `whatsapp` (E.164 sem `+`, único), `is_active`. Sem login.** |
| `administradoras` | Entidade da administradora (nome/slug/`codigo_bevi`). Casa por nome/código com `beviProposals.administradora`. |
| `administradora_docs` | PDF(s) de procedimento por administradora. `texto_extraido` é injetado no copiloto. |
| `mesa_handoffs` | O caso transbordado. `mesa_attendant_id` **nullable** (NULL = sem dono, esperado). `status ∈ {aberto, em_andamento, concluido, cancelado}`. |
| `mesa_copilot_messages` | Conversa copiloto↔atendente (`role ∈ {assistant, attendant}`). |

## 3. Cadastro do atendente de mesa (CRUD) + o "Forbidden"

- **UI:** menu admin → "Atendentes de mesa" (`src/app/admin/(dashboard)/atendentes-mesa/page.tsx`,
  `src/components/admin/mesa-attendants/`). Modal "Adicionar atendente de mesa" (nome + WhatsApp com
  máscara BR).
- **API:** `POST /api/admin/mesa-attendants` (cria), `PATCH /api/admin/mesa-attendants/[id]` (edita),
  `DELETE` (remove). Cria → **201**; WhatsApp duplicado → **409**; zod inválido → **400**.
  O WhatsApp é normalizado pra E.164 sem `+` (ex.: `+55 (62) 99249-6793` → `5562992496793`, com o 9º dígito).
- **⚠️ Gotcha "Forbidden":** todas as rotas admin passam por `requireRole("admin")`
  (`src/lib/admin/require-role.ts`). Sem sessão → **401 Unauthorized**; **com** sessão mas
  `role ≠ admin` → **403 Forbidden**. O campo `user.role` tem default `"viewer"` e é `input:false`
  no better-auth (`src/lib/auth.ts`) — signup/convite **nunca** grava `admin`. Só
  `src/scripts/seed-admin.ts` (via env `ADMIN_EMAIL`/`ADMIN_PASSWORD`) promove alguém a admin.
  **Logo, `Forbidden` no cadastro = você está logado numa conta que não é admin** (ex.: um
  `attendant` convidado), **não** é bug de env/CSRF/sessão. Use a conta admin semeada.

## 4. Transbordo — automático + manual

### Automático (caminho principal — FIX-123/124/125/126)
- Worker BullMQ recorrente `startProposalStatusWorker` (`src/lib/workers/proposal-status-poll.ts`,
  default 15 min). Ao reconciliar a raia e ela **mudar** pra `na_administradora` (guardado por
  `applied` — não re-dispara), chama `dispatchAutoTransbordo(leadId)`.
- `dispatchAutoTransbordo` (`src/lib/mesa/dispatch.ts`) → `createMesaHandoff({leadId})` (sem dono) →
  `broadcastCaseToAttendants`. **Idempotente:** se já existe handoff ativo, retorna `created:false`
  sem re-broadcast.

### Manual (fallback, do Kanban)
- Botão **"Transbordar para a mesa"** → `MesaTransbordoDialog`
  (`src/components/admin/pipeline/mesa-transbordo-dialog.tsx`) → `POST /api/admin/leads/[id]/transbordo`
  (body vazio; o broadcast decide o dono). Handoff ativo já existente → **409** `handoff_ativo_existe`.
- **Onde fica o botão (corrigido 2026-07-02):** antes só existia no `LeadDetailPanel` (lead **anônimo**).
  Para lead **com contato resolvido** o Kanban abre o `ContactDetailPanel`, que não portava a ação →
  botão **inalcançável** nos leads que importam. Agora ambos os painéis expõem a ação: no
  `ContactDetailPanel` ela vive na aba **"Atendimento"** (ver §6).

## 5. Broadcast + claim atômico + shadow

- **Broadcast:** `broadcastCaseToAttendants` (`src/lib/whatsapp/mesa/outbound.ts`) manda a TODOS os
  atendentes ativos (`getMesaAttendantList()`) um dossiê **atendente-agnóstico** (minimiza PII, **sem
  CPF**) com botão interativo **"Vou atender"** cujo id é `mesa_claim:<handoffId>`.
- **Claim atômico (1 vencedor):** `claimMesaHandoff` (`src/lib/mesa/handoff.ts`) faz
  `UPDATE mesa_handoffs SET mesa_attendant_id=?, status='em_andamento' WHERE id=? AND mesa_attendant_id IS NULL`.
  Vencedor → `transitionLeadStage(leadId, "em_atendimento", ...)`. Perdedores → `rowCount=0` →
  `reason:"ja_assumido"` (shadow — some pra eles).
- **Dispatch do clique:** `handleMesaClaim` (`src/lib/whatsapp/mesa/routing.ts`) — vencedor recebe
  "✅ Você assumiu"; demais recebem "já assumido".
- **Nota sobre "409":** o 409 HTTP existe no **CRUD** (WhatsApp duplicado) e no **transbordo manual**
  (`handoff_ativo_existe`) — **não** no claim por WhatsApp (lá a corrida é resolvida no DB via `rowCount`
  e comunicada como mensagem, não status HTTP).

## 6. Mensagem atendente/operador → cliente (aba "Atendimento" do Kanban)

- **Existe desde o FIX-87**, mas até 2026-07-02 só no `LeadDetailPanel` (lead anônimo). Agora a
  visão consolidada (`ContactDetailPanel`) tem a aba **"Atendimento"** com **Transbordar** + **Chat
  com o cliente**. A caixa de chat é o componente compartilhado **`ClientChatBox`**
  (`src/components/admin/pipeline/client-chat-box.tsx`), usado pelos dois painéis. O `kanban-board.tsx`
  passa `leadId`/`leadName`/`conversationId` do card selecionado.
- **Rota:** `POST /api/admin/conversations/[id]/message`
  (`src/app/api/admin/conversations/[id]/message/route.ts`). Guard `requireRole("admin","attendant")`.
  Resolve o `waId` do cliente pela conversa. **Janela de 24h:** aberta → texto livre; fechada →
  **429 `WindowClosed`**. A mensagem é persistida como `role:"assistant"`.
- **Janela fechada → enviar template HSM ali mesmo:** ao receber o 429, o `ClientChatBox` troca pro
  **modo template** — busca os templates **APPROVED** (`GET /api/admin/whatsapp/templates`), mostra um
  seletor + preview e envia por `{templateName, languageCode}` (a rota chama `sendTemplate`). O template
  reabre a janela. Os templates são geridos em Admin → WhatsApp → Templates (FIX-199…205). Hoje o envio
  é **sem variáveis** (a rota não passa `components`) — templates com `{{n}}` precisariam de UI de
  parâmetros (evolução).
- A chave é o **id da CONVERSA** (≠ id do lead/contato) — é o que a rota usa pra janela + persistência.

## 7. Copiloto no WhatsApp do atendente

- **Roteamento por número** (`src/lib/whatsapp/processor.ts`): mensagem de um WhatsApp de atendente
  de mesa cadastrado (`isMesaAttendantPhone`, cache 60s) → **copiloto** (`handleMesaCopilot`), **antes**
  do atendente-de-chat e do cliente. Número de atendente de mesa **nunca** cai no agente de vendas.
- **Injeção do PDF:** `buildCaso` (`src/lib/whatsapp/mesa/routing.ts`) carrega
  `administradora_docs.texto_extraido` (docs ativos da administradora do caso) e o copiloto
  (`src/lib/agent/mesa-copilot/`) injeta o full-text num bloco **estável/cacheável**
  (`<manual_administradora>`) — full-text + prompt caching, **não** RAG (DEC-C).

## 8. Como validar localmente (DEV)

1. **Subir a stack do workspace** (skill `local-dev`):
   `bash ~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh` → app em
   `http://aja-<workspace>.orb.local`. Rodar migrations + seed-admin no container:
   `docker exec aja-app-<workspace> pnpm db:migrate` e `… pnpm exec tsx src/scripts/seed-admin.ts`.
2. **Login admin:** `admin@ajaagora.com.br` / `admin123` (env `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
3. **Semear a mesa:** cadastrar 1 administradora (+ PDF) e ≥2 atendentes de mesa. **Sem isso a mesa
   não é operacional** (broadcast pra lista vazia).
4. **Dirigir o relay sem Meta real — simulador:** atendentes com WhatsApp prefixado por `SIM-` recebem
   broadcast/claim/copiloto **pelo bus do simulador** (`/admin/simulator`), **sem** chamar a Meta API
   (`src/lib/whatsapp/mesa/notify.ts`). É como validar broadcast → "Vou atender" → claim → shadow →
   copiloto de ponta a ponta em DEV. (O simulador é **404 em prod** por design — ver
   [`../../CLAUDE.md`](../../CLAUDE.md) e a memória do simulador.)
5. **Testes automatizados** (lógica do fluxo, sem Meta real): `pnpm exec vitest run --no-file-parallelism
   src/lib/mesa/ src/lib/whatsapp/mesa/ src/lib/agent/mesa-copilot/ src/app/api/admin/mesa-attendants/`
   (+ os `proposal-status-poll*.test.ts`). Cobre CRUD/guard, handoff/claim/raia, auto-transbordo,
   roteamento, broadcast, copiloto.

## 9. Mapa de arquivos (âncoras)

| Área | Arquivo |
|---|---|
| Guard de role (Forbidden) | `src/lib/admin/require-role.ts` · `src/lib/auth.ts` |
| CRUD atendente | `src/app/api/admin/mesa-attendants/**` · `src/components/admin/mesa-attendants/**` |
| Handoff / claim | `src/lib/mesa/handoff.ts` · `src/lib/mesa/dispatch.ts` |
| Auto-transbordo | `src/lib/workers/proposal-status-poll.ts` · `src/lib/bevi/proposal-status.ts` |
| Broadcast / claim WA | `src/lib/whatsapp/mesa/outbound.ts` · `src/lib/whatsapp/mesa/claim.ts` · `src/lib/whatsapp/mesa/routing.ts` · `src/lib/whatsapp/mesa/notify.ts` |
| Roteamento por número | `src/lib/whatsapp/processor.ts` |
| Copiloto | `src/lib/agent/mesa-copilot/**` |
| Transbordo manual (UI) | `src/components/admin/pipeline/mesa-transbordo-dialog.tsx` · `lead-detail-panel.tsx` · `contact-detail-panel.tsx` · `kanban-board.tsx` |
| Chat operador→cliente | `src/app/api/admin/conversations/[id]/message/route.ts` |

## 10. Gaps conhecidos

- **Sem endpoint admin de cancelar/fechar handoff** por API (handoffs residuais não são removíveis via UI).
- **Prod despovoado** por default (0 administradoras/docs/atendentes → mesa não-operacional até semear).
- O `alert()` do "Chat com o cliente" é herança do FIX-87 (feedback simples) — candidato a toast.
