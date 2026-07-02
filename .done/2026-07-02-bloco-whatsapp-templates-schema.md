# Bloco — Fundação: schema de templates + cliente Meta (onda 1)

> 2026-07-02 · branch `feat/whatsapp-templates-schema` · onda 1 (fundação)
> Spec: `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`

## O que entrega

A **fundação** da feature de Message Templates da Meta oficial — a base de que
os blocos `backend` e `admin` (onda 2) dependem. Dois itens, ambos com Camada 1
(structural), TDD strict (teste falhou antes do código).

### FIX-191 — schema `whatsappTemplates` + `whatsappOutboundQueue` + enums
- `whatsapp_templates`: ciclo de vida do template na Meta
  (`DRAFT→PENDING→APPROVED/REJECTED/DISABLED/PAUSED`), vínculo de uso por
  `usageKey` (**único quando setado** via unique index — NULLs distintos no PG),
  `metaName`, `language` (default `pt_BR`), `category` (enum), `components`
  (jsonb tipado `WhatsappTemplateComponent[]`), `bodyPreview`, `metaTemplateId`,
  `rejectionReason` e os timestamps de fluxo (`submittedAt`/`approvedAt`/
  `lastSyncedAt`).
- `whatsapp_outbound_queue`: fila anti-manual de mensagens business-initiated
  pendentes de template aprovado (`to`, `usageKey`, `params` jsonb, `status`
  pending/sent/failed, `attempts`, `lastError`).
- Enums: `whatsappTemplateStatusEnum`, `whatsappTemplateCategoryEnum`,
  `whatsappOutboundStatusEnum`.
- Migration versionada `drizzle/0032_married_exodus.sql` (gerada por
  `drizzle-kit generate` — **não** rodei push/migrate contra banco).
- Teste: `src/db/schema.whatsapp-templates.test.ts` (10 asserts estruturais).
- Commit: `82347cc1`.

### FIX-192 — cliente Meta `createTemplate`/`listTemplates` + env `WHATSAPP_WABA_ID`
- `createTemplate({name,language,category,components})` → `POST
  /{WABA_ID}/message_templates` (Bearer). Retorna `{id,status,category}`. Erro
  da Meta (4xx/5xx) **propaga** — nunca finge sucesso (não persiste PENDING falso).
- `listTemplates()` → `GET /{WABA_ID}/message_templates?fields=...` com
  **paginação por cursor** (segue `paging.next`, concatena páginas).
- Env nova `WHATSAPP_WABA_ID` lida via `getWabaConfig()`, com erro claro se
  ausente (mesmo padrão de `getConfig`). Criar template é no **WABA**, não no
  phone number id — sem branch de waId simulado (criação não é por-destinatário).
- `.env.example`: documentei todas as `WHATSAPP_*` reais usadas no código
  (ACCESS_TOKEN, PHONE_NUMBER_ID, WABA_ID, VERIFY_TOKEN, APP_SECRET).
- Teste: `src/lib/whatsapp/api.templates.test.ts` (6 asserts, `fetch` mockado —
  nunca bate na Graph real). Os testes de `api.test.ts` existentes seguem verdes.
- Commit: `19f6f0ab`.

## Decisões de design (implementação; a spec não reabri)

- **`components` (jsonb) tipado frouxo** (`WhatsappTemplateComponent[]` com
  `type` HEADER/BODY/FOOTER/BUTTONS + campos opcionais) em vez de discriminated
  union rígida por variante — a Meta evolui o shape e não há consumer SQL que
  valide; travar cada forma seria fricção sem ganho (mesmo racional do
  `artifacts.type` = text no repo). `params` da fila idem (`Record<string,unknown>`).
- **`usageKey` único-quando-setado via `uniqueIndex`** (não constraint parcial
  explícita) — no Postgres o unique index já trata NULLs como distintos, então
  vários templates sem chave coexistem e cada chave aponta pra um só template.
- **Sem blocos `relations`** para as duas tabelas — nenhuma tem FK (usageKey é
  chave lógica, não FK) e nada as referencia ainda; adicionar relations vazias
  seria ruído. A onda 2 adiciona quando ligar consumidores.
- **`listTemplates` segue paginação por cursor** em vez de trazer só a 1ª página
  — o poll de reconciliação precisa do conjunto completo pra não perder
  transições de status de templates fora da 1ª página.
- **`.env.example`: não documentei `WHATSAPP_AGENT_PHONES/NAMES`** que o fix-192
  sugeria — `grep` mostrou que essas vars **não existem** no código; documentar
  var fantasma engana. Documentei só as 5 reais.

## Testes

- `src/db/` → 21 passed (inclui os 10 novos do FIX-191 + meta-integrity).
- `src/lib/whatsapp/api.templates.test.ts` + `api.test.ts` → 14 passed.
- `pnpm typecheck` → sem erros nos arquivos tocados (schema.ts, api.ts, testes).

## Gaps honestos

- **`WHATSAPP_WABA_ID` real é PENDENTE-KAIRO** — obter na Meta Business. A
  submissão real depende disso; os testes mockam `fetch` e não dependem do valor.
- **`pnpm test:unit` completo NÃO fica verde neste worktree**: 3 arquivos
  (`bevi/contract-summary`, `leads/contact-capture`, `agent/tools/ai-sdk`)
  falham por **ECONNREFUSED no Postgres** — não há DB de pé aqui. São testes de
  integração pré-existentes (falham igual com minhas mudanças *stashed*),
  **sem relação com este bloco**. O gate real da onda roda em container
  transitório com pg migrado (responsabilidade do orquestrador — ver memória
  "Gate de onda em container").
- Fila, dispatcher, webhook de status, admin e resolução de envio são das ondas
  seguintes (fora do escopo desta fundação).
