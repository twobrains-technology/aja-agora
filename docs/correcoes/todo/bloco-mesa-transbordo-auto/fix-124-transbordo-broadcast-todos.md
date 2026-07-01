---
id: FIX-124
titulo: "Transbordo: broadcast a TODOS os atendentes com botão 'Vou atender'"
status: todo
severidade: alta
bloco: bloco-mesa-transbordo-auto
depends_on: [FIX-125]
arquivos: [src/lib/whatsapp/mesa/outbound.ts, src/lib/whatsapp/mesa/routing.ts, src/components/admin/pipeline/mesa-transbordo-dialog.tsx]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---
# FIX-124 — Transbordo: broadcast a TODOS com botão "Vou atender"

## Origem (auditoria D15 — voz do operador)

Divergência **D15** do Mapa da auditoria código×jornada (2026-07-01), fonte
`docs/jornada/jornada-canonica.md` (Parte 2, EDIÇÃO #6). A **regra da jornada** — a
voz do operador, não inspiração — diz:

> No transbordo, o caso é enviado a **TODOS os atendentes de mesa** (broadcast) no
> WhatsApp deles, cada um com um **botão interativo "Vou atender"**; o **primeiro que
> clica ASSUME** o caso (claim/lock). Não é o admin quem escolhe um atendente único.

Divergência código×jornada = defeito do código (regra inviolável de produto). Hoje o
transbordo é single-select manual (herança do FIX-64) e o outbound entrega o dossiê a
**um só** atendente, em **texto plano**, sem botão de assumir.

## Cenário exato (comportamento divergente hoje, com file:line)

- **Tela/rota:** `MesaTransbordoDialog` (kanban admin) → `POST /api/admin/leads/[id]/transbordo`.
- **Passo 1 — o admin escolhe UM:** `src/components/admin/pipeline/mesa-transbordo-dialog.tsx`
  usa `<Select>` single-value (`selectedId`, linhas 132-147) e envia
  `{ mesaAttendantId: selectedId }` — **um único** atendente (linha 92).
- **Passo 2 — outbound vai pra UM, texto plano:** `src/lib/whatsapp/mesa/outbound.ts:112-115`
  `sendCaseToAttendant` chama `sendTextMessage(dossier.attendantWhatsapp, text)` — 1
  destinatário, mensagem de texto, **sem** botão "Vou atender".
- **Resultado:** os demais atendentes de mesa nunca veem o caso; não há disputa/claim;
  o admin vira gargalo de roteamento manual. Diverge da jornada (broadcast + primeiro
  assume).

## Root cause (INVESTIGADO — provado no código atual)

1. **Outbound é single-cast, texto plano** — `outbound.ts:112-115`: `sendCaseToAttendant`
   recebe UM `MesaCaseDossier` e faz um único `sendTextMessage`. Não itera atendentes e
   não usa mensagem interativa.
2. **A lista de todos JÁ existe** — `src/lib/whatsapp/mesa/routing.ts:32-42`
   `getMesaAttendantList()` retorna **todos** os `mesaAttendants` ativos (cache curto). A
   peça pro broadcast já está pronta; ninguém a consome no outbound.
3. **O primitivo de botão JÁ existe** — `src/lib/whatsapp/api.ts:75-111` `sendReplyButtons(to, body, buttons)`
   envia WhatsApp interactive `type: "button"` (máx 3 botões, título ≤ 20 chars, e já
   trata o caminho simulado). É o que falta usar no lugar de `sendTextMessage`.
4. **O padrão de broadcast+claim JÁ está resolvido no chat de vendas** —
   `src/lib/whatsapp/proxy.ts:239-248` `handoffToAgents`: *"Notifies ALL active attendants
   — first to reply claims it"*. A mesa deve espelhar essa mecânica, não reinventar.
5. **Acoplamento estrutural que força dono único** — `src/db/schema.ts:672-674`:
   `mesaHandoffs.mesaAttendantId` é `notNull` FK. Enquanto o handoff exigir dono na
   criação, não há estado "sem dono" pro claim. Por isso este fix **depende de FIX-125**
   (tornar `mesa_attendant_id` nullable + claim atômico `UPDATE ... WHERE mesa_attendant_id IS NULL`).

## Correção proposta (o quê × onde)

| O quê | Onde |
|-------|------|
| Trocar o single-cast por **broadcast**: iterar `getMesaAttendantList()` e enviar o dossiê a **todos** os atendentes ativos (best-effort por destinatário — falha de um não derruba os demais) | `src/lib/whatsapp/mesa/outbound.ts` (`sendCaseToAttendant` → `broadcastCaseToAttendants`) |
| Enviar como **mensagem interativa** com botão **"Vou atender"** (`sendReplyButtons`) em vez de `sendTextMessage` — id do botão carrega o `handoffId` pra dispatch do claim (ex.: `mesa_claim:<handoffId>`) | `src/lib/whatsapp/mesa/outbound.ts` (reusa `api.ts:75` `sendReplyButtons`) |
| Reusar a lista de todos os ativos já pronta (nenhuma mudança de contrato; só garantir que o outbound a consome) | `src/lib/whatsapp/mesa/routing.ts:32-42` `getMesaAttendantList` |
| Remover o single-select do dialog: transbordar deixa de exigir escolha de atendente (o broadcast decide) — botão vira "Transbordar para a mesa" sem `<Select>`; body do POST sem `mesaAttendantId` | `src/components/admin/pipeline/mesa-transbordo-dialog.tsx` (linhas 132-147, 92) |
| **Depende de FIX-125:** o handoff nasce sem dono (`mesa_attendant_id` nullable); o dispatch do botão "Vou atender" faz o claim atômico (primeiro vence). O broadcast só é correto **sobre** esse estado "sem dono" | (fora do escopo deste card — ver `fix-125`) |

> **REGRA = paridade com o comportamento já correto.** O handoff de **chat de vendas**
> (`proxy.ts:239-248` `handoffToAgents`) já faz broadcast a todos + primeiro-a-assumir.
> A mesa de operação tem que ter **paridade** com esse fluxo — mesma mecânica de
> broadcast e claim, mudando só o canal (WhatsApp do atendente) e o payload (dossiê +
> botão "Vou atender"). Não reinventar; espelhar.

## Regressão exigida

Comportamento de WhatsApp → **3 camadas** (regra "Regressão de agent — 3 camadas
OBRIGATÓRIAS"). O núcleo (broadcast + botão + claim) é **código determinístico**, então
o gate real é structural + integration; a cassette guarda o roteamento pós-claim (o
copiloto só responde ao **dono**).

- **Camada 1 — structural** (`src/lib/whatsapp/mesa/outbound.<fix-124>.test.ts`):
  com 3 atendentes ativos mockados, o broadcast chama `sendReplyButtons` **3×** (uma por
  atendente), cada uma com um botão cujo título é `"Vou atender"` e id contém o
  `handoffId`; asserir que **não** usa `sendTextMessage` single-cast. Assert de que
  `getMesaAttendantList` é a fonte da lista.
- **Camada 2 — cassette** (`tests/regression/agent-trajectory.test.ts`, `describe("FIX-124 …")`):
  após o claim de um atendente, uma mensagem de **outro** atendente (não-dono) para o mesmo
  caso NÃO é roteada ao copiloto daquele handoff (o copiloto responde só ao dono) —
  guarda a regressão de o broadcast "vazar" o caso pra quem não assumiu. Determinístico
  via `MockLanguageModelV2` da `ai/test`.
- **Integration** (`.../transbordo/route.integration.test.ts` + dispatch do botão):
  disparo do transbordo com N atendentes ativos + API do WhatsApp mockada → `sendReplyButtons`
  chamado para **todos**; simular 2 cliques concorrentes em "Vou atender" → **exatamente
  um** claim vence (o outro recebe "caso já assumido"), espelhando o claim atômico do
  `handoffToAgents`. Cobre o contrato de shape API↔dialog (memória
  `project_transbordo_kanban_contrato_shape`).

**TDD strict:** escrever os testes primeiro, ver falhar com a assinatura certa (hoje:
1 `sendTextMessage`, 0 `sendReplyButtons`), então implementar o broadcast + claim, ver
passar. Commit único `test+fix:` com Camadas 1+2 + fix.
