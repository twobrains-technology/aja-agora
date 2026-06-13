---
feature: Comando oculto /reset no chat web (paridade com WhatsApp)
slug: reset-web
date: 2026-06-11
author: PO Lead (skill QA sênior)
status: ready-for-qa
branch: feat/jornada-bevi-lance-embutido
references:
  - src/lib/whatsapp/processor.ts (L45-55 — /reset WhatsApp, fonte de paridade)
  - src/app/api/chat/route.ts (L195-203, L876-887 — cookie aja_uid lazy + Set-Cookie)
  - src/lib/memory/identity.ts (COOKIE_NAME, COOKIE_MAX_AGE_SECONDS, generateCookieValue, identityFromCookie/identityFromWaId)
  - src/lib/conversation/identity.ts (loadIdentity → { cpf, celular } cifrado)
  - src/lib/memory/adapter.ts + letta-adapter.ts + noop-adapter.ts (MemoryAdapter, novo purgeIdentity)
  - src/lib/memory/index.ts (getMemoryAdapter, circuit breaker → Noop)
  - src/lib/chat/provider.tsx (reset() L193-198, novo resetAll())
  - src/components/chat/chat-input.tsx (handleSend L29-40 — interceptação client-side)
  - src/db/schema.ts (cascades)
---

# Test Plan — Comando oculto `/reset` no chat web

> Contrato entre PO Lead e QA crítico. **Critério de aceite binário (CA-NN) =
> fonte de verdade do "feito".** Cenários P0 são gate de release. Edge cases
> são gate de qualidade. Critério não escrito = critério não validado.

---

## 1. Escopo

### 1.1 O que a feature entrega

Comando textual **oculto** `/reset` no input do chat web, paridade com o
`/reset` que já existe no WhatsApp (`processor.ts:45-55`). Quatro camadas:

1. **Interceptação client-side (chat-input.tsx / provider).** `/reset`
   (match exato após `trim().toLowerCase()`) **NUNCA** vira mensagem: não
   chama `sendUserMessage`, não entra no `useChat`, não vai pro `POST
   /api/chat`, não é persistido. Em vez disso dispara `provider.resetAll()`.
2. **Backend `POST /api/chat/reset`.** Recebe `{ conversationId }` + cookie
   `aja_uid`. Sequência **ordenada**:
   - **(a) loadIdentity ANTES do delete** — lê `{ cpf, celular }` da conversa
     (cifrado em `metadata.identityEnc`) enquanto a row ainda existe.
   - **(b) DELETE da conversa** — `db.delete(conversations).where(id)`,
     cascateia messages→artifacts, leads→leadEvents, leadInsights,
     beviProposals, conversationEvaluations. `memoryEvents.conversationId`
     **SET NULL** (não deleta a row de auditoria).
   - **(c) purge Letta best-effort** — `purgeIdentity(anon-cookie)` do cookie
     atual **E** `purgeIdentity(phone)` do celular salvo (quando havia
     identity). Falha de Letta é engolida (não derruba o reset).
   - **(d) regenera cookie** — novo `aja_uid` via `generateCookieValue()`,
     `Set-Cookie` HttpOnly, SameSite=Lax, Path=/, Max-Age 90d.
3. **Frontend `provider.resetAll()`** — chama a rota, espera resposta, e
   depois executa o `reset()` local existente (zera mensagens, gera novo
   `conversationId`, limpa handoff). Welcome zerado.
4. **`MemoryAdapter.purgeIdentity(identity)`** — novo método:
   - **Letta:** `findAgent(identity)` → se existe, `DELETE /v1/agents/{id}`
     + `recordMemoryEvent({ eventType: "purged", payload: { reason: "user_reset" } })`.
     Se não existe → no-op silencioso. Erro transiente (rede/5xx/timeout) →
     engolido + log warn (write-side semantics).
   - **Noop:** no-op puro.

### 1.2 Característica definidora: comando OCULTO

- Sem botão na UI. Sem item de menu. Sem toast. Sem texto de ajuda.
- Sem auth (mesmo modelo do `/reset` WhatsApp). Dano limitado ao próprio
  estado do solicitante — quem manda `/reset` só apaga a própria conversa
  e a própria memória.
- Funciona em prod.

### 1.3 Fora de escopo (NÃO testar como requisito)

- Reset de conversas WhatsApp via comando web (ver decisão §6.4 —
  a memória **phone** é purgada, mas rows WhatsApp no DB NÃO são tocadas).
