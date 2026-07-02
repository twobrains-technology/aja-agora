# Spec — Gestão e envio de Message Templates (WhatsApp Meta oficial)

> 2026-07-02 · Kairo (via Claude) · Status: aprovada

## Contexto e problema

O envio de WhatsApp do aja-agora já roda na **Cloud API oficial da Meta** (Graph v21.0,
`src/lib/whatsapp/api.ts`, sem BSP). No fim da jornada de contratação, três mensagens de
confirmação são disparadas hoje como **texto livre direto** pro celular do cliente:

- `closingPresentation()` → *"Parabéns! Agora você está oficialmente mais perto da sua conquista!"*
- `sendContractSummary()` → *"Resumo da sua contratação — Aja Agora ✅"* (`src/lib/bevi/contract-summary.ts`)
- `signatureHandoffToWhatsApp()` → *"Sua proposta está pronta! 🎉"* (`src/lib/whatsapp/formatter.ts`)

**O gap:** na Cloud API oficial, fora da **janela de atendimento de 24h** (que só abre quando o
cliente manda mensagem primeiro), uma mensagem **business-initiated** só pode ser um **message
template pré-aprovado pela Meta**. Texto livre iniciado pela empresa é bloqueado. Quando a jornada
acontece na **web**, o cliente nunca abriu janela de 24h no WhatsApp — então a confirmação
cross-canal web→WhatsApp está **quebrada por design**: só "funciona por acaso" quando a jornada
inteira rolou no próprio WhatsApp (janela aberta).

Além disso, o produto precisa **cadastrar** templates, **submeter** à Meta, **acompanhar o status
até `APPROVED`** e **mapear onde cada template é usado** (ex: "confirmação de contratação"). Hoje
não existe entidade de template no schema; os status updates do webhook são apenas logados
(`src/app/api/webhook/whatsapp/route.ts`), e nenhum template Meta concreto está definido
(PENDENTE-KAIRO, ver `docs/correcoes/done/fix-85-whatsapp-send-template-hsm.md`).

**Infra que já existe (não partimos do zero):** `sendTemplate()` (`api.ts:256`), rastreio da
janela de 24h (`conversations.lastInboundAt` + `src/lib/whatsapp/window.ts`), e a rota admin do
Kanban que já exige `templateName` quando a janela está fechada
(`src/app/api/admin/conversations/[id]/message/route.ts:113`).

## Norte (objetivo + critérios de sucesso verificáveis)

Entregar o ciclo completo de templates oficiais da Meta, sem nenhuma etapa manual do operador
no runtime. Critérios binários:

1. Existe tabela `whatsappTemplates` e é possível **criar** um template (draft) e **submeter** à
   Meta via admin — a submissão bate em `POST /{WABA_ID}/message_templates` e persiste o
   `metaTemplateId` + `status=PENDING`.
2. O status do template é **atualizado automaticamente** por (a) webhook
   `message_template_status_update` e (b) poll de reconciliação — sem refresh manual.
3. Cada ponto de disparo referencia um template por **chave lógica** (`usageKey`); o vínculo
   chave→template é gerido no admin, não hardcoded.
4. Confirmação de contratação com **janela fechada**: se o template está `APPROVED`, sai como
   template; se não está aprovado, é **enfileirada** e disparada automaticamente assim que aprovar.
5. Confirmação com **janela aberta**: mantém o texto livre rico atual (sem custo de template).
6. Nenhuma mensagem de confirmação é perdida em nenhum dos caminhos (janela aberta/fechada,
   template aprovado/pendente).

## Abordagens consideradas (com trade-offs + recomendada)

**Vínculo uso↔template (escolhida: chave lógica + vínculo no admin).** Código dispara por chave
estável (`confirmacao_contratacao`); admin vincula ao template Meta aprovado. Copy e aprovação
ficam desacopladas de deploy — trocar/reaprovar template não exige subir código. Alternativa
rejeitada: nome do template em env/const (simples, mas troca de template/idioma vira redeploy e
não há tela de gestão). Rejeitada também: LLM escolher o template — viola a lei de arquitetura
"invariante crítico vira código, não regra-no-prompt".

**Comportamento dentro da janela de 24h (escolhida: texto livre rico).** Janela aberta → mantém
texto livre; template só quando a janela está fechada (caso web→WhatsApp). Melhor UX e menor
custo. Alternativa rejeitada: sempre template (consistência total, mas perde riqueza e paga
template sempre).

