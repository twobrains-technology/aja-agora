---
feature: Captura Conversacional de Lead (Web)
slug: lead-capture-web
date: 2026-05-17
author: PO Lead (skill QA sênior)
status: ready-for-qa
branch: feat/improving-web-conversation
spec: docs/superpowers/specs/2026-05-17-lead-capture-web-design.md
plan: docs/superpowers/plans/2026-05-17-lead-capture-web.md
---

# Test Plan — Captura Conversacional de Lead (Web)

> Documento de contrato entre PO Lead e QA crítico. **Critério de aceite
> binário (CA-NN) = fonte de verdade do "feito"**. Cenários P0 são gate
> de release. Edge cases são gate de qualidade.

---

## 1. Escopo

### 1.1 O que a feature entrega

A feature substitui o **gate único** de captura de lead (form de 3 campos
obrigatórios no final do funil, quando o usuário clica "Tenho interesse"
no `recommendation-card`) por uma **captura progressiva** distribuída ao
longo da conversa web:

1. **Nome** capturado conversacionalmente logo após o objetivo declarado.
   O specialist (Helena/Bruno/etc.) pergunta "como posso te chamar?" em
   sua **primeira mensagem** e chama `save_contact_name` quando o usuário
   responde. Aceita free-text ("Kairo", "sou o Kairo", "me chamo Alan
   Carlos da Silva") e extrai só o primeiro nome.
2. **WhatsApp** ofertado **após a primeira simulação/recomendação**, via
   componente UI dedicado (`WhatsappOptin` card com input mascarado + 2
   botões). Disparado pela tool `present_whatsapp_optin` (apenas 1x por
   conversa, guard em `metadata.whatsappOptinShown`).
3. **Lead row** criada na tabela `leads` com `stage='novo'` no momento da
   captura do nome; promovida a `'engajado'` (com `leadEvents` row) ao
   salvar WhatsApp. Não regride stage se já avançou.
4. **Form fallback** mantido no clique de "Tenho interesse", agora:
   - `email` opcional (era obrigatório)
   - `phone` obrigatório (idem)
   - **Pré-preenchido** com nome/phone já capturados conversacionalmente
     via `GET /api/leads/[conversationId]`
   - Submit promove lead a `'qualificado'` e dispara handoff WhatsApp

### 1.2 Fluxo end-to-end (golden)

```
[user] "quero comprar carro"
  → concierge roteia → specialist (Helena)
[Helena] "Boa, carro novo abre muitas portas! Aqui é a Helena,
          antes de eu te ajudar, como posso te chamar?"
[user] "Kairo"
  → save_contact_name(convId, "Kairo")
  → leads row criada (stage='novo'), conversations.contactName='Kairo'
[Helena] "Beleza, Kairo, dá uma olhada na sua faixa abaixo:"
  → gate experience → gate credit → gate timeframe → gate lance
  → search_groups + present_simulation_result
  → present_whatsapp_optin
[WhatsappOptin card] input + [Quero receber] / [Agora não]
[user] digita (11) 98765-4321 + clica Quero
  → POST /api/chat { action: { kind: 'whatsapp_optin', phone: '11987654321' } }
  → saveContactWhatsapp → leads.phone='11987654321', stage='engajado'
  → conversations.waId='11987654321', metadata.whatsappOptinShown=true
[Helena] "Show, Kairo! Anotei seu WhatsApp. Se algo acontecer aqui, te chamo por lá. ✅"
  → continua qualificação → present_recommendation_card
[user] clica "Tenho interesse"
  → present_lead_form (artifact)
  → GET /api/leads/[convId] retorna { name: "Kairo", phone: "11987654321", email: "" }
  → form pré-preenchido
[user] submit
  → POST /api/leads → lead atualizado, stage='qualificado'
  → handoffToAgents → conversation.status='handed_off'
```

### 1.3 Valor pro negócio

- **Conversão**: meta ≥ 3-5x do baseline (% conversas web → lead criado).
  Hoje só vira lead quem chega ao form final (~2-3%). Captura progressiva
  pode atingir 10-15% (benchmark chatbots conversacionais 2026).
- **WhatsApp pre-form**: meta ≥ 60% dos leads têm `phone` salvo **antes**
  do form fallback. Habilita reengajamento de leads abandonados.
- **Métricas finas de funil**: `leadEvents` registra cada transição
  (`novo → engajado → qualificado`) — dashboards de drop-off por estágio.
- **Cross-channel**: `conversations.waId` populado no opt-in habilita
  reconciliação Letta (memória do agent migra cookie → phone).

### 1.4 Fora de escopo (NÃO testar nesta rodada)

- OTP/verificação real de WhatsApp (mandar SMS)
- Captura de email conversacional (só via form fallback)
- Cross-channel completo (web → identifica WhatsApp existente)
- Redesign visual do form fallback
- Dashboard de métricas (só emit + log nesta entrega)

---

## 2. Pré-requisitos

### 2.1 Ambiente

| Item | Comando / valor |
|------|-----------------|
| Worktree | `/Users/kairo/.superset/worktrees/tb-aja-agora/feat/improving-web-conversation` |
| Stack local | `~/.tb-local/<workspace>` (skill `local-dev`) — DNS `.orb.local` |
| URL app | `http://aja-agora-feat-improving-web-conversation.orb.local` |
| Postgres | Container do workspace (NÃO `localhost:5432` do host) |
| `.env.test` | Decriptar via `secrets.sh e2e-decrypt aja-agora` antes do E2E |
| `ANTHROPIC_API_KEY` | Obrigatória — agente real (não mock) nos cenários E2E "agent-driven" |

### 2.2 Schema esperado

- `lead_stage` enum inclui `novo, engajado, qualificado, em_negociacao, proposta_enviada, fechado_ganho, perdido`
- `conversations.contactName` (text, nullable) — existente
- `conversations.waId` (varchar(50)) — existente (B-02 já estendeu)
- `conversations.metadata.whatsappOptinShown` (bool, em JSONB)
- `conversations.metadata.whatsappOptinDeclined` (bool, em JSONB)
- `leads.phone` (text, nullable) — atualizado por `saveContactWhatsapp`
- `leads.name` (text, nullable) — atualizado por `saveContactName`
- `lead_events` (table) — INSERT em toda transição via `transitionLeadStage`

### 2.3 Seed data / fixtures

| Fixture | Como criar |
|---------|------------|
| Conversation real (não-simulada) auto | `INSERT INTO conversations (is_simulated) VALUES (false)` |
| Conversation simulada | `INSERT INTO conversations (is_simulated) VALUES (true)` |
| Lead pré-existente novo | `saveContactName(convId, 'Kairo')` antes do cenário |
| Lead pré-existente engajado | `saveContactWhatsapp` após `saveContactName` |

### 2.4 Mocks obrigatórios em integration tests

- `@/lib/whatsapp/proxy` → `handoffToAgents: vi.fn().mockResolvedValue(undefined)`
  (NÃO disparar WhatsApp real em CI/local — já feito em `route.test.ts`)
- `@/lib/middleware/rate-limit` → `checkRateLimit: () => ({ allowed: true })`
- `@/lib/memory/index` (`getMemoryAdapter`) e `@/lib/memory/reconciler` →
  stubs no-op nos cenários que dispararem reconciliação Letta, para
  isolar a feature do letta-sidecar

### 2.5 Contas / personas

Nenhuma autenticação web requerida — fluxo é anônimo via cookie
`aja_uid`. Admin não precisa ser usado nesta feature (só verificação
indireta de `lead_events` via query SQL).

---

## 3. Fluxos críticos P0 (golden paths)

> Cada P0 é gate de release. Falha em qualquer P0 = feature reprovada.
> Sempre rodar com agent Anthropic real (não mockado) salvo onde
> indicado, pra capturar regressão de prompt.

### P0-01 — Captura de nome dispara `save_contact_name` e cria lead

**Pré-condição:**
- Conversation nova (sem `contactName`, sem lead row).
- Specialist roteado (ex: Helena de auto após `category=auto`).

**Passos:**
1. POST `/api/chat` com `action: { kind: 'category', category: 'auto' }` (entra no specialist)
2. Aguardar primeira mensagem do specialist (deve conter pedido de nome)
3. POST `/api/chat` com user message `"Kairo"`
4. Aguardar streaming completo
5. Query DB: `SELECT * FROM leads WHERE conversation_id = $1`
6. Query DB: `SELECT contact_name FROM conversations WHERE id = $1`
7. Query DB: `SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at`

**Expected:**
- Step 2: resposta do agent contém substring ofertando o nome (regex
  `/como posso te chamar|qual seu nome|teu nome/i`)
- Step 4: tool call `save_contact_name` registrada nos messages
- Step 5: 1 row em `leads`, com `name='Kairo'`, `stage='novo'`, `phone=null`
- Step 6: `contact_name='Kairo'`
- Step 7: 1 row em `lead_events` com `to_stage='novo'`, `from_stage=null`

**Critérios:** **CA-01, CA-02, CA-03, CA-04**

---

### P0-02 — Card WhatsApp aparece após primeira simulação e captura phone

**Pré-condição:**
- Conversation com `contactName='Kairo'`, lead `stage='novo'`.
- Qualificação completa (todos gates respondidos).

**Passos:**
1. Disparar fluxo até `present_simulation_result` aparecer (artifact
   `simulation_result` no stream)
2. No turno seguinte do agent, esperar artifact `whatsapp_optin` no stream
3. Verificar UI: card renderiza com `<Input placeholder="(11) 98765-4321">`
   + `<Button>Quero receber</Button>` + `<Button>Agora não</Button>`
4. Digitar `11987654321` no input
5. Verificar máscara aplicada: input.value === `"(11) 98765-4321"`
6. Clicar "Quero receber"
7. Verificar POST `/api/chat` enviado com `body.action = { kind: 'whatsapp_optin', phone: '11987654321' }`
8. Aguardar resposta do server
9. Query DB: `SELECT phone, stage FROM leads WHERE conversation_id = $1`
10. Query DB: `SELECT wa_id, metadata FROM conversations WHERE id = $1`
11. Query DB: `SELECT to_stage FROM lead_events WHERE lead_id = $1 ORDER BY created_at`

**Expected:**
- Step 2: artifact `whatsapp_optin` aparece **apenas após**
  `simulation_result` (não antes)
- Step 5: máscara correta
- Step 7: action enviada com phone **normalizado** (só dígitos)
- Step 8: response do server contém texto do tipo
  `/Anotei seu WhatsApp|Show.*WhatsApp/i`
- Step 9: `phone='11987654321'`, `stage='engajado'`
- Step 10: `wa_id='11987654321'`, `metadata.whatsappOptinShown===true`
- Step 11: última row tem `to_stage='engajado'`

**Critérios:** **CA-05, CA-06, CA-07, CA-08, CA-09**

---

### P0-03 — Recusa "Agora não" registra metadata e segue conversa

**Pré-condição:**
- Conversation com lead `stage='novo'`, card `whatsapp_optin` apresentado.

**Passos:**
1. Clicar "Agora não" no card
2. Aguardar response
3. Query DB: `SELECT metadata FROM conversations WHERE id = $1`
4. Query DB: `SELECT phone, stage FROM leads WHERE conversation_id = $1`
5. Continuar conversa (enviar mais 1 user message)
6. Verificar que agent não tenta `present_whatsapp_optin` de novo

**Expected:**
- Step 2: response contém `/sem problema|seguimos|por aqui/i`
- Step 3: `metadata.whatsappOptinShown===true` **E**
  `metadata.whatsappOptinDeclined===true`
- Step 4: `phone=null`, `stage='novo'` (não regrediu, não promoveu)
- Step 6: nenhum artifact `whatsapp_optin` nas mensagens seguintes

**Critérios:** **CA-10, CA-11**

---

### P0-04 — Form fallback pré-preenchido com nome+phone capturados

**Pré-condição:**
- Conversation com lead `name='Kairo'`, `phone='11987654321'`, `stage='engajado'`.

**Passos:**
1. Disparar `action: { kind: 'interest' }` (ou clicar "Tenho interesse"
   em `recommendation-card`)
2. Esperar artifact `lead_form` no stream
3. Em paralelo, espera-se `GET /api/leads/<convId>` ser disparado pelo
   componente (verificar via Network tab/intercept)
4. Verificar valores iniciais dos inputs do form

**Expected:**
- Step 3: response 200 com body
  `{ name: "Kairo", phone: "11987654321", email: "" }`
- Step 4: `input[name="name"].value === "Kairo"` E
  `input[name="phone"].value === "11987654321"` E
  `input[name="email"].value === ""`

**Critérios:** **CA-12, CA-13**

---

### P0-05 — Form fallback aceita submit com phone sem email

**Pré-condição:**
- Form fallback renderizado, sem email preenchido (lead novo via form).

**Passos:**
1. POST `/api/leads` com body
   `{ conversationId, name: 'Kairo', phone: '(11) 98765-4321', email: '' }`
2. Verificar status response
3. Query DB: `SELECT name, phone, email, stage FROM leads WHERE conversation_id = $1`

**Expected:**
- Step 2: status 200, body `{ ok: true, leadId }`
- Step 3: `name='Kairo'`, `phone='11987654321'` (normalizado),
  `email IS NULL`, `stage='qualificado'` (transitionLeadStage executou)

**Critérios:** **CA-14, CA-15**

---

### P0-06 — Idempotência: duplo clique não duplica lead nem leadEvent

**Pré-condição:**
- Conversation com `contactName='Kairo'`, lead `stage='novo'`.

**Passos (paralelos, simular race de duplo clique):**
1. Disparar `Promise.all([POST /api/chat whatsapp_optin x2])` no mesmo
   `conversationId` com `phone='11987654321'`
2. Aguardar ambas as responses
3. Query DB: `SELECT COUNT(*) FROM leads WHERE conversation_id = $1`
4. Query DB: `SELECT COUNT(*) FROM lead_events WHERE lead_id = $1 AND to_stage = 'engajado'`

**Expected:**
- Step 2: ambas responses 200
- Step 3: count = 1 (nenhum lead duplicado)
- Step 4: count = 1 (apenas 1 leadEvent de promoção a engajado — guard
  `onlyAdvance` impede repetição)

**Variante 06b (duplo submit form):**
- POST `/api/leads` duas vezes em paralelo com mesmo `conversationId` +
  payload válido → status 200 + 200, 1 row em `leads`, último submit
  atualiza (idempotência via UPDATE WHERE conversation_id).

**Critérios:** **CA-16, CA-17**

---

## 4. Edge cases

> Cenários adversariais. Cada um deve produzir comportamento **definido**
> (não exception 500, não estado inconsistente).

### EC-01 — Nome inválido (vazio, números, > 30 chars, 1 char)

**Inputs a testar (cada um isolado, conversation nova):**

| Input | Esperado |
|-------|----------|
| `""` | Tool retorna `{ ok: false, error: "name_invalid" }` → agent re-pergunta naturalmente |
| `"Kairo123"` | Idem |
| `"K"` | Idem (min 2 chars) |
| `"A".repeat(31)` | Idem (max 30 chars) |
| `"!@#$"` | Idem (regex `[\p{L} '-]+` rejeita) |

**Verificações comuns:**
- Nenhuma row em `leads` criada
- `conversations.contactName` permanece NULL
- Próximo turno do agent contém nova tentativa de pedir nome (texto
  pode variar — não fazer assertion ipsis litteris)

**Critério:** **CA-18, CA-19**

---

### EC-02 — Nome com acentos, hífen, apóstrofo, mix-case

**Inputs:** `"José"`, `"Jean-Luc"`, `"D'Angelo"`, `"Álvaro"`, `"Müller"`, `"alan"` (lowercase), `"ALAN"` (uppercase)

**Esperado:** Todos aceitos. `contact_name` e `leads.name` armazenam **exatamente como digitado** (sem normalização de case). Regex `/^[\p{L}'-]+$/u` cobre Unicode letters.

**Critério:** **CA-20**

---

### EC-03 — Nome completo composto — extrai só primeiro nome

**Inputs:** `"Alan Carlos da Silva"`, `"sou o Kairo"`, `"me chamo João Pedro"`, `"  Maria   "` (espaços)

**Esperado:**
- `"Alan Carlos da Silva"` → `name='Alan'`
- `"sou o Kairo"` → `name='sou'` *(❗ limitação conhecida — extrai
  primeiro token, **dependemos do agent extrair só o nome real** via
  prompt; QA deve validar se o prompt está extraindo corretamente
  via inspect do tool call args)*
- `"  Maria   "` → `name='Maria'` (trim aplicado)
- `"me chamo João Pedro"` → comportamento depende do agent (deve
  passar `'João'` na tool call args)

**Critério:** **CA-21** (agent extrai primeiro nome real) — **adversarial:
QA crítico deve testar com 5+ variações coloquiais e reportar se o agent
manda token errado pra tool**

---

### EC-04 — Phone inválido no card WhatsApp

**Inputs a testar no card (digitar e tentar clicar "Quero"):**

| Input | Botão "Quero" estado |
|-------|----------------------|
| `"11987"` (incompleto) | disabled |
| `"01987654321"` (DDD começa 0) | disabled (regex `[1-9]{2}9?\d{8}`) |
| `"123"` | disabled |
| `""` | disabled |
| `"1198765432"` (10 dígitos — fixo) | enabled (válido) |
| `"11987654321"` (11 dígitos — celular) | enabled |

**Verificações:**
- `Button[Quero]` `disabled=true` se `!valid`
- Nenhum POST `/api/chat` disparado quando inválido
- Nenhuma chamada `saveContactWhatsapp` no server

**Critério:** **CA-22**

---

### EC-05 — Phone com formatações exóticas (envio direto via API)

**Inputs ao POST `/api/chat whatsapp_optin`:**

| Input phone | Normalizado esperado |
|-------------|----------------------|
| `"(11) 98765-4321"` | `"11987654321"` |
| `"+55 11 98765 4321"` | `"11987654321"` |
| `"5511987654321"` | `"11987654321"` |
| `"  11 987654321  "` | `"11987654321"` |
| `"987654321"` (sem DDD) | erro `phone_invalid` |
| `"55119876543210"` (13 dígitos) | erro `phone_invalid` |

**Critério:** **CA-23**

---

### EC-06 — Form fallback submit sem WhatsApp E sem email

**Passos:**
1. POST `/api/leads` `{ conversationId, name: 'Kairo', phone: '', email: '' }`

**Esperado:** status 400, body `{ ok: false, error: 'Validation failed', details: [...] }` com issue path `['phone']` mensagem `"WhatsApp é obrigatório"`.

**Critério:** **CA-24**

---

### EC-07 — Agent tenta `present_whatsapp_optin` 2x na mesma conversa

**Pré-condição:** conversation com `metadata.whatsappOptinShown=true`.

**Passos:**
1. Forçar contexto onde agent decida chamar `present_whatsapp_optin` de novo (ex: nova simulação após mudança de objetivo)
2. Verificar que artifact `whatsapp_optin` NÃO aparece novamente no stream

**Expected:** Sistema **deve bloquear**. Opções de implementação:
- Tool retornar no-op quando `metadata.whatsappOptinShown===true` (atualmente o execute apenas retorna texto, o guard real fica no prompt — **possível gap**)
- OU orchestrator interceptar a tool call e suprimir

**Critério:** **CA-25** — **bug potencial: se NÃO há guard real além do prompt, QA crítico DEVE reportar como FALHA**. Solução: tool execute deve checar `metadata.whatsappOptinShown` antes de emitir artifact.

---

### EC-08 — Conversation simulada NÃO promove stage no kanban

**Pré-condição:** `INSERT INTO conversations (is_simulated) VALUES (true)`

**Passos:**
1. `saveContactName(simConvId, 'Kairo')` → lead criado **com `is_simulated=true`**
2. `saveContactWhatsapp(simConvId, '11987654321')` → phone salvo
3. Query DB: `SELECT stage FROM leads WHERE conversation_id = $1`

**Esperado:** Step 3: `stage='novo'` (NÃO promoveu a engajado — guard em `saveContactWhatsapp` checa `existing.isSimulated`).

**Critério:** **CA-26** — já coberto por test em `contact-capture.test.ts:151`

---

### EC-09 — User recusa nome ("não quero dar", "depois")

**Pré-condição:** specialist acabou de perguntar o nome.

**Passos:**
1. User envia `"prefiro não dizer"` ou `"depois"` ou `"sem nome"`
2. Verificar próximo turno do agent
3. Verificar próximo turno após segunda recusa

**Esperado:**
- Step 2: agent **insiste 1 vez** com tom leve (e.g., "entendo, pode ser
  um apelido pra eu te chamar?") — não chama `save_contact_name`
- Step 3: agent **segue sem nome** (não trava conversa). `leads` row
  **não** é criada. Conversação continua até `lead_form` final, onde
  o nome será obrigatório.

**Critério:** **CA-27** — comportamento depende do prompt; QA deve
  validar adversarialmente. Se agent insistir 3x ou travar, FALHA.

---

### EC-10 — Race condition: 2 `save_contact_name` paralelos

**Setup:** Mesmo conversationId, 2 calls concorrentes com nomes diferentes
(ex: `"Kairo"` e `"Alan"`).

**Esperado:**
- Apenas 1 row em `leads` (não duplica)
- `name` será um dos dois (last-write-wins — aceitável; **não** UPSERT
  com merge)
- Nenhum 500 / deadlock

**Critério:** **CA-28** — atual implementação não tem `SELECT FOR UPDATE`
  nem `ON CONFLICT`; QA pode reproduzir race com `Promise.all`.

---

### EC-11 — User muda de ideia (recusou WhatsApp, depois aceita no form)

**Pré-condição:** lead `stage='novo'`, `metadata.whatsappOptinDeclined=true`, lead.phone=null.

**Passos:**
1. User clica "Tenho interesse" → form aparece (sem phone pré-preenchido)
2. User preenche phone `11987654321` no form + submit
3. Query DB pós-submit

**Esperado:**
- `leads.phone='11987654321'`, `stage='qualificado'`
- Handoff disparado normalmente
- `metadata.whatsappOptinDeclined` **continua true** (não é desfeito —
  audit trail intacto)

**Critério:** **CA-29**

---

### EC-12 — Lead já em `qualificado` quando `saveContactWhatsapp` é chamado

**Pré-condição:** lead `stage='qualificado'` (submeteu form), depois (cenário hipotético) tool `save_contact_whatsapp` chamada de novo.

**Esperado:**
- Apenas `phone` é atualizado (caso novo phone)
- `stage` permanece `qualificado` (não regride a engajado)
- `lead_events`: nenhuma nova row (guard `onlyAdvance`)

**Critério:** **CA-30**

---

### EC-13 — `present_whatsapp_optin` chamada ANTES de simulação

**Pré-condição:** conversation no início, sem `simulation_result` ainda.

**Passos:**
1. Forçar agent (via prompt adversarial) a tentar chamar `present_whatsapp_optin` antes de simulação

**Esperado:** Atualmente o agent é guiado **só pelo prompt** a não fazer isso (não há guard de código). QA crítico deve testar o prompt empiricamente: **rodar 5 conversações iniciais e contar quantas vezes `whatsapp_optin` aparece antes de `simulation_result`**. Meta: 0/5. Se ≥ 1/5, FALHA — fortalecer prompt ou adicionar guard.

**Critério:** **CA-31** — qualitativo, adversarial

---

### EC-14 — Cookie `aja_uid` ausente / corrompido

**Passos:**
1. Limpar cookie `aja_uid` antes da request
2. POST `/api/chat` normal

**Esperado:**
- Server gera cookie novo (`generateCookieValue`)
- Response carrega `Set-Cookie` header
- Captura de nome funciona normalmente
- (Não obrigatório nesta feature) Reconciliação Letta acontece **só** quando lead-collection (form fallback) for completado com email — esse comportamento já existe e NÃO regride

**Critério:** **CA-32**

---

### EC-15 — Conversation ID inválido (não-UUID)

**Passos:** POST `/api/chat` com `conversationId="test-qa-001"`
**Esperado:** 400, body `{ error: "Invalid conversationId" }` (guard já existe — verificar que não regrediu)

**Critério:** **CA-33** (regressão)

---

### EC-16 — `GET /api/leads/[invalid-uuid]`

**Passos:** `GET /api/leads/not-a-uuid`
**Esperado:** 400 `{ error: "Invalid conversationId" }`

**Critério:** **CA-34**

---

### EC-17 — `GET /api/leads/[validUuid mas conversa inexistente]`

**Esperado:** 404 `{ error: "Conversation not found" }`

**Critério:** **CA-35**

---

### EC-18 — Pré-preenchimento com conversation sem lead nem contactName

**Pré-condição:** `conversation.contactName=NULL`, sem lead row.

**Passos:** `GET /api/leads/[convId]`

**Esperado:** 200, body `{ name: "", phone: "", email: "" }` (strings vazias, não null — facilita bind do `react-hook-form`)

**Critério:** **CA-36**

---

### EC-19 — Form fallback pré-preenchido mas user edita campos antes de submit

**Passos:**
1. Form abre pré-preenchido com `name='Kairo'`, `phone='11987654321'`
2. User edita `name='Alan'`
3. User submete

**Esperado:** `leads.name='Alan'` (overwrite via UPDATE), `phone` mantém `'11987654321'`. Sem warning de "lead já existe".

**Critério:** **CA-37**

---

## 5. Regressões prováveis

> Áreas que esta feature pode quebrar inadvertidamente. Todos esses
> cenários devem **continuar verdes** após a entrega.

### R-01 — Fluxo WhatsApp não-web inalterado

**Cenário:** Lead chega via WhatsApp (não-web). Verificar:
- `wa_id` populado normalmente (path antigo)
- `handoffToAgents` recebe `contactName` preferencialmente (commit `ef7b91a` já fez isso — não regrediu)
- `saveContactName/Whatsapp` NÃO são chamados (são tools de specialist web)

**Critério:** **CA-38**

---

### R-02 — Demais tools sem afetar

**Tools a testar (smoke):** `search_groups`, `simulate_quota`, `recommend_groups`, `present_group_card`, `present_comparison_table`, `present_value_picker`, `present_scenarios`, `present_topic_picker`, `present_financing_comparison`. Cada uma continua sendo invocada quando contexto permite. Suíte vitest existente deve passar.

**Critério:** **CA-39** (rodar `npm run test -- src/lib/agent/tools` e verificar 100% pass)

---

### R-03 — Lead-collection deterministic (form fallback) continua funcionando

**Cenário:** Usuário **não** capturado conversacionalmente (cenário legado). Clica "Tenho interesse" → `present_lead_form` → `runLeadCollectionTurn` itera nome → phone → email. **Stage inicial determinado por `initializeLeadCollection`** (passa por `'name'` se vazio, `'phone'` se só nome, `'email'` se name+phone). Smoke: cobertura por `lead-collection.test.ts`.

**Critério:** **CA-40**

---

### R-04 — `lead_events` populado em **toda** transição de stage

**Verificar:** Cada call de `transitionLeadStage` insere row em `lead_events` com `from_stage`, `to_stage`, `actor`, `created_at`. Não há transição "silenciosa".

**Query de validação:** após cenário P0-02, `SELECT COUNT(*) FROM lead_events WHERE lead_id = $1` ≥ 1 (engajado). Após P0-05, ≥ 2 (engajado + qualificado, se passou por engajado primeiro).

**Critério:** **CA-41**

---

### R-05 — Rate-limit em `/api/leads` continua ativo

**Passos:** Disparar > N requests em < 60s do mesmo IP → 429.
**Critério:** **CA-42** (verificar se `checkRateLimit` é chamado primeiro — código atual confirma).

---

### R-06 — Simulator (`SIM-<uuid>`) isolado

**Passos:** Conversation com `is_simulated=true`. `saveContactName` cria lead `is_simulated=true`. `saveContactWhatsapp` salva phone mas **não promove stage** (EC-08). Kanban admin ignora leads simulados.

**Critério:** **CA-43** (cobre B-02/B-03 anteriores)

---

### R-07 — Action handlers existentes não impactados

**Actions:** `category`, `gate (experience/consent/credit/timeframe/lance)`, `select-group`, `interest`. Cada uma continua emitindo o stream correto e persistindo metadata. Os 2 novos handlers (`whatsapp_optin`, `whatsapp_optin_decline`) **não** capturam fluxo dos outros (verificar ordem if/else em `route.ts`).

**Critério:** **CA-44**

---

### R-08 — Fluxo handed_off não regride

**Cenário:** Conversation `status='handed_off'`. Verificar que POST `/api/chat` ainda dispara `relayWebUserToAgent` (não cai em handlers de action novos). Path validado em `route.ts:143-174`.

**Critério:** **CA-45**

---

## 6. Pontos de falha conhecidos do domínio

> Heurísticas baseadas em bugs históricos do projeto. QA crítico deve
> ser **especialmente adversarial** nesses pontos.

### PF-01 — Agent não extrai primeiro nome corretamente

**Sintoma:** Tool call `save_contact_name(args.name="sou")` em vez de `"Kairo"`.
**Causa raiz:** Prompt depende do modelo Anthropic extrair direito; nenhum guard de código.
**Mitigação atual:** `saveContactName` faz `trim().split(/\s+/)[0]` mas isso só ajuda se o agent já mandar string razoável.
**Teste sugerido:** 10 conversações com variações coloquiais ("meu nome é X", "sou o X", "X aqui", "pode me chamar de X", "tô aqui, sou X") + assert que `args.name` no tool call é o nome real. Falha > 10% = FALHA.

---

### PF-02 — Anthropic API latency atrasa `save_contact_name`

**Sintoma:** Usuário responde nome, espera 5-10s, vê resposta sem nome usado.
**Causa raiz:** Tool call adiciona round-trip extra ao Claude → API.
**Mitigação:** Idealmente streaming intercala `save_contact_name` antes da resposta de texto.
**Teste:** Medir TTFB (`response.body.getReader().read()`) e tempo total até tool call resolvida. **Alvo: tool call < 3s após usuário enviar nome**. Critério não-bloqueante (informativo).

---

### PF-03 — Cookie `aja_uid` não dispara reconciliação na captura de WhatsApp

**Sintoma:** Web anônimo (cookie) vira identificado (phone) via opt-in, **mas reconciliação Letta só dispara no form fallback** (via `runLeadCollectionTurn` que chama `triggerReconciliationOnLeadCapture`). O handler de `whatsapp_optin` em `/api/chat` **NÃO chama reconciliação**.
**Decisão de design:** É um gap aceito nesta entrega OU um bug?
**Teste:** Após P0-02, query Letta: o agent identificado por phone **não tem memória do cookie anônimo**. Reportar se isso é problema.
**Critério:** **CA-46** — informativo + recomendar decisão de PO

---

### PF-04 — Container OrbStack DNS

**Sintoma:** Frontend não acessa `/api/chat`.
**Pré-checagem:** `curl http://aja-agora-feat-improving-web-conversation.orb.local/api/health` deve retornar 200 antes de rodar E2E.

---

### PF-05 — happy-dom limitations em testes de form

**Sintoma:** `useEffect` + `fetch` em `LeadForm` pode não disparar em happy-dom.
**Mitigação:** Mock `global.fetch` em testes de component para garantir pré-preenchimento testável.

---

### PF-06 — Race entre `lead_form` artifact e `initializeLeadCollection`

**Sintoma:** Usuário clica "Tenho interesse" 2x rapidamente; ambas chamadas detectam `lead_form` artifact e chamam `initializeLeadCollection` + `persistMeta`. Segundo `persistMeta` pode sobrescrever atualizações concorrentes.
**Teste:** Disparar 2 actions `interest` em paralelo, verificar que `meta.leadCollection` está consistente (não corrompido).

---

### PF-07 — Tool `present_whatsapp_optin` sem guard real

**Já levantado em EC-07.** Reforçando: o execute da tool retorna apenas texto. O guard depende 100% do system prompt instruir o modelo. **Falha de prompt = card duplicado**. QA adversarial: forçar o agent a re-chamar via conversa manipulada.

---

## 7. Dados de teste necessários (fixtures/seeds)

### 7.1 Conversations

| Nome | Setup |
|------|-------|
| `convFresh` | `INSERT INTO conversations DEFAULT VALUES` (sem contactName, sem lead) |
| `convNamed` | Acima + `saveContactName(id, 'Kairo')` |
| `convEngaged` | `convNamed` + `saveContactWhatsapp(id, '11987654321')` |
| `convQualified` | `convEngaged` + POST `/api/leads` form submit |
| `convSimulated` | `INSERT INTO conversations (is_simulated) VALUES (true)` |
| `convHandedOff` | `convQualified` (status atualiza via `handoffToAgents` mock ou real) |

### 7.2 Mocks

```ts
vi.mock("@/lib/whatsapp/proxy", () => ({
  handoffToAgents: vi.fn().mockResolvedValue(undefined),
  relayWebUserToAgent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
}));
vi.mock("@/lib/memory/index", () => ({
  getMemoryAdapter: () => ({ /* stub */ }),
}));
vi.mock("@/lib/memory/reconciler", () => ({
  reconcileIdentity: vi.fn().mockResolvedValue({ success: true }),
}));
```

### 7.3 Variações de nome (EC-02)

`["José", "Jean-Luc", "D'Angelo", "Álvaro", "Müller", "alan", "ALAN"]`

### 7.4 Variações de phone (EC-04, EC-05)

```js
const validPhones = [
  "11987654321",
  "(11) 98765-4321",
  "+55 11 98765 4321",
  "5511987654321",
  "1133334444",      // fixo
];
const invalidPhones = [
  "",
  "987654321",         // sem DDD
  "01987654321",       // DDD começa 0
  "abc",
  "123",
  "55119876543210",    // 13 dígitos
];
```

### 7.5 Variações de nome livres (PF-01 adversarial)

```
"sou o Kairo"           → expect args.name === "Kairo"
"me chamo Alan Carlos"  → expect args.name === "Alan"
"pode me chamar de Bia" → expect args.name === "Bia"
"João"                  → expect args.name === "João"
"meu nome é Maria"      → expect args.name === "Maria"
"Kairo aqui"            → expect args.name === "Kairo"
"oi sou a Ana"          → expect args.name === "Ana"
"é o Tiago"             → expect args.name === "Tiago"
"Pedro Souza, prazer"   → expect args.name === "Pedro"
"sou Roberta da Silva"  → expect args.name === "Roberta"
```

---

## 8. Critérios de aceite (binários — passa/não passa)

> 46 critérios. Cada um é verificável **mecanicamente** (query SQL,
> assertion em response, presença/ausência de evento). Falha em qualquer
> CA-0X marcado como **P0** = release bloqueado.

### Captura de nome — P0

- **CA-01** Após user responder "Kairo" ao pedido de nome, tool call
  `save_contact_name` aparece no stream de mensagens, com
  `args.name === "Kairo"`.
- **CA-02** Após CA-01, `SELECT name, stage FROM leads WHERE conversation_id = $1`
  retorna `name='Kairo'` e `stage='novo'`.
- **CA-03** Após CA-01, `SELECT contact_name FROM conversations WHERE id = $1`
  retorna `'Kairo'`.
- **CA-04** Após CA-01, `SELECT COUNT(*) FROM lead_events WHERE lead_id = $1`
  retorna `≥ 1` com `to_stage='novo'`.

### Card WhatsApp opt-in — P0

- **CA-05** Após `simulation_result` ser apresentado, artifact
  `whatsapp_optin` aparece em **algum dos próximos 2 turnos** do agent
  (não imediatamente requerido, mas em até 2 turnos).
- **CA-06** Antes de `simulation_result` aparecer no stream, **nenhum**
  artifact `whatsapp_optin` é emitido em 5 turnos iniciais.
- **CA-07** Clicar "Quero receber" com input `"(11) 98765-4321"` dispara
  POST `/api/chat` com body
  `{ action: { kind: 'whatsapp_optin', phone: '11987654321' } }`.
- **CA-08** Após CA-07, `SELECT phone, stage FROM leads WHERE conversation_id = $1`
  retorna `phone='11987654321'`, `stage='engajado'`.
- **CA-09** Após CA-07, `metadata.whatsappOptinShown === true` na linha
  de `conversations` (parse do JSONB).

### Recusa WhatsApp — P0

- **CA-10** Clicar "Agora não" dispara POST `/api/chat` com
  `{ action: { kind: 'whatsapp_optin_decline' } }` e response contém
  texto não-vazio de seguimento (regex `/sem problema|seguimos|por aqui/i`).
- **CA-11** Após CA-10, `metadata.whatsappOptinShown===true` E
  `metadata.whatsappOptinDeclined===true`. `leads.phone` permanece NULL.

### Form fallback pré-preenchimento — P0

- **CA-12** `GET /api/leads/<convId>` retorna 200 com schema
  `{ name: string, phone: string, email: string }` (strings sempre, nunca null/undefined).
- **CA-13** Quando lead tem `name='Kairo'` + `phone='11987654321'`, o
  form fallback renderiza `<input name="name" value="Kairo">` e
  `<input name="phone" value="11987654321">` **antes** do primeiro
  digit do usuário.

### Form fallback submit — P0

- **CA-14** POST `/api/leads` com `email=""` (string vazia) e `phone` válido
  retorna 200 e persiste `email IS NULL` no DB.
- **CA-15** Após CA-14, `leads.stage='qualificado'` E
  `handoffToAgents` foi chamado (mock spy verifica 1 call).

### Idempotência — P0

- **CA-16** 2 POSTs `/api/chat whatsapp_optin` paralelos com mesmo phone
  resultam em `COUNT(*) FROM leads WHERE conversation_id = $1 = 1`.
- **CA-17** Após CA-16, `COUNT(*) FROM lead_events WHERE to_stage='engajado'`
  retorna `1` (exato, não ≥ 1).

### Validações de nome — edge

- **CA-18** `saveContactName(convId, "")` retorna `{ ok: false, error: "name_invalid" }`. Nenhuma row em `leads`. `contact_name` permanece NULL.
- **CA-19** `saveContactName(convId, "K")` retorna `{ ok: false, error: "name_invalid" }`. `saveContactName(convId, "A".repeat(31))` idem. `saveContactName(convId, "Kairo123")` idem.
- **CA-20** `saveContactName(convId, "Jean-Luc")` retorna `{ ok: true }` e persiste `name='Jean-Luc'`. Idem `"José"`, `"D'Angelo"`, `"Müller"`.
- **CA-21** Em 8/10 conversações reais com variações coloquiais (ver §7.5), tool call args contém **apenas o primeiro nome real** (não preposição, não saudação). Falha > 20% = FALHA.

### Validações de phone — edge

- **CA-22** No card UI, botão "Quero receber" tem `disabled=true` para
  todos os inputs em `invalidPhones` (§7.4) e `disabled=false` para todos
  em `validPhones`.
- **CA-23** `saveContactWhatsapp(convId, raw)` retorna `phone` normalizado
  igual ao esperado para cada entrada de `validPhones`; retorna
  `{ ok: false, error: 'phone_invalid' }` para cada `invalidPhones`.

### Form fallback — edge

- **CA-24** POST `/api/leads` `{ name: 'X', phone: '', email: '' }` retorna
  status 400 com `details[].path` contendo `'phone'`.

### Guard de duplicação `present_whatsapp_optin` — edge

- **CA-25** Após `metadata.whatsappOptinShown===true`, **nenhum** novo
  artifact `whatsapp_optin` é emitido no stream, mesmo se o agent tentar
  chamar a tool de novo. *(Se o guard não existe, esta CA marca a feature
  como incompleta — bug bloqueador.)*

### Simulator isolation — edge

- **CA-26** Em conversation `is_simulated=true`, após
  `saveContactWhatsapp` ser chamado, `leads.stage` permanece `'novo'`
  (não promove).

### Recusa de nome — edge

- **CA-27** Em 5 conversações com user recusando o nome 2x ("não quero",
  "depois"), agent insiste **no máximo 1 vez** e segue conversa sem
  travar. Nenhuma row em `leads` é criada. Em 0/5 o agent insiste 3x ou
  trava.

### Race conditions — edge

- **CA-28** `Promise.all([saveContactName(c,'A'), saveContactName(c,'B')])`
  resulta em `COUNT(*) FROM leads = 1`. Nenhum 500 ou deadlock.

### Mudança de ideia / opt-in tardio — edge

- **CA-29** Após decline (`whatsappOptinDeclined=true`) + submit do form
  com phone, `leads.phone` é preenchido, `metadata.whatsappOptinDeclined`
  **continua true** (audit trail preservado).

### Stage forward-only — edge

- **CA-30** `saveContactWhatsapp` em lead já `'qualificado'` atualiza
  `phone` mas **não** insere row em `lead_events` (nem regride stage).

### Ordering de tools — edge adversarial

- **CA-31** Em 5 conversações iniciais (até primeira simulação),
  artifact `whatsapp_optin` aparece em 0/5 antes de `simulation_result`.

### Cookie / identidade — edge

- **CA-32** POST `/api/chat` sem cookie `aja_uid` gera novo cookie
  (Set-Cookie no response). Captura de nome funciona normalmente.

### Validações de UUID — regressão

- **CA-33** POST `/api/chat` com `conversationId="test-qa-001"` retorna
  400 com `{ error: "Invalid conversationId" }`.
- **CA-34** `GET /api/leads/not-a-uuid` retorna 400.
- **CA-35** `GET /api/leads/<uuid-of-nonexistent-conv>` retorna 404.

### Pré-preenchimento edge — edge

- **CA-36** `GET /api/leads/<convId-sem-lead-nem-contactName>` retorna
  200 com `{ name: "", phone: "", email: "" }` (strings vazias).
- **CA-37** Form pré-preenchido + user edita nome + submit → DB tem nome
  editado, phone original mantido. 1 row em `leads`.

### Regressões — não-feature

- **CA-38** Fluxo WhatsApp não-web (lead criado direto no `wa_id`)
  continua passando — suite `whatsapp/*.test.ts` 100% verde.
- **CA-39** `npm run test -- src/lib/agent/tools` retorna 100% pass.
- **CA-40** Suite `lead-collection.test.ts` 100% verde (deterministic
  path do form fallback).
- **CA-41** Após P0-02 + P0-05, `SELECT COUNT(*) FROM lead_events WHERE lead_id = $1`
  ≥ 2 (engajado + qualificado).
- **CA-42** 31 POSTs `/api/leads` em < 60s do mesmo IP retornam pelo
  menos 1 status 429 (rate-limit padrão).
- **CA-43** `is_simulated=true` em conversation cria lead com
  `is_simulated=true`; lead não aparece em queries do kanban admin que
  filtram simulados.
- **CA-44** Actions legadas (`category`, `gate.*`, `select-group`,
  `interest`) continuam funcionando — smoke test cobrindo cada handler
  retorna 200 + stream esperado.
- **CA-45** Conversation `status='handed_off'` + POST `/api/chat` com
  user message dispara `relayWebUserToAgent` (mock spy) — handlers
  `whatsapp_optin*` não interceptam.

### Identidade / reconciliação — informativo

- **CA-46** *(Decisão de PO)* Após `save_contact_whatsapp` via card,
  decidir se: (a) reconciliação Letta deve disparar agora (paridade com
  form fallback); ou (b) é OK reconciliar só no form. **QA crítico
  reporta o comportamento observado e PO decide.**

---

## 9. Output esperado por cenário

### 9.1 Estado de DB esperado

#### Após P0-01 (nome capturado)

```sql
-- conversations
SELECT contact_name, metadata FROM conversations WHERE id = $1;
-- → contact_name = 'Kairo', metadata = {} (ou metadata pré-existente)

-- leads
SELECT id, name, phone, email, stage, is_simulated FROM leads WHERE conversation_id = $1;
-- → 1 row: { name: 'Kairo', phone: NULL, email: NULL, stage: 'novo', is_simulated: false }

-- lead_events
SELECT from_stage, to_stage, actor_type FROM lead_events WHERE lead_id = $1 ORDER BY created_at;
-- → 1 row: { from_stage: NULL, to_stage: 'novo', actor_type: 'system' }
```

#### Após P0-02 (WhatsApp aceito)

```sql
SELECT contact_name, wa_id, metadata FROM conversations WHERE id = $1;
-- → contact_name = 'Kairo', wa_id = '11987654321',
--    metadata @> '{"whatsappOptinShown": true}'

SELECT name, phone, stage FROM leads WHERE conversation_id = $1;
-- → { name: 'Kairo', phone: '11987654321', stage: 'engajado' }

SELECT to_stage FROM lead_events WHERE lead_id = $1 ORDER BY created_at;
-- → ['novo', 'engajado']
```

#### Após P0-03 (WhatsApp recusado)

```sql
SELECT metadata FROM conversations WHERE id = $1;
-- → metadata @> '{"whatsappOptinShown": true, "whatsappOptinDeclined": true}'

SELECT phone, stage FROM leads WHERE conversation_id = $1;
-- → { phone: NULL, stage: 'novo' }
```

#### Após P0-05 (form fallback submetido)

```sql
SELECT name, phone, email, stage FROM leads WHERE conversation_id = $1;
-- → { name: 'Kairo', phone: '11987654321', email: NULL (se vazio) ou 'k@a.com', stage: 'qualificado' }

SELECT status FROM conversations WHERE id = $1;
-- → 'handed_off' (se handoff disparou) ou 'active' (se mock)
```

### 9.2 Payload de API esperado

#### POST `/api/leads` (sucesso)

```json
{ "ok": true, "leadId": "<uuid>" }
```

#### POST `/api/leads` (validação falhou)

```json
{
  "ok": false,
  "error": "Validation failed",
  "details": [
    { "path": ["phone"], "message": "WhatsApp é obrigatório", ... }
  ]
}
```

#### GET `/api/leads/<convId>` (com dados)

```json
{ "name": "Kairo", "phone": "11987654321", "email": "" }
```

#### GET `/api/leads/<convId>` (vazio)

```json
{ "name": "", "phone": "", "email": "" }
```

### 9.3 UI esperada (screenshots obrigatórios)

QA deve capturar **screenshots** dos seguintes estados:

1. Card `whatsapp_optin` renderizado com input vazio + botões (estado inicial)
2. Card com input preenchido `(11) 98765-4321` + botão Quero **habilitado**
3. Card com input parcial `(11) 9` + botão Quero **desabilitado**
4. Card após clique Quero — estado "Anotado ✓" + input disabled
5. Card após clique Agora não — estado "Sem problema" + tudo disabled
6. Form fallback pré-preenchido com nome+phone (campos NÃO vazios na primeira renderização)
7. Form fallback com erro de validação no phone (texto vermelho `"Telefone inválido"`)
8. Mensagem do agent após captura de nome usando o nome ("Beleza, Kairo...")
9. Mensagem do agent após opt-in WhatsApp ("Show, Kairo! Anotei seu WhatsApp...")

### 9.4 Stream SSE esperado (formato AI SDK)

Eventos no stream após user envia nome:

```
data: {"type":"tool-call","toolName":"save_contact_name","args":{"conversationId":"...","name":"Kairo"}}
data: {"type":"tool-result","toolName":"save_contact_name","result":"[Nome 'Kairo' salvo...]"}
data: {"type":"text-start","id":"..."}
data: {"type":"text-delta","id":"...","delta":"Beleza, Kairo..."}
data: {"type":"text-end","id":"..."}
```

QA deve interceptar e validar a **sequência exata** (tool call ANTES de text-delta com nome).

---

## 10. Métricas que o QA deve coletar

### 10.1 Performance

| Métrica | Como medir | Alvo (informativo) |
|---------|------------|---------------------|
| Tempo total P0-01 (user envia nome → tool result) | `Date.now()` em duas pontas | < 3s |
| Tempo total P0-02 (clique Quero → response server) | Idem | < 1s (sem chamada Anthropic — só DB) |
| Tempo GET `/api/leads/<id>` | Idem | < 200ms |
| TTFB POST `/api/chat` | `response.headers.get('X-Response-Time')` se exposto | < 500ms |

### 10.2 Custos / tokens

- Tokens Anthropic consumidos por conversação completa (P0-01 → P0-05)
- Quantidade de tool calls por conversação (esperado: 1× `save_contact_name`,
  1× `present_whatsapp_optin`, 1× `save_contact_whatsapp`, 1× `present_simulation_result`,
  1× `present_recommendation_card`, 1× `present_lead_form`)

### 10.3 Cobertura por critério

| Critério | Status | Evidência | Notas |
|----------|--------|-----------|-------|
| CA-01    | □ pass / □ fail | log/SQL/screenshot | |
| CA-02    | □ pass / □ fail | | |
| ...      | ...             | | |
| CA-46    | □ pass / □ fail | | |

### 10.4 Adversarial — quantitativo

- PF-01: % de conversas (de 10) em que `args.name` da tool é exatamente
  o nome real (sem `"sou"`, `"meu"`, etc.). **Meta ≥ 80%.**
- EC-13: % de conversas (de 5) em que `whatsapp_optin` aparece antes de
  `simulation_result`. **Meta = 0%.**
- EC-09: % de conversas (de 5) em que agent trava ou insiste 3x quando
  user recusa nome. **Meta = 0%.**

### 10.5 Cleanup obrigatório

Após CADA cenário, o teste deve:
1. `DELETE FROM lead_events WHERE lead_id IN (SELECT id FROM leads WHERE conversation_id = $1)`
2. `DELETE FROM leads WHERE conversation_id = $1`
3. `DELETE FROM messages WHERE conversation_id = $1`
4. `DELETE FROM conversations WHERE id = $1`
5. Resetar mocks (`vi.clearAllMocks()`)
6. Não deixar `metadata.whatsappOptinShown` em outras conversations
7. Não vazar cookies entre cenários (`page.context().clearCookies()` em Playwright)

### 10.6 Relatório final esperado

QA crítico deve entregar `docs/test-plans/lead-capture-web-QA-report.md` contendo:

1. Tabela de critérios (10.3) preenchida
2. Tempo médio e p95 por cenário (10.1)
3. Screenshots dos 9 estados (9.3) anexados ou linkados
4. Lista de **falhas** com:
   - Critério violado (CA-NN)
   - Evidência (query SQL output / screenshot / log do agent)
   - Passos pra reproduzir
   - Severidade (P0 / P1 / P2)
5. Lista de **bugs de produto** descobertos fora do plano (extra credit)
6. Decisão sobre **CA-46** (reconciliação Letta no opt-in: sim/não/depois)
7. Recomendação binária final: **APROVADO** / **REPROVADO**

---

## 11. Definição de "feito"

A feature está pronta para deploy **somente quando**:

- [ ] Todos os P0 (CA-01 a CA-17) passam
- [ ] Todos os edge cases (CA-18 a CA-37) passam **OU** são triados como
      "não-bloqueador" com justificativa escrita
- [ ] Todas as regressões (CA-38 a CA-45) passam (zero tolerância)
- [ ] CA-46 tem decisão registrada (não pode ficar em aberto)
- [ ] Cleanup confirmado em todos os cenários (sem leak de dados)
- [ ] Screenshots dos 9 estados anexados
- [ ] Adversarial PF-01 ≥ 80%, EC-13 = 0%, EC-09 = 0%
- [ ] Relatório QA escrito e commitado em
      `docs/test-plans/lead-capture-web-QA-report.md`

**Nada negociável aqui.** Se algum item está vermelho, a feature não é
"done" — volta pra implementação ou pra decisão de PO. Não fechar com
"funciona quase tudo".