- Undo / confirmação. `/reset` é destrutivo e imediato por design.
- Rate limit dedicado da rota `/reset` (herda o do chat se aplicável;
  não é requisito desta feature).

---

## 2. Dados de teste

### 2.1 Identity FAKE (automatizado — INVIOLÁVEL)

> **NUNCA CPF real em fixture.** CPF real autorizado só em E2E manual pelo
> operador (§8). Testes automatizados usam CPF sintético válido pelo
> algoritmo de DV (passa `isValidCpf`) mas que não pertence a ninguém.

| Campo | Valor de teste | Observação |
|---|---|---|
| CPF fake | `390.533.447-05` | DV válido por módulo 11, sintético. Confirmar `isValidCpf("39053344705") === true` no setup; se algum dia colidir com cadastro real, trocar por outro DV-válido gerado. |
| Celular fake | `11999990000` | dígitos; normaliza pra `+5511999990000`. |
| `IDENTITY_ENC_KEY` | chave de teste (32 bytes base64) | já no `.env.test`; `storeIdentity` exige. |
| Cookie antigo | `aaaa1111bbbb2222cccc3333dddd4444` | hex 32 chars, passa `identityFromCookie`. |

### 2.2 Setup de estado (via API/DB, NUNCA via UI)

- **Conversa no meio do funil:** insert `conversations` + `messages` (2-3
  turnos) + `metadata` com gates parciais (`qualifyAnswers` incompleto, sem
  `identityCollected`).
- **Conversa pós-identify:** acima + `storeIdentity(convId, { cpf, celular })`
  → `metadata.identityCollected=true`, `metadata.identityEnc` presente.
- **Conversa com proposta Bevi:** acima + insert `beviProposals` (proposalId
  fake, `conversationId` = convId) + `leads` row.
- **Letta:** controlado por `MEMORY_ADAPTER=noop` (purge é no-op observável)
  ou `LettaMemoryAdapter` com `lettaFetch` stubado (cassette/spy) pros
  cenários que exigem assert no DELETE. Letta REAL só no E2E manual.

### 2.3 Camadas de teste exigidas (regra do CLAUDE.md)

- **Camada 1 (structural, todo PR):** asserts no source de produção
  (`*.test.ts` ao lado do código). Ex.: rota existe e exporta `POST`;
  `purgeIdentity` no contrato `MemoryAdapter`; `chat-input` contém o guard
  `/reset`; provider expõe `resetAll`.
- **Camada 2 (cassette, todo PR):** `tests/regression/agent-trajectory.test.ts`
  — cassette garantindo que `/reset` **não** dispara turno de agente (nenhum
  tool-call, nenhuma mensagem ao LLM).
- **Integration (DB real):** rota `/api/chat/reset` contra Postgres de teste —
  cascade, loadIdentity-antes-do-delete, cookie regenerado.
- **E2E Playwright:** fluxo de UI (digitar `/reset`, welcome zera, cookie no
  browser troca).

---

## 3. Cenários P0 (gate de release)

### P0-1 — Happy path: reset no meio do funil (gates parciais)

**Setup:** conversa web ativa, 3 turnos, `metadata.qualifyAnswers` parcial,
SEM identity coletada. Cookie `aja_uid=<old>` presente.

**Ação:** usuário digita `/reset` e envia.

