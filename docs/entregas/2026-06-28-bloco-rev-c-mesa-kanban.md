# Revisão adversarial — bloco-rev-c (mesa-kanban)

**Data:** 2026-06-28
**Branch:** `rev/mesa-kanban` · **Revisor:** Opus (modelo certo) · auditoria adversarial de código escrito por sessões com modelo fraco.
**Área:** `src/lib/mesa/**`, `src/lib/lead(s)/**`, `src/lib/contacts/**`, `src/components/admin/**` (pipeline/kanban, lead-detail, mesa-attendants, attendants), `src/app/admin/**` + rotas `src/app/api/admin/**` consumidas por esses componentes.
**Features cobertas:** mesa-cadastros, mesa-copiloto, mesa-transbordo, attendant-crud.

## Ambiente de verificação
- DB de teste efêmero (`aja-pg-mesa-kanban-test`, container próprio) com as **migrations versionadas** aplicadas (`drizzle-kit migrate`, não push).
- `IDENTITY_ENC_KEY` de teste gerada para os testes de backfill (CPF cifrado).
- **Gate verde provado:** `pnpm test:unit` = **1944 passed** (186 arquivos). Suíte completa da área (unit + integration + route) = **156 passed**. Typecheck sem erro novo nos arquivos tocados.
- O pre-commit hook (Camadas 1+2) rodou e passou em **todos** os commits (sem `--no-verify`) — `DATABASE_URL` exportado no commit para o hook herdar.

---

## Bugs encontrados e CORRIGIDOS (TDD: regressão primeiro → falhar → fix → passar)

### 1. [CRÍTICO · contrato de shape UI×API] Chat do operador mandava `lead.id` como `conversationId`
- **Evidência:** `src/components/admin/pipeline/lead-detail-panel.tsx:71,78` usava `lead.id` na URL e no body de `POST /api/admin/conversations/[id]/message`. Mas o id da CONVERSA é `lead.conversationId`, campo distinto no card (`lead-card.tsx:12`; preservado pelo dedup em `kanban-dedup.ts`). A janela de 24h (`isWindowOpen`) e a persistência batiam na conversa errada/inexistente.
- **É exatamente a lição nº1 da área** (dialog/componente lendo a chave errada da API).
- **Fix:** usa `lead.conversationId`. Regressão: `lead-detail-panel.chat-contract.test.tsx`.
- **Commit:** `9d6a2b9`.

### 2. [contrato de shape] Mensagem de erro da API nunca chegava ao operador
- **Evidência:** `lead-detail-panel.tsx:84` lia `data.error?.message`, mas a rota responde `{ error: "<código>", message: "<motivo>" }` — `data.error` é string, então `.message` era sempre `undefined` → caía no fallback genérico "Falha ao enviar mensagem". O motivo real (ex.: "janela de 24h fechada") nunca aparecia.
- **Fix:** lê `data.message`. Regressão no mesmo arquivo de teste.
- **Commit:** `9d6a2b9`.

### 3. [CRÍTICO · segurança + funcional] `message/route.ts`: auth placeholder + envio pro destino errado
- **Evidência (auth):** `src/app/api/admin/conversations/[id]/message/route.ts` checava só a existência de um header `Authorization: Bearer ...` e **aceitava qualquer token** (sem validar sessão) — comentário "implementar com melhor-auth quando estiver disponível". E o componente **nunca** mandava esse header → **toda chamada dava 401** (feature 100% quebrada) e o gate era inseguro (diferente de todas as outras rotas `/api/admin`, que usam `requireRole`).
- **Evidência (envio):** `sendTextMessage(conversationId, text)` passava o UUID da conversa onde a função espera o **número** do destinatário (`to`). O outbound do copiloto confirma o contrato: `sendTextMessage(attendantWhatsapp, ...)` (`whatsapp/mesa/outbound.ts:114`).
- **Evidência (Next 16):** `params` tratado como objeto síncrono (sem `await`).
- **Decisão de produto/segurança (perguntada ao Kairo, respondida `admin + attendant`):** quem pode enviar WhatsApp ao cliente pelo chat.
- **Fix:** `requireRole("admin", "attendant")` (cookie de sessão); resolve `conversations.waId` e envia pro cliente (422 legível quando a conversa não tem WhatsApp); `await params`. Regressão integration: `route.integration.test.ts` (auth por sessão sem Bearer + envio pro waId + gate de role + conversa sem waId).
- **Commit:** `3113798`.