**Template não aprovado + janela fechada (escolhida: enfileira e envia ao aprovar).** Confirmação
fica pendente na fila + alerta no admin; disparada automaticamente quando o template vira
`APPROVED` (casado com o poll). Alternativa rejeitada: bloquear o fechamento até haver template
aprovado (rígido demais, trava a jornada se a Meta demorar).

## Design

### Arquitetura

Quatro camadas, alinhadas aos blocos de implementação:

1. **Dados + cliente Meta** (base). 2. **Sincronização de status**. 3. **Admin de templates**.
4. **Resolução de envio + fila**.

### Componentes

**Dados (`src/db/schema.ts`):**

- `whatsappTemplates`:
  - `id` (uuid pk), `usageKey` (text, nullable, **unique quando setado** — a chave lógica),
    `metaName` (nome do template na Meta, ex `aja_confirmacao_v1`), `language` (default `pt_BR`),
    `category` (enum UTILITY/MARKETING/AUTHENTICATION), `components` (jsonb — HEADER/BODY/FOOTER/
    BUTTONS com placeholders), `bodyPreview` (text denormalizado), `status`
    (enum DRAFT/PENDING/APPROVED/REJECTED/DISABLED/PAUSED, default DRAFT),
    `metaTemplateId` (text), `rejectionReason` (text), `submittedAt`, `approvedAt`,
    `lastSyncedAt`, `createdAt`, `updatedAt`.
  - Enums novos: `whatsappTemplateStatusEnum`, `whatsappTemplateCategoryEnum`.
- `whatsappOutboundQueue` (mensagens business-initiated pendentes de template aprovado):
  - `id` (uuid pk), `to` (E.164 sem `+`), `usageKey` (text), `params` (jsonb),
    `status` (enum pending/sent/failed, default pending), `attempts` (int), `lastError` (text),
    `createdAt`, `sentAt`.

**Cliente Meta (`src/lib/whatsapp/api.ts`):**

- `createTemplate({ name, language, category, components })` → `POST /{WABA_ID}/message_templates`,
  retorna `{ id, status, category }`.
- `listTemplates()` → `GET /{WABA_ID}/message_templates?fields=name,status,category,language,id`
  (para reconciliação/poll).
- Nova env **`WHATSAPP_WABA_ID`** (o WhatsApp Business Account ID — criar template é no WABA, não
  no phone number id). ⚠️ **PENDENTE-KAIRO: obter o WABA ID na Meta Business.** Documentar em
  `.env.example` (que hoje nem lista as vars `WHATSAPP_*`).
- Reaproveitar `sendTemplate()` existente para o envio.

**Sincronização de status (dupla via, anti-manual):**

- Webhook (`src/app/api/webhook/whatsapp/route.ts`): tratar
  `entry[].changes[].field === "message_template_status_update"` (hoje só trata `messages`/
  `statuses`). Payload: `value.event` (APPROVED/REJECTED/DISABLED/PAUSED/...),
  `value.message_template_id`, `value.message_template_name`, `value.message_template_language`,
  `value.reason`. Atualiza a linha por `metaTemplateId`/`metaName`; se virou `APPROVED`, chama o
  dispatcher da fila.
- Poll de reconciliação: `POST /api/admin/whatsapp/templates/sync` (e botão no admin) que chama
  `listTemplates()` e reconcilia o status local — pega transições que o webhook perdeu.

**Admin (`/admin/whatsapp/templates`, blocos shadcn/studio Pro):**

- Lista com badge de status por template + `rejectionReason` visível.
- Form de criação: `usageKey`, `metaName`, `category`, `language`, corpo com editor de variáveis
  (HEADER/BODY/FOOTER/BUTTONS opcionais), preview.
- Ações: "submeter à Meta", "sincronizar status".
- Rotas API: `GET/POST /api/admin/whatsapp/templates`, `POST .../[id]/submit`,
  `POST .../[id]/sync`, `POST .../sync` (sync-all). Protegidas por role admin (mesmo guard das
  demais rotas admin).

**Resolução de envio (`src/lib/whatsapp/template-dispatch.ts`):**

- `resolveAndSend({ to, waId, usageKey, params, freeTextFallback })`:
  1. `isWindowOpen(waId)` → **texto livre** (executa `freeTextFallback`, a copy rica atual).
  2. Janela fechada + template `APPROVED` → `sendTemplate(metaName, language, componentsFromParams)`.
  3. Janela fechada + template não aprovado → grava em `whatsappOutboundQueue` (pending) + alerta admin.