**CA-1.1** — A string `/reset` **não** aparece em `messages` (query:
`SELECT count(*) FROM messages WHERE conversation_id=<old> AND content ILIKE '%/reset%'` = `0`). Nenhum `POST /api/chat` é disparado por esse input.
**CA-1.2** — `POST /api/chat/reset` retorna **HTTP 200** com body JSON
`{ ok: true }` (ou `{ reset: true }` — fixar contrato; ver §7).
**CA-1.3** — Conversa antiga deletada: `SELECT count(*) FROM conversations WHERE id=<old>` = `0`.
**CA-1.4** — Cascade: `messages`, `artifacts`, `leads`, `lead_events` da `<old>` = `0` linhas.
**CA-1.5** — Cookie regenerado: response tem `Set-Cookie: aja_uid=<new>; ...`
com `<new>` ≠ `<old>`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Max-Age=7776000` (90d). `<new>` casa `^[a-f0-9]{32}$`.
**CA-1.6** — Frontend: após resposta, `messages` no provider = `[]`,
`conversationId` mudou (novo UUID), tela mostra welcome zerado.

**Output esperado:** DB sem a conversa antiga; 1 cookie novo no jar; UI welcome.

---

### P0-2 — Reset pós-identify + re-identificação com o MESMO celular (memória phone NÃO ressuscita)

> **O cenário mais crítico de privacidade.** Se a memória phone sobreviver,
> o "reset profundo" é uma mentira.

**Setup:** conversa pós-identify com `storeIdentity(cpf_fake, celular_fake)`.
Identity phone tem agent Letta com archival (block `human` populado).
Cookie `aja_uid=<old>`.

**Ação:** `/reset` → depois nova conversa onde o usuário re-informa o **mesmo**
celular fake (re-identify).

**CA-2.1** — `loadIdentity` foi chamado **ANTES** do delete (asserção de ordem:
spy/log confirma `loadIdentity(convId)` resolveu com `{ celular }` não-nulo
antes de `db.delete`). Sem isso, o purge phone não teria alvo.
**CA-2.2** — `purgeIdentity` chamado **2x**: uma com identity `anon-cookie`
(do `<old>`), uma com identity `phone` (`+5511999990000`).
**CA-2.3** — No Letta (stub): `DELETE /v1/agents/{id}` emitido para o agent
do **phone** E para o agent do **cookie** (quando existiam). Para os que não
existiam → nenhum DELETE, sem erro.
**CA-2.4** — `memory_events` ganhou linha(s) `event_type='purged'` com
`payload.reason='user_reset'` (query: `SELECT count(*) FROM memory_events WHERE event_type='purged'` ≥ nº de agents que existiam).
**CA-2.5** — Re-identify com o mesmo celular: o `loadContext` da nova conversa
**não** retorna o archival antigo (agent foi deletado → `findAgent` null →
`loadContext` null OU agent recriado vazio). Assert: bloco `human` da nova
identidade phone **não** contém os fatos da sessão pré-reset.

**Output esperado:** agent phone destruído; re-identify começa do zero;
`memory_events` registra o purge.

---

### P0-3 — `/reset` com variações de caixa/espaços

**Setup:** conversa web ativa qualquer.

| Input | Intercepta? | Vira mensagem normal? |
|---|---|---|
| `/reset` | SIM | não |
| ` /reset ` (espaços) | SIM | não |
| ` /RESET ` (maiúsc + espaços) | SIM | não |
| `/Reset` | SIM | não |
| `/resetar` | **NÃO** | SIM |
| `reset` (sem barra) | **NÃO** | SIM |
| `/reset agora` | **NÃO** | SIM |

**CA-3.1** — Para cada linha "Intercepta? SIM": `POST /api/chat/reset`
disparado, `POST /api/chat` **não** disparado, conversa deletada.
**CA-3.2** — Para cada linha "Intercepta? NÃO": `POST /api/chat/reset`
**não** disparado; o texto vira mensagem normal (`POST /api/chat` recebe o
texto literal **sem** trim destrutivo do conteúdo de negócio) e é
persistido em `messages`.
**CA-3.3** — A normalização é `raw.trim().toLowerCase() === "/reset"`
(match **exato**), espelhando `processor.ts:45`. Substring/prefix NÃO contam.

**Output esperado:** só o match exato reseta; o resto flui pro agente.

---

### P0-4 — Letta indisponível: purge falha silenciosa, reset COMPLETA

**Setup:** conversa pós-identify. Letta forçado a falhar — `MEMORY_ADAPTER`
em modo circuit-open (Noop) OU `lettaFetch` stubado pra `throw` em
`findAgent`/`DELETE`.

**Ação:** `/reset`.

**CA-4.1** — Rota retorna **HTTP 200** mesmo com Letta caído (purge é
best-effort; exceção engolida, log warn).
**CA-4.2** — DELETE da conversa **aconteceu** (DB limpo) — purge falho NÃO
bloqueia o delete nem o cookie.
**CA-4.3** — Cookie novo emitido normalmente.
**CA-4.4** — Com Noop: `purgeIdentity` é no-op puro, **sem** `memory_events`
de purge e **sem** throw.

**Output esperado:** reset transacionalmente completo no DB+cookie; memória
fica como deu (purge tentado, falhou, seguiu).

---

### P0-5 — `/reset` digitado DURANTE streaming ativo

> Race conhecida: stream do turno anterior ainda gravando enquanto o reset
> apaga a conversa.

**Setup:** conversa com um turno em `status:"streaming"` (agente respondendo).

**Ação:** usuário digita `/reset` no meio do streaming.

**CA-5.1** — O input `/reset` é interceptado mesmo durante streaming. Decisão
de produto a fixar e testar (ver §6.1): **recomendação** = `resetAll` aborta
o stream em curso (`chat.stop()` / abort do transport) ANTES de chamar a rota.
Assert: nenhuma mensagem nova do stream abortado é persistida na conversa
**nova** após o reset.
**CA-5.2** — Não há erro não-tratado no console nem promise rejeitada
(o abort do stream é limpo).
**CA-5.3** — A conversa **antiga** (alvo do delete) some inteira, inclusive a
mensagem parcial do assistant que estava sendo gravada (cascade pega
`messages` da `<old>`).
**CA-5.4** — A conversa **nova** começa vazia (welcome), sem vazamento de
tokens do stream abortado.

**Output esperado:** stream interrompido, conversa antiga deletada por
completo, nova conversa limpa, zero exceção solta.

---

## 4. Cenários P1 (gate de qualidade)

### P1-1 — Reset em conversa vazia / recém-aberta (sem conversationId persistido)

**Setup:** chat web recém-montado. `conversationId` é UUID gerado client-side
(`generateId()`) que **ainda não existe** no DB (nenhum turno enviado).

**Ação:** `/reset` como primeiríssima interação.

**CA-6.1** — Rota retorna **HTTP 200** mesmo sem row no DB (`db.delete` com
`where id=<convId-inexistente>` afeta 0 linhas — não é erro). Espelha o
guard `if (conv)` do WhatsApp (`processor.ts:49`).
**CA-6.2** — `loadIdentity(convId-inexistente)` retorna `null` sem throw;
purge phone é pulado (sem celular).
**CA-6.3** — Cookie novo ainda é emitido (reset do anon-cookie faz sentido
mesmo sem conversa — o usuário pode ter agent anon de turnos anteriores nessa
sessão de cookie).
**CA-6.4** — UI volta pro welcome com novo `conversationId`.

---

### P1-2 — Conversa com proposta Bevi vinculada (beviProposals some)

**Setup:** conversa com `beviProposals` row (proposalId fake) + `leads` row.

**Ação:** `/reset`.

**CA-7.1** — `SELECT count(*) FROM bevi_proposals WHERE conversation_id=<old>` = `0`
(cascade `onDelete: cascade` em `beviProposals.conversationId`).
**CA-7.2** — `leads` da conversa também = `0` (cascade direto).
**CA-7.3** — Rota 200, cookie novo, sem erro de FK.

> Nota: `beviProposals.leadId` é `set null`, mas como a `leads` row some junto
> (cascade da conversa), não há órfão. Confirmar que a ordem de cascade do
> Postgres não gera violação transiente.

---

### P1-3 — Cookie ausente na request (primeiro acesso / cookie limpo)

**Setup:** request `POST /api/chat/reset` SEM cookie `aja_uid` (browser
novo, ou usuário limpou cookies).

**Ação:** `/reset`.

**CA-8.1** — Rota não quebra com cookie ausente (`req.cookies.get(COOKIE_NAME)`
= `undefined` → purge anon-cookie pulado, sem throw). Espelha o lazy-create
do chat (`route.ts:198-203`).
**CA-8.2** — Cookie novo é **gerado e emitido** (`Set-Cookie` presente) — o
reset estabelece um cookie limpo mesmo sem um anterior.
**CA-8.3** — Se a conversa existir e tiver identity, o purge **phone** ainda
roda (independe do cookie).
**CA-8.4** — HTTP 200.

---

### P1-4 — Duplo `/reset` consecutivo (idempotência)

**Setup:** conversa ativa.

**Ação:** `/reset`, espera 200, `/reset` de novo (agora a conversa já é a
nova, vazia).

**CA-9.1** — 1º reset: deleta conversa, cookie `<c1>`.
**CA-9.2** — 2º reset: rota 200 de novo (conversa nova é vazia/inexistente no
DB → delete afeta 0 linhas, sem erro), cookie `<c2>` ≠ `<c1>`.
**CA-9.3** — 2º reset purga o agent anon do cookie `<c1>` (que foi usado entre
os dois resets) — purge encadeia corretamente.
**CA-9.4** — Nenhum estado órfão, nenhuma exceção, UI welcome estável.

---

## 5. Regressões prováveis (não quebrar o que existe)

### REG-1 — `/reset` WhatsApp continua funcionando

**CA-R1** — Após introduzir `purgeIdentity` e a rota web, o `/reset` do
WhatsApp (`processor.ts:45-55`) segue deletando a conversa e respondendo
"🔄 Conversa resetada...". Idealmente o WhatsApp **também** passa a chamar
`purgeIdentity` (consistência), mas se ficar fora de escopo, no mínimo NÃO
regride. Cassette existente do WhatsApp permanece verde.

### REG-2 — Chat normal não interceptado por engano

**CA-R2** — Mensagens legítimas que **contêm** "reset" como substring
("quero resetar minha senha", "reset de fábrica do meu carro") fluem normal
pro agente, persistem em `messages`, disparam turno. Zero falso-positivo de
interceptação.

### REG-3 — Cookie do chat normal intacto

**CA-R3** — O fluxo `route.ts:879-882` (Set-Cookie lazy no 1º turno) continua
funcionando: usuário sem cookie que manda mensagem normal (não `/reset`)
recebe cookie via `/api/chat`, não via `/reset`.

### REG-4 — Provider `reset()` local preservado

**CA-R4** — O `reset()` existente (`provider.tsx:193`) continua existindo e
funcionando (usado pelo simulador admin e por `resetAll`). `resetAll` é
**aditivo** — chama a rota e DEPOIS `reset()`. Não substitui nem quebra o
`reset()` puro.

### REG-5 — memory_events de auditoria sobrevivem ao delete

**CA-R5** — `memory_events` da conversa deletada **não** somem (coluna é
`SET NULL`, não cascade): `SELECT count(*) FROM memory_events WHERE letta_agent_id=<id-de-um-agent-antigo>` permanece, com `conversation_id` agora `NULL`. A trilha de auditoria histórica é preservada; só perde o vínculo com a conversa apagada.

---

## 6. Pontos de falha conhecidos do domínio (atenção do QA)

### 6.1 Race entre `/reset` e stream ativo (P0-5)

Decisão a fixar: **abortar o stream antes de resetar**. Se o `resetAll` chamar
a rota sem parar o `useChat`, o stream pode tentar gravar mensagem numa
conversa que está sendo deletada → erro de FK ou mensagem órfã na conversa
nova. QA deve provocar essa race (reset durante `status:"streaming"`) e
confirmar zero erro + zero vazamento.

### 6.2 Ordem `loadIdentity` ANTES do delete (P0-2)

Erro clássico: deletar a conversa e **depois** tentar `loadIdentity` →
`metadata.identityEnc` já não existe → purge phone nunca acontece → memória
phone ressuscita no re-identify. A ordem é **invariante**. QA valida via
P0-2 (memória phone não ressuscita) — é o teste que pega esse bug.

### 6.3 Cascade incompleto

Se `purgeIdentity` ou o cookie forem feitos mas uma tabela filha não
cascatear (FK sem `onDelete: cascade`), o delete da conversa **quebra com
violação de FK** e a rota dá 500. Schema atual tem cascade em messages,
artifacts, leads, leadEvents, leadInsights, beviProposals,
conversationEvaluations — QA confirma cada uma zerada (P0-1, P1-2). Atenção a
`memoryEvents` que é **SET NULL** (intencional, REG-5) — NÃO deve aparecer na
lista de "deletadas".

### 6.4 Cookie regenerado mas memória anon antiga não purgada

Erro sutil: regenerar o cookie (novo `aja_uid`) mas **esquecer** de purgar o
agent Letta do cookie **antigo** → órfão imortal no Letta vinculado ao cookie
descartado. P0-2 / P1-4 cobrem: o purge usa o cookie **antigo** (lido da
request ANTES de gerar o novo). QA confirma `DELETE` no agent do cookie antigo.

### 6.5 Multi-canal: `/reset` web afeta WhatsApp do mesmo phone?

**DECISÃO (justificada):** o `/reset` web purga a **memória phone** no Letta
(P0-2) — isso é **desejado** e é o "reset profundo": o usuário pediu pra
recomeçar do zero, e a memória cross-canal é parte do estado dele. **Porém,
as conversas WhatsApp persistidas no DB (`conversations` com `channel='whatsapp'`,
`waId` = telefone) NÃO são tocadas** pelo `/reset` web — só a conversa web
atual (`conversationId` da request) é deletada.

Racional: (a) o cookie web não tem como provar posse do número WhatsApp com a
mesma força de um device; deletar histórico WhatsApp de DB a partir do web
seria um vetor de abuso (alguém que sabe seu número apagaria seu histórico).
(b) A memória Letta phone é estado **derivado/efêmero** (re-hidratável), o
histórico WhatsApp no DB é registro **transacional** (lead, proposta). Apagar
o derivado é reset; apagar o transacional de outro canal é destrutivo demais
pra um comando sem auth. **CA-6.5:** após `/reset` web de uma conversa que
compartilha o celular fake com uma conversa WhatsApp seedada,
`SELECT count(*) FROM conversations WHERE channel='whatsapp' AND wa_id=<celular>` permanece **inalterado**.

---

## 7. Contrato da rota (fixar antes de QA)

`POST /api/chat/reset`

**Request:** `{ conversationId: string (UUID) }` + cookie `aja_uid` (opcional).
**Validação:** `conversationId` deve ser UUID válido (espelhar guard
`isUuid` de `route.ts:211`) → senão **HTTP 400** `{ error: "Invalid conversationId" }`.
Ausência de `conversationId` → 400 (ou tratar como reset só-de-cookie; fixar).

**Response 200:** `{ ok: true }` (corpo mínimo; a UI não exibe nada).
**Header:** `Set-Cookie: aja_uid=<new>; Path=/; Max-Age=7776000; SameSite=Lax; HttpOnly`.
**Sem auth.** Sem CSRF token (paridade com chat público; aceitar pelo blast
radius limitado — só apaga o próprio estado).

> QA: se a implementação divergir do contrato acima (ex.: 204 sem corpo, ou
> `{ reset: true }`), o plano não falha desde que (a) status 2xx, (b)
> Set-Cookie presente e diferente, (c) DB limpo. Fixar o shape exato no PR e
> travar via Camada 1.

---

## 8. E2E manual (operador — CPF REAL autorizado)

Só o operador roda, fora do CI, com CPF real autorizado:

1. Abrir chat web em prod/staging, avançar até identify real (CPF+celular reais).
2. Confirmar agent Letta phone criado (memória povoada).
3. Digitar `/reset`. Confirmar: welcome zerado, cookie do browser trocou
   (DevTools → Application → Cookies → `aja_uid` novo valor).
4. Re-identificar com o **mesmo** CPF/celular real → confirmar que a IA
   **não** "lembra" da sessão anterior (memória phone foi purgada).
5. **Cleanup:** descartar a conversa de teste; confirmar que nenhum CPF real
   ficou em log claro (LGPD — `identityEnc` é cifrado, mas validar logs).

> CPF real **JAMAIS** entra em fixture, snapshot, cassette ou commit.

---

## 9. Critérios de aceite — resumo binário (gate)

| ID | Cenário | Passa quando |
|---|---|---|
| CA-1.* | Happy path funil | conversa deletada, cascade limpo, cookie novo≠antigo, msg `/reset` nunca persistida, UI welcome |
| CA-2.* | Re-identify mesmo celular | loadIdentity ANTES do delete, purge phone+cookie, `memory_events.purged`, memória NÃO ressuscita |
| CA-3.* | Variações caixa/espaço | só match exato `/reset` intercepta; `/resetar`/`reset`/`/reset agora` viram mensagem |
| CA-4.* | Letta down | rota 200, DB limpo, cookie novo, purge engolido |
| CA-5.* | Reset durante streaming | stream abortado limpo, conversa antiga 100% deletada, nova vazia, zero exceção |
| CA-6.* | Conversa vazia | 200 sem row no DB, loadIdentity null sem throw, cookie novo |
| CA-7.* | Proposta Bevi | `bevi_proposals` + `leads` = 0, sem erro FK |
| CA-8.* | Cookie ausente | rota não quebra, cookie novo gerado, purge phone roda se houver identity |
| CA-9.* | Duplo reset | 2º reset 200, cookie c2≠c1, purga anon de c1, idempotente |
| CA-R1..R5 | Regressões | WhatsApp /reset ok, sem falso-positivo, cookie chat normal ok, reset() local preservado, memory_events sobrevive |
| CA-6.5 | Multi-canal | conversas WhatsApp no DB inalteradas após reset web |

**Feature só é "feita" quando todos os CA P0 (1-5) + regressões (R1-R5) +
CA-6.5 passam com evidência (query de DB, header Set-Cookie, screenshot UI).**