### 4. [CRÍTICO · segurança/escalada de privilégio] Mutações do CRUD de atendentes não eram admin-only
- **Evidência:** `POST /api/admin/attendants` e `PATCH`/`DELETE /api/admin/attendants/[id]` (criar/editar/**desativar** usuários — envia convite, mexe em conta de login) usavam `requireRole("admin", "attendant")`, deixando um próprio atendente gerenciar a equipe. O CRUD de atendentes **de mesa** (`mesa-attendants`) já é `requireRole("admin")` — copy-paste do role errado.
- **Decisão de segurança (perguntada ao Kairo, respondida `só admin nas mutações`).**
- **Fix:** mutações → `requireRole("admin")`; o `GET` mantém `attendant` (ver a lista). Regressão structural (Camada 1, entra no gate de PR): `attendants-auth.test.ts`.
- **Commit:** `d84424c`.

### 5. [regra inviolável de ortografia PT-BR] Vários textos de UI sem acento/cedilha/til
- **Evidência e fix** (defeito de entrega — labels, botões, mensagens de validação e cards visíveis ao admin):
  - Raia do kanban `"Em Negociacao"` → `"Em Negociação"` (`kanban-column.tsx`, `lead-detail-panel.tsx`, `contact-detail-panel.tsx`, `dashboard-types.ts`); alert `"conexao"` → `"conexão"` (`kanban-board.tsx`). Commit `007416b`.
  - Mensagens de validação do atendente: `"maximo"`/`"invalido"`/`"numero"` → `"máximo"`/`"inválido"`/`"número"` (`validations/attendant.ts`). Commit `0b8142d`.
  - Cards de insight e preview de artefato: `Intenção`, `Objeções`, `Próxima Ação`, `Não …`, `/mês`, `Simulação`, `Recomendação`, `Comparação` (`insight-cards.tsx`, `artifact-preview.tsx`). Commit `0f17594`.
  - Filtro de data `"Ate"` → `"Até"` (`pipeline-filters.tsx`); navegação `"Aplicacoes"`/`"Configuracoes"` → `"Aplicações"`/`"Configurações"` (`app-sidebar.tsx`). Commit `d5d66f8`.

> `c93176b` (`style:`) só aplicou biome ao novo arquivo de teste — sem mudança de comportamento.

---

## PENDENTE (não-corrigido — fora do escopo da área + blast-radius alto)

### [SEGURANÇA · arquitetural/global] Páginas `/admin/(dashboard)/*` sem gate de auth server-side — **PENDENTE-KAIRO**
- **Evidência:** não há `middleware.ts` no projeto; `src/app/admin/(dashboard)/layout.tsx` só renderiza o shell (sidebar/header) e **nenhuma** página/layout do grupo chama `requireRole`/`getSession`/`redirect`. Um não-autenticado (ou usuário de qualquer role) que acesse `/admin/pipeline`, `/admin/attendants` etc. vê a **estrutura** do painel.
- **Mitigação que JÁ existe:** os DADOS são protegidos — todas as rotas `/api/admin/**` auditadas usam `requireRole`, então o conteúdo real não carrega (401/403). O vazamento é estrutural/UX, não de dados.
- **Por que não corrigi:** afeta **todas** as páginas admin (todas as áreas/blocos da onda, não só mesa-kanban) e a correção (adicionar `middleware.ts` ou `requireRole` no `(dashboard)/layout.tsx` server-side) é **decisão arquitetural de auth com blast-radius alto** — diagnostiquei e deixei o caminho fechado, mas não executo sem o aval do dono da arquitetura para não colidir com outros blocos.
- **Recomendação:** `middleware.ts` com matcher `/admin/:path*` (exceto `/admin/login`) redirecionando sem sessão; opcionalmente `requireRole` no layout server.

### Schema/migrations — fora do escopo (dono = bloco-rev-e)
- Não toquei `src/db/schema.ts` nem `drizzle/**`. **Nenhuma coluna/migration faltando detectada** na área: `mesa_handoffs`/`mesa_attendants`/`mesa_copilot_messages`/`contacts` existem (`0024_contacts_unified.sql`, `0026_mesa_operacao.sql`, `0028_chat_mesa_last_inbound_at.sql`). Sem **PENDENTE-REV-E**.

---

## Verificado e SÓLIDO (sem bug — auditado e provado)

- **Idempotência do transbordo** (`lib/mesa/handoff.ts`): no máx. 1 handoff ativo por lead (`handoff_ativo_existe` → 409, sem segunda linha nem reenvio); resolve administradora pela cota; outbound best-effort não derruba o registro. Coberto por `handoff.integration.test.ts` + `transbordo/route.integration.test.ts` (T9, anti-leak de PDF entre administradoras).
- **Copiloto** (`whatsapp/mesa/routing.ts`, `outbound.ts`, `agent/mesa-copilot`): resolve o handoff pelo `attendant.id` derivado do telefone — **sem vazamento cross-lead/tenant**; dossiê com whitelist deliberada **sem CPF** (§8 LGPD); `sendTextMessage(attendantWhatsapp, …)` correto.
- **Contrato shape UI×API dos demais consumidores:** transbordo-dialog lê `data.mesaAttendants` (= endpoint), timeline lê `data.messages`, contact-detail lê o shape de `getContactDetail`, tabelas lêem `data.attendants`/`data.mesaAttendants` — **todos batem**.
- **CRUD mesa-attendants:** admin-only; soft-disable coerente (não hard-delete com handoff vinculado → 409); `normalizePhoneBR` strippa o `55`, sem double-DDI no edit.
- **contacts** (resolve/backfill/contact-capture): merge transacional de FKs, find-or-create idempotente, nunca cria contato só com nome; CPF nunca logado.
- **Mass-assignment:** rotas inserem/atualizam `parsed.data` de schemas Zod restritos (não o body cru).
- **`slug.ts`/`stripAccents`:** regex de diacríticos é `[U+0300–U+036F]` (combining marks) — correto.
- **Testes:** nenhum `.skip`/`.only` hardcoded (só `describeIfDb` condicional por DB, legítimo).

## Commits (8)
`9d6a2b9` · `3113798` · `007416b` · `c93176b` · `0b8142d` · `0f17594` · `d5d66f8` · `d84424c`