- Os três pontos de disparo passam a rotear por essa camada com seus `usageKey`
  (`confirmacao_contratacao`, `resumo_contratacao`, `proposta_pronta`), mantendo o texto livre
  como `freeTextFallback` dentro da janela.
- `flushOutboundQueue(usageKey)`: ao template virar `APPROVED` (webhook/poll), envia as pendentes
  daquele `usageKey` e marca `sent`.

### Fluxo de dados

```
[fim da jornada] → resolveAndSend(usageKey, params, to, waId)
   ├─ janela ABERTA  → freeTextFallback() (texto livre rico) ✅
   └─ janela FECHADA
        ├─ template APPROVED    → sendTemplate() ✅
        └─ template NÃO aprovado → whatsappOutboundQueue(pending) + alerta admin
                                       ▲
        webhook message_template_status_update / poll → status=APPROVED
                                       └→ flushOutboundQueue(usageKey) → sendTemplate() ✅
```

### Erros

- Submissão à Meta falha (4xx/5xx) → template fica `DRAFT` com erro exibido no admin; não persiste
  `PENDING` falso.
- Webhook de status para template desconhecido localmente → loga e ignora (não cria linha órfã);
  o poll reconcilia por nome.
- `sendTemplate` falha no flush da fila → incrementa `attempts`, guarda `lastError`, mantém
  `pending` (retry no próximo poll/aprovação); nunca marca `sent` sem sucesso.
- `WHATSAPP_WABA_ID` ausente → operações de template retornam erro claro (mesmo padrão de
  `WHATSAPP_ACCESS_TOKEN`/`PHONE_NUMBER_ID` em `api.ts`).

### Testes

Feature majoritariamente **não-agêntica** (rotas, DB, resolução determinística) → foco em
**integração/estrutural (Camada 1)**; **sem cassette (Camada 2)** porque nenhum comportamento da
LLM muda (os pontos de disparo são código determinístico).

- Schema/enums presentes; `usageKey` único.
- `resolveAndSend`: janela aberta → free text; fechada+aprovado → template; fechada+não aprovado
  → enfileira.
- Parsing do webhook `message_template_status_update` atualiza status corretamente.
- `flushOutboundQueue` dispara pendentes ao aprovar e é idempotente.
- Poll/`listTemplates` reconcilia status divergente.
- E2E com Graph API mockada: criar → submeter → (aprovar simulado) → confirmação sai como template;
  e o caminho enfileira→aprova→dispara.

## Decisões de design (→ docs/decisoes/)

- Vínculo uso↔template por **chave lógica gerida no admin** (não env, não LLM).
- **Texto livre dentro da janela**, template só fora dela.
- **Fila + auto-dispatch ao aprovar** como fallback anti-manual (nunca bloqueia o fechamento).
- Nova env `WHATSAPP_WABA_ID`; WABA ID real é PENDENTE-KAIRO.

## Riscos e gaps honestos

- **WABA ID real ainda não temos** (PENDENTE-KAIRO) — a submissão real depende disso; testes usam
  Graph mockada. A homologação Bevi/Conexia não cobre a conta WhatsApp da Meta (é outra credencial).
- **Copy/categoria do template é sujeita à aprovação da Meta** — pode ser recategorizada ou
  rejeitada; o corpo aprovável é copy que o Kairo revisa. O seed inicial de templates é sugestão.
- **Mapeamento params→placeholders**: o texto livre atual tem parágrafos ricos; o template tem
  placeholders fixos. A copy do template será mais enxuta que o texto livre — trade-off aceito
  (texto rico permanece dentro da janela).
- Onda concorrente `integ/reveal-refino` ativa no Superset — esta onda roda isolada em
  `integ/whatsapp-templates`, tocando apenas seus paths.

## Fora de escopo (YAGNI)

- Editor visual WYSIWYG de template (form simples basta).
- Versionamento/histórico de templates além de trocar o `usageKey` para a nova versão aprovada.
- Templates de MARKETING com botões de call-to-action dinâmicos (foco em UTILITY de confirmação).
- Cron agendado de poll (por ora: webhook + botão de sync + sync no fluxo de flush). Cron externo
  pode ser adicionado depois se o webhook se mostrar não-confiável.
- Reabertura de janela pelo Kanban já existe (`admin/.../message/route.ts`) — esta spec não a
  refatora, só passa a alimentar o mesmo `whatsappTemplates` como fonte de nomes.
