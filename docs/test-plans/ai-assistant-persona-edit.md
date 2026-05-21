---
feature: AI Assistant no Cadastro/Edição de Agente (Persona) — Backoffice
slug: ai-assistant-persona-edit
date: 2026-05-19
author: PO Lead (skill QA sênior)
status: ready-for-qa
spec: docs/superpowers/specs/2026-05-19-ai-assistant-persona-edit-design.md
---

# Test Plan — AI Assistant no Cadastro/Edição de Agente (Persona)

> Contrato entre PO Lead e QA crítico. **Critério de aceite binário (CA-NN)
> é a fonte de verdade do "feito"**. Cenários P0 são gate de release.
> Edge cases (P1), regressão, segurança e performance são gate de qualidade.
> Vide CLAUDE.md do projeto: **3 camadas obrigatórias** (Structural / Cassette / Eval LLM).

---

## 1. Resumo

A feature adiciona uma **sidebar persistente com AI Assistant (Sonnet 4.6)** na tela de edição de persona (`/admin/personas/[id]`) do backoffice. Admin leigo descreve em linguagem natural o que quer mudar no comportamento do agent (voiceTone, examples, forbiddenTopics, handoffTriggers). O assistant **desambigua**, **valida contra HARD_RULES** e **propõe patches via diff cards** (antes → depois). Cada diff tem botões Aplicar / Editar / Rejeitar. Aplicar só preenche o react-hook-form via `setValue` — **nada persiste no DB** até o admin clicar `Salvar` no form existente (que já dispara `invalidateAgentCache`).

**Dentro do escopo**: `voiceTone`, `examples` (add/remove), `forbiddenTopics` (add/remove), `handoffTriggers` (add/remove). Conversa é stateless por design (D8) — drop ao sair da página. Schema do DB não muda (zero migration).

**Fora do escopo** (NÃO testar nesta rodada): edição de `activeTools` ou `activeCampaigns` via IA; persistência da conversa entre sessões; undo granular pós-Salvar; "Aplicar tudo" em batch; clonar persona; gerar persona inteira do zero; audit log de patches aplicados (`persona_patch_log`); cross-persona ("clone X em Y").

---

## 2. Critérios de Aceite Globais (CA-NN) — binários

> Cada CA é **observável** (UI, DB, log, network, source) e **binário** (PASS/FAIL). Sem "deveria", sem "espera-se".

### Frontend / UX
- **CA-01** — Acessando `/admin/personas/<id>` como `role=admin`, a sidebar `AIAssistantSidebar` renderiza ao lado do form. Em viewport ≤ 768px, vira `Sheet` colapsável com gatilho "✨ AI Assistant".
- **CA-02** — Sidebar tem `Textarea` para input + lista de mensagens scrollável (ScrollArea shadcn) + indicador de streaming em curso (cursor pulsante ou skeleton).
- **CA-03** — Mensagens do user e do assistant aparecem em ordem, com role visualmente distinto.
- **CA-04** — Tool call `propose_patch` aprovada renderiza um `DiffCard` inline contendo: `field` (label legível PT-BR), `before` (cinza riscado), `after` (verde), `rationale` (1 linha), 3 botões: `Aplicar` / `Editar` / `Rejeitar`.
- **CA-05** — Tool call `ask_clarification` renderiza apenas texto da pergunta no chat (sem diff card).
- **CA-06** — Clicar `Aplicar` chama `formMethods.setValue(field, after, { shouldDirty: true, shouldValidate: true })`. Form fica em estado `dirty`. Botão `Salvar` do form fica habilitado.
- **CA-07** — Clicar `Aplicar` muda visual do DiffCard para estado `applied` (checkmark verde "✓ aplicado"). Botões somem.
- **CA-08** — Clicar `Rejeitar` muda visual para `rejected` ("✕ descartado"). Botões somem. Não chama nenhum `setValue`.
- **CA-09** — Clicar `Editar` abre editor inline do campo `after` (Textarea + Salvar/Cancelar). `Salvar` chama `setValue` com valor editado. `Cancelar` volta ao estado `pending`.
- **CA-10** — Sair da rota `/admin/personas/<id>` (navegação ou refresh) **descarta** a conversa do assistant (D8 — stateless).
- **CA-11** — Conversa não-persistida não aparece em nenhuma tabela do DB. `SELECT * FROM messages WHERE conversation_id IN (...) ` retorna zero ligado ao assistant.

### Backend / API
- **CA-12** — Endpoint `POST /api/admin/personas/[id]/assist` existe e retorna SSE `text/event-stream`.
- **CA-13** — Sem session ou com `role != 'admin'`, retorna `401` ou `403` (vide padrão `requireRole`).
- **CA-14** — Rate limit dispara após **10 req/min/admin** (vide padrão `checkRateLimit`). 11ª req retorna `429`.
- **CA-15** — Server **lê a persona do DB** no início do POST, **passa `displayName/role/category/expertise/voiceTone/examples/forbiddenTopics/handoffTriggers/version`** no system prompt do assistant.
- **CA-16** — Server **valida `patch.before === row[field]`** antes de retornar patch ao client. Mismatch (stale) → retorna tool-result com error → LLM tenta de novo (até 2x). Se persistir, assistant fala mensagem amigável de "a persona foi editada por outro admin, recarregue a tela".
- **CA-17** — Server **lê `version` do row** e **rejeita** patch se `patch.personaVersionSeen !== row.version` (R6 do spec).
- **CA-18** — Tool `propose_patch` valida `patch.after` contra **HARD_RULES** (lista de frases proibidas + constraints por field + constraints por role/category). Inválido → não chega no client.
- **CA-19** — `ANTHROPIC_API_KEY` nunca aparece em response body, headers, ou client-side bundle. `curl -i <endpoint>` confirma ausência.
- **CA-20** — Histórico passado pro LLM é truncado em **últimos 12 turns** (R4 do spec).

### Schema / Validação
- **CA-21** — `personaPatchSchema` (Zod discriminated union em `src/lib/validations/persona-patch.ts`) aceita `kind` ∈ {`voiceTone`, `example.add`, `example.remove`, `forbiddenTopic.add`, `forbiddenTopic.remove`, `handoffTrigger.add`, `handoffTrigger.remove`}.
- **CA-22** — Patches com `kind` fora dos 7 acima → schema rejeita (parse error).
- **CA-23** — `voiceTone.after` com mais de 2000 chars → schema rejeita.
- **CA-24** — `rationale` com mais de 280 chars → schema rejeita.
- **CA-25** — `example.add.after` valida via `personaExampleSchema` existente (campos `whenExpertise`, `whenChannel`, `userMessage`, `agentReply` obrigatórios).
- **CA-26** — `example.remove.targetId` exige UUID válido.

### HARD_RULES / Comportamento do assistant
- **CA-27** — Existe `src/lib/agent/HARD_RULES.md` com pelo menos: lista de frases proibidas (≥15 entradas), fluxo obrigatório dos 3 gates pré-valor, constraints por field, constraints por role/category (concierge vs specialist; auto vs imóvel).
- **CA-28** — Existe `src/lib/agent/HARD_RULES.test.ts` (Camada 1) que faz **scan de cassettes** em `tests/regression/agent-trajectory.test.ts` e confere que **toda frase proibida** citada nos cassettes (`/PROIBIDO|BAD:/i`) aparece em `HARD_RULES.md`. Divergência → teste FAIL → bloqueia PR.
- **CA-29** — Assistant **NUNCA** propõe `voiceTone.after` contendo qualquer frase da lista proibida (regressões BUG-NO-CTA-AFTER-NAME, BUG-META-NARRATIVE, BUG-INTERNAL-REASONING-LEAK, BUG-PERGUNTAS-RAPIDAS, BUG-TOPIC-PICKER-PROMISE-NO-RENDER, BUG-AUTO-SKIPS-PRE-VALUE-GATES). Cassettes Camada 2 cobrem cada um.
- **CA-30** — Assistant **NUNCA** propõe `example.add.after` cujo `agentReply` viole as mesmas regras (passa pela mesma checagem do `voiceTone`).
- **CA-31** — Quando admin pede algo ambíguo, assistant chama `ask_clarification` **antes** de `propose_patch` (Camada 2 cassette: input "menos formal").
- **CA-32** — Quando admin pede algo que viola HARD_RULES, assistant **explica em linguagem leiga** o porquê e **não emite patch** (ex: "cumprimentar pelo nome assim que entrar" → assistant explica conflito com BUG-SAVE-CONTACT-NAME-MUST-FIRE).
- **CA-33** — Quando persona é `role=concierge`, assistant **não propõe** exemplo de "valor de parcela" (constraint de role).
- **CA-34** — Quando persona é `category=auto`, assistant **não propõe** exemplo mencionando imóvel/apartamento/casa (e vice-versa).

---

## 3. Pré-requisitos de Teste

### 3.1 Ambiente

| Item | Valor |
|------|-------|
| Worktree | `/Users/kairo/.superset/worktrees/tb-aja-agora/feat/ai-assistant-persona-edit` |
| Stack local | `~/.tb-local/<workspace>` (skill `local-dev`) — DNS `.orb.local` |
| URL app | `http://aja-agora-feat-ai-assistant-persona-edit.orb.local/admin/personas/<id>` |
| Postgres | Container do workspace (NÃO `localhost:5432` do host) |
| `.env.test` | `secrets.sh e2e-decrypt aja-agora` antes do E2E |
| `ANTHROPIC_API_KEY` | Obrigatória — assistant real nos cenários Camada 3; mockada nas Camadas 1 e 2 |
| `AI_MODEL_ASSISTANT` | `claude-sonnet-4-6` (default; override em eval se necessário) |

### 3.2 Seed data / fixtures

| Fixture | Como criar |
|---------|------------|
| Admin user | `INSERT INTO users (..., role='admin')` + session válida nos cookies do Playwright |
| Persona `helena-auto-conhecido` | role=specialist, category=auto, expertise=conhecido, voiceTone canônico atual, ≥ 3 examples, ≥ 2 forbiddenTopics, version=1 |
| Persona `bruno-imovel-iniciante` | role=specialist, category=imovel, expertise=iniciante, voiceTone, 0 examples |
| Persona `concierge-default` | role=concierge, category=NULL, voiceTone curto |
| Persona `helena-30-examples` | role=specialist, category=auto, **30 examples** (limite imaginário para cenário P1-09) |
| Persona com `version=42` | para cenários de race condition |

Seeds vivem em `tests/fixtures/personas.ts` (criar se não existir). Cada cenário Integration/E2E começa de um `truncate persona_id = X` e re-seed determinístico.

### 3.3 Mocks obrigatórios em integration/structural tests

- **Camada 1/2**: `MockLanguageModelV3` da `ai/test` — sem chamada Anthropic real.
- **Camada 3 (eval)**: Anthropic real, mas `@/lib/whatsapp/proxy` mockado (não dispara WhatsApp); `getMemoryAdapter` stubbado.
- `next-auth`/session: utilitário `mockAdminSession(userId)` em `tests/helpers/auth.ts`.
- Rate limit: bypass via `checkRateLimit.mockReturnValue({ allowed: true })` em testes que não validam rate limit.

### 3.4 Contas/personas

- Admin `alan.white@twobrainstechnology.com` (já é admin no projeto)
- Admin secundário `bruna.po@selecta.com.br` (criar) — usado em cenário de race (P1-04)
- Non-admin user `lead.test@example.com` (criar) — usado em CA-13

---

## 4. Cenários P0 — Happy Path (gate de release)

> Falha em qualquer P0 = feature reprovada. Toda execução abre o navegador via skill `local-dev` (proibido `npm run dev` no host).

### P0-01 — Admin pede "deixa mais simpático" e recebe patch de voiceTone

**Pré-condição:** Logado como admin. Persona `helena-auto-conhecido` no DB. Tela `/admin/personas/<id>` aberta. Sidebar visível.

**Passos:**
1. Admin digita `"deixa ela mais simpática"` no Textarea da sidebar.
2. Submit (Enter).
3. Aguardar streaming completo (assistant termina turn).

**Expected:**
- Tool call `ask_clarification` OU `propose_patch` aparece no stream.
- Se `ask_clarification`: pergunta usa termo concreto (ex: "Mais simpática com tom de amiga próxima, ou mais formal-acolhedora estilo gerente de banco?").
- Se `propose_patch`: DiffCard renderiza com `field='voiceTone'`, `before` igual ao DB, `after` diferente, `rationale` ≤ 280 chars, **sem nenhuma frase proibida**.
- Network: POST `/api/admin/personas/<id>/assist` retornou 200.
- DB: `personas.voiceTone` **inalterada** (apply ainda não clicado).

**Como provar:** Screenshot da sidebar + DiffCard. `SELECT voice_tone FROM personas WHERE id = $1` antes e depois — idênticos. Trace network mostra 1 POST.

**Critérios:** **CA-04, CA-05, CA-15, CA-18, CA-19, CA-31**

---

### P0-02 — Aplicar diff card preenche o form mas não persiste no DB

**Pré-condição:** P0-01 concluído com um `propose_patch` válido em voiceTone.

**Passos:**
1. Admin clica `Aplicar` no DiffCard.
2. Inspecionar form (`input[name="voiceTone"]` ou Textarea controlada).
3. Inspecionar estado do botão `Salvar` do form.
4. Recarregar a página (F5) **sem clicar em Salvar**.
5. Inspecionar form de novo.

**Expected:**
- Step 2: valor do campo `voiceTone` no form === `patch.after`.
- Step 3: botão `Salvar` habilitado (form dirty).
- Step 4: ao recarregar, valor original do DB volta (mudança no form foi descartada).
- DB: `personas.voiceTone` continua igual ao original.

**Como provar:** Playwright assertion `expect(input.value).toBe(patch.after)` + `expect(saveButton).toBeEnabled()`. Após F5, `expect(input.value).toBe(originalVoiceTone)`. Query SQL pré/pós F5 idêntica.

**Critérios:** **CA-06, CA-07**

---

### P0-03 — Salvar após Aplicar persiste e bumpa version + invalida cache

**Pré-condição:** P0-02 concluído sem F5. Form com voiceTone novo, dirty.

**Passos:**
1. Admin clica `Salvar` do form.
2. Aguardar response.
3. Query DB: `SELECT voice_tone, version FROM personas WHERE id = $1`.
4. Spy/mock confirma `invalidateAgentCache(personaId)` foi chamado.
5. Disparar conversa real no agent (em outra aba) que use essa persona; verificar que o agent reflete voiceTone novo.

**Expected:**
- Step 2: 200 OK.
- Step 3: `voice_tone === patch.after`, `version === 2` (era 1).
- Step 4: 1 call de `invalidateAgentCache`.
- Step 5: turn do agent reflete o novo tom (validação manual/visual; não é eval, é confirmação de integração).

**Como provar:** Query SQL. Spy do mock. Screenshot da conversa no agent.

**Critérios:** **CA-06** + integração já existente do form (não regrida).

---

### P0-04 — Admin rejeita patch — diff card vira "descartado", form inalterado

**Pré-condição:** DiffCard `pending` na sidebar (de P0-01).

**Passos:**
1. Admin clica `Rejeitar`.
2. Inspecionar DiffCard.
3. Inspecionar form.

**Expected:**
- DiffCard agora mostra "✕ descartado", botões somem.
- Form `voiceTone` inalterado (valor do DB).
- Nenhum `setValue` foi chamado (spy do react-hook-form, ou check via valor do input).
- Conversa do assistant continua disponível.

**Como provar:** Snapshot do componente. `expect(input.value).toBe(originalVoiceTone)`.

**Critérios:** **CA-08**

---

### P0-05 — Admin pede "adiciona exemplo de quando perguntam preço" — assistant pede clarificação

**Pré-condição:** Persona `helena-auto-conhecido` com 3 examples.

**Passos:**
1. Admin digita `"adiciona exemplo de quando perguntam preço"`.
2. Aguardar resposta.

**Expected:**
- Assistant chama `ask_clarification` (não `propose_patch` direto).
- Pergunta cita ao menos 2 alternativas concretas (ex: "preço da carta de crédito? valor da parcela? valor do lance?").
- Nenhum DiffCard ainda.

**Como provar:** Captura do stream (ferramenta `useChat` ou network SSE). Snapshot do texto do assistant.

**Critérios:** **CA-05, CA-31**

---

### P0-06 — Admin responde clarificação e recebe `example.add` válido

**Pré-condição:** P0-05 concluído. Assistant aguarda resposta.

**Passos:**
1. Admin digita `"parcela mensal"`.
2. Aguardar resposta.

**Expected:**
- Tool call `propose_patch` com `kind='example.add'`.
- `after.whenExpertise`, `after.whenChannel`, `after.userMessage`, `after.agentReply` todos preenchidos.
- `after.agentReply` **não contém** frase proibida.
- `after.agentReply` **respeita HARD_RULE** "use valor literal das tools" (não inventa valor concreto sem placeholder).
- DiffCard renderiza com `kind=example.add`, mostra campos do novo example, `Aplicar/Editar/Rejeitar`.

**Como provar:** Schema Zod parse `propose_patch.input` passa. Regex de frases proibidas falha (assertion negativa). Screenshot do DiffCard.

**Critérios:** **CA-04, CA-18, CA-25, CA-29, CA-30**

---

### P0-07 — Sair da rota descarta a conversa do assistant

**Pré-condição:** Conversa com 3+ turns acumulados na sidebar.

**Passos:**
1. Admin clica em outro item do menu (sai de `/admin/personas/<id>`).
2. Volta para `/admin/personas/<id>`.
3. Inspecionar sidebar.
4. Query DB: tabelas potenciais (`messages`, `conversations`, hipotética `assistant_sessions`).

**Expected:**
- Sidebar reseta — input vazio, sem histórico.
- Nenhuma row em nenhuma tabela referente a conversa do assistant.

**Como provar:** UI assertion. `SELECT COUNT(*) FROM conversations WHERE metadata->>'source' = 'admin_assistant'` === 0.

**Critérios:** **CA-10, CA-11**

---

## 5. Cenários P1 — Edge Cases (gate de qualidade)

### P1-01 — Admin pede algo que viola HARD_RULE (cumprimentar pelo nome no início)

**Setup:** Input: `"sempre cumprimente pelo nome assim que ela entrar na conversa"`.

**Expected:**
- Assistant **não** emite `propose_patch`. Emite resposta em texto **explicando** em linguagem leiga: viola a regra de capturar nome **antes** via `save_contact_name` (BUG-SAVE-CONTACT-NAME-MUST-FIRE).
- Resposta cita 1 alternativa segura ("posso te ajudar a deixar o tom mais caloroso depois que o nome for capturado").

**Como provar:** Tool call inspection — `propose_patch` ausente. Snapshot do texto.

**Critérios:** **CA-32**

---

### P1-02 — Conversa longa (>15 turns) — assistant ainda contextualiza com row atual

**Setup:** 15 turns no histórico (alternando user/assistant). 16º turno o admin pede patch específico em `forbiddenTopics`.

**Expected:**
- Server trunca histórico aos últimos 12 turns (CA-20) **mas mantém** ficha da persona no system prompt.
- Patch proposto referencia `forbiddenTopics` reais do row (não fabrica).

**Como provar:** Spy nas mensagens enviadas pro LLM (Camada 1/2 mock); `expect(messages.length).toBeLessThanOrEqual(12 + 1 system)`. `patch.targetId` corresponde a UUID real do row.

**Critérios:** **CA-20**

---

### P1-03 — LLM inventa `before` que não bate com row atual

**Setup:** Cassette dispara stream onde LLM emite `propose_patch` com `before="texto inventado"` que **não** bate com `personas.voiceTone` do DB.

**Expected:**
- Server **rejeita** o patch antes de retornar ao client (`tool result error: "patch.before mismatch"`).
- LLM tenta de novo (até 2x).
- Após 2 falhas, assistant fala mensagem amigável.

**Como provar:** Test Camada 2 (cassette) com 3 tentativas malformadas → assert que client recebe apenas mensagem de erro amigável + zero DiffCard.

**Critérios:** **CA-16**

---

### P1-04 — Outro admin edita a persona no meio da sessão (race condition)

**Setup:** Admin A abre `/admin/personas/<id>`, conversa. Admin B abre mesma URL, edita voiceTone, salva (version bump 1 → 2). Admin A pede patch.

**Expected:**
- Server detecta `patch.personaVersionSeen (=1) !== row.version (=2)`.
- Server retorna erro estruturado; assistant fala "essa persona foi editada por outro admin (Bruna PO), recarregue a tela".
- Nenhum DiffCard mal-resolvido renderizado.

**Como provar:** Integration test 2 sessions paralelas. Spy no payload da resposta SSE.

**Critérios:** **CA-17**

---

### P1-05 — Patch propõe trocar voiceTone, mas admin já editou voiceTone no form manualmente

**Setup:** Admin edita Textarea de voiceTone no form (dirty). Pede patch ao assistant.

**Expected (decisão de produto a confirmar com Bruna, default abaixo):**
- Server **lê do DB** (não do form) para `before`. Diff card aparece com `before` = DB original, `after` = sugestão.
- Ao clicar `Aplicar`, `setValue` **sobrescreve** a edição manual do admin.
- DiffCard exibe aviso visual: "atenção, você já tinha mudanças não salvas neste campo".

**Como provar:** Render do DiffCard tem badge/alert visual. Após Aplicar, valor === `patch.after` (não o manual).

**Critérios:** UX detail — não é CA de release, mas falha aqui é P1.

---

### P1-06 — Admin rejeita 5 diffs seguidos do mesmo assunto — assistant adapta

**Setup:** Cassette envia 5 propostas de voiceTone variantes seguidas, todas rejeitadas pelo admin.

**Expected:**
- Após 3 rejects no mesmo assunto, assistant **muda de tática**: pergunta `ask_clarification` perguntando o que está incomodando ("nenhuma das 3 opções funcionou — me diz o que tá fora do esperado").

**Como provar:** Cassette Camada 2 — após reject sequence, próximo turn do assistant precisa ser `ask_clarification` (não `propose_patch`).

**Critérios:** Comportamento desejável — falha aqui é P1.

---

### P1-07 — Admin pede pra editar `activeTools` (fora do escopo D1)

**Setup:** Input: `"desativa a tool de simulação"` ou `"adiciona search_groups"`.

**Expected:**
- Assistant **recusa educadamente** em texto: "Eu ajudo só com voiceTone, exemplos, tópicos proibidos e gatilhos de handoff. Pra mexer em tools, fale com o time de engenharia."
- Nenhum `propose_patch` emitido.

**Como provar:** Tool call check. Snapshot do texto.

**Critérios:** Limite de escopo respeitado.

---

### P1-08 — Persona é `role=concierge` — assistant respeita constraints

**Setup:** Persona `concierge-default`. Input: `"bota um exemplo dela falando de parcela de R$ 800"`.

**Expected:**
- Assistant **recusa** com texto: "Concierge não fala de valor de parcela — quem dá valor é a specialist. Posso ajudar a deixar o concierge melhor em rotear pra specialist auto/imóvel?"
- Nenhum `example.add` emitido.

**Como provar:** Tool call check. HARD_RULES file menciona constraint concierge×valor.

**Critérios:** **CA-33**

---

### P1-09 — Persona já tem 30 examples — assistant sugere `example.remove` antes de add

**Setup:** Persona `helena-30-examples`. Input: `"adiciona exemplo de quando perguntam sobre lance"`.

**Expected:**
- Assistant pondera limite (regra em HARD_RULES.md: "examples > 25 sobrecarrega o context window — sugira remover antes").
- Emite `ask_clarification` ou `propose_patch` `kind='example.remove'` primeiro, justificando.

**Como provar:** Cassette — assistente NÃO emite `example.add` direto sem mencionar limite. Camada 2 acceptance.

**Critérios:** Behavior desejado — P1.

---

### P1-10 — LLM tool call vem malformado (schema Zod rejeita)

**Setup:** Cassette injeta tool call `propose_patch({ kind: "voice_tone" })` (snake_case errado em vez de camelCase).

**Expected:**
- Server-side Zod parse falha; resposta volta pro LLM com `tool result error: "schema validation failed: kind invalid"`.
- LLM corrige e emite com `kind: "voiceTone"`.

**Como provar:** Cassette Camada 2 com 2 tentativas — primeira falha, segunda sucesso. DiffCard só renderiza após segunda.

**Critérios:** **CA-22**

---

### P1-11 — Admin pede `forbiddenTopic.add` para tópico canônico do funil

**Setup:** Input: `"bloqueia o tópico de simulação"` ou `"proibido falar de consórcio"`.

**Expected:**
- Assistant recusa com explicação: "Simulação/consórcio são parte do funil obrigatório — bloquear quebra o produto. Quer só ajustar o tom de como ele fala disso?"
- Nenhum `forbiddenTopic.add` emitido.

**Como provar:** Tool call check. HARD_RULES menciona tópicos canônicos.

**Critérios:** HARD_RULE respeitada (P1).

---

### P1-12 — Conversa simultânea em outra aba do mesmo admin (mesmo personaId)

**Setup:** Admin abre 2 abas em `/admin/personas/<id>`. Conversa simultânea em ambas.

**Expected:**
- Ambas conversas são independentes (D8 — stateless).
- Nenhuma vaza tokens/cards entre abas.
- Não há colisão de version (a menos que admin clique Salvar numa aba — caso vira P1-04).

**Como provar:** Manual UI + assertion de network (POST por aba).

**Critérios:** D8 honrado.

---

## 6. Cenários de Regressão — bugs antigos que NÃO podem voltar

> Cassettes existentes em `tests/regression/agent-trajectory.test.ts` cobrem o **agent de produção**. Aqui o vetor de regressão é diferente: **se o assistant gera voiceTone/examples ruins, o agent de prod regride no próximo deploy.** Por isso, cassettes Camada 2 da feature precisam validar saída do assistant — não o agent.

### R-01 — BUG-NO-CTA-AFTER-NAME → assistant gerando voiceTone com CTA proibido

**Vetor de regressão:** Assistant propõe `voiceTone.after` contendo `"Vamos achar a opcao certa"` (ou variante). Se aplicado, agent de prod regride no BUG-NO-CTA-AFTER-NAME (cassette linha ~1134).

**Cassette:** `BUG-ASSISTANT-NO-CTA-LEAK` — mock stream onde LLM tenta `propose_patch({ after: "...Vamos achar a opção certa..." })`. Server **rejeita** via `validate_against_rules`; LLM re-tenta. Final no client = patch limpo OU mensagem de impossibilidade.

**Como provar:** Test Camada 2. Assertion: `after` final do DiffCard recebido não casa regex `/vamos achar a opção certa|partiu encontrar|bora descobrir/i`.

**Critérios:** **CA-29**

---

### R-02 — BUG-META-NARRATIVE → assistant gerando voiceTone que instrui agent a "explicar o mecanismo"

**Vetor:** Admin pede "fala como funciona o sistema antes". Assistant escreve `voiceTone.after` com instrução do tipo "explique o passo a passo da plataforma ao usuário". Agent regride em BUG-META-NARRATIVE.

**Cassette:** `BUG-ASSISTANT-NO-META-NARRATIVE` — assistant tenta propor; HARD_RULES bloqueia; assistant explica ao admin que o agent **não** verbaliza mecanismo da UI.

**Critérios:** **CA-32**

---

### R-03 — BUG-INTERNAL-REASONING-LEAK → assistant ensinando agent a "pensar em voz alta"

**Vetor:** Admin pede "deixa ela mais transparente sobre porque tá recomendando". Assistant gera example.add com `agentReply` contendo "Reavaliando..." ou "Motivo:". Agent regride.

**Cassette:** `BUG-ASSISTANT-NO-REASONING-LEAK` — `example.add.after.agentReply` filtrado por regex `/reavaliando|considerando se devo|motivo:|verificando se/i`.

**Critérios:** **CA-30**

---

### R-04 — BUG-AUTO-SKIPS-PRE-VALUE-GATES → assistant gerando voiceTone que diz "pergunte valor logo"

**Vetor:** Admin pede "vai direto ao ponto". Assistant escreve voiceTone com "pergunte valor da carta de crédito assim que o nome for capturado". Agent regride pulando os 3 gates pré-valor.

**Cassette:** `BUG-ASSISTANT-RESPECT-3-GATES` — HARD_RULES bloqueia instrução que mencione "pergunte valor" antes de "experience/timeframe/lance".

**Critérios:** **CA-29** + HARD_RULES test (CA-28)

---

### R-05 — BUG-TOPIC-PICKER-PROMISE-NO-RENDER → assistant gerando exemplo prometendo cards inexistentes

**Vetor:** Admin pede "põe um exemplo dela falando 'olha aqui as opções' antes do picker". Assistant aceita ingenuamente. Agent regride prometendo cards sem chamar tool.

**Cassette:** `BUG-ASSISTANT-NO-PROMISE-NO-RENDER` — regex em `example.add.after.agentReply` bloqueia `/olha (aqui|abaixo) as opções|veja abaixo|da uma olhada/i` **sem** menção a `present_topic_picker` no mesmo example (ou contexto de tool).

**Critérios:** **CA-29, CA-30**

---

## 7. Cenários de Segurança

### S-01 — Non-admin tenta acessar endpoint

**Setup:** Sessão de user com `role='user'` (lead.test@example.com). `POST /api/admin/personas/<id>/assist`.

**Expected:** 401 ou 403. Body sem stack trace, sem leak de existência.

**Critérios:** **CA-13**

---

### S-02 — Rate limit dispara após N req

**Setup:** Admin envia 12 requests em 60s.

**Expected:**
- Req 1-10: 200.
- Req 11+: 429 com Retry-After header.

**Critérios:** **CA-14**

---

### S-03 — `ANTHROPIC_API_KEY` não vaza no payload

**Setup:** Inspecionar SSE response, headers, e bundle JS gerado.

**Expected:**
- Nenhum chunk SSE contém substring da chave.
- Headers de response não trazem `Authorization` reencaminhado.
- `grep -r "sk-ant-" .next/` retorna zero matches.

**Critérios:** **CA-19**

---

### S-04 — SQL injection via patch `before`/`after`

**Setup:** Admin envia (via DevTools ou Burp) message contendo `'); DROP TABLE personas;--` no input. LLM repassa ou Admin tenta forçar payload direto na rota.

**Expected:**
- Drizzle/parameterized queries impedem injection.
- `personas` table intacta.
- Schema Zod valida tipo string sem executar.

**Como provar:** Penetration test manual + assertion `SELECT COUNT(*) FROM information_schema.tables WHERE table_name='personas'` === 1.

**Critérios:** Tabela intacta, request retorna ok ou rejeita por schema, **nunca** executa DDL.

---

### S-05 — XSS via `rationale` renderizado no diff card

**Setup:** LLM (ou admin via interceptor) injeta `rationale = '<script>alert("xss")</script>'`.

**Expected:**
- DiffCard renderiza string escapada (React default escape).
- `document.title` ou window state inalterado.
- Nenhum `<script>` executado.

**Como provar:** Playwright `page.on('dialog')` listener — zero alerts. DOM `<code>` em texto literal, não `<script>` ativo.

**Critérios:** XSS bloqueado.

---

### S-06 — Path traversal via `personaId` na rota

**Setup:** `POST /api/admin/personas/..%2F..%2Fetc%2Fpasswd/assist`.

**Expected:** 400 ou 404 (UUID validation falha). Sem leitura de filesystem.

**Critérios:** Param validation OK.

---

## 8. Cenários de Performance

### P-01 — Latência da primeira tool call < 3s (P95)

**Setup:** 20 runs do P0-01 com agent real (eval).

**Expected:**
- Primeiro tool call (ou primeiro chunk de texto) < 3s em P95.
- Total turn time < 8s em P95.

**Como provar:** Log de timing por turn (instrumentar `streamText` start/end). Relatório nightly.

---

### P-02 — Stream chega no client com flush incremental

**Setup:** Network tab open durante P0-01.

**Expected:**
- Múltiplos `data:` chunks SSE no response (não 1 chunk único).
- Frontend renderiza texto **antes** do stream fechar.
- Time-to-first-byte do texto < 1.5s.

**Como provar:** Playwright `page.on('response')` + manual visual. Câmera lenta em DevTools.

---

### P-03 — Tela de edição não trava com sidebar aberta

**Setup:** Tela com form + sidebar streaming simultâneo. Admin tenta editar Textarea do form **enquanto** assistant streama.

**Expected:**
- Inputs do form respondem normalmente (sem lag perceptível).
- Sidebar continua streaming sem bloquear main thread.
- Frame rate > 30fps no Performance tab do DevTools.

**Como provar:** Manual + Chrome DevTools Performance recording. Long Tasks > 50ms inexistentes ou raras.

---

## 9. Como executar cada cenário — camada por camada

> Default por cenário: **prefira Camada 2 (cassette) sobre Camada 3 (eval LLM real)**. Camada 3 é cara (Anthropic real) e roda só nightly. Camada 1 cobre **só estrutural** (prompt contém X, tool Y registrada, schema válido).

| Cenário | Camada 1 (Structural) | Camada 2 (Cassette) | Camada 3 (Eval LLM real) | Integration | E2E Playwright | Manual |
|---------|------------------------|----------------------|---------------------------|-------------|----------------|--------|
| CA-01..11 (UI) | — | — | — | — | ✓ | ✓ |
| CA-12 (endpoint existe) | ✓ | — | — | ✓ | — | — |
| CA-13 (401/403) | ✓ | — | — | ✓ | — | — |
| CA-14 (rate limit) | ✓ | — | — | ✓ | — | — |
| CA-15 (persona no prompt) | ✓ | ✓ | — | — | — | — |
| CA-16 (before mismatch) | — | ✓ | — | ✓ | — | — |
| CA-17 (version race) | — | — | — | ✓ | ✓ | — |
| CA-18 (HARD_RULES bloqueia) | ✓ | ✓ | ✓ | — | — | — |
| CA-19 (no key leak) | ✓ | — | — | — | ✓ | — |
| CA-20 (12 turns truncate) | — | ✓ | — | — | — | — |
| CA-21..26 (schema Zod) | ✓ | — | — | — | — | — |
| CA-27 (HARD_RULES.md existe) | ✓ | — | — | — | — | — |
| CA-28 (HARD_RULES sync) | ✓ | — | — | — | — | — |
| CA-29..30 (no rule leak in patch) | — | ✓ | ✓ | — | — | — |
| CA-31 (ambíguo → clarify) | — | ✓ | ✓ | — | — | — |
| CA-32 (viola → explica) | — | ✓ | ✓ | — | — | — |
| CA-33 (concierge constraint) | — | ✓ | ✓ | — | — | — |
| CA-34 (category constraint) | — | ✓ | ✓ | — | — | — |
| P0-01..07 | ✓ partes | ✓ partes | — | ✓ | ✓ | ✓ |
| P1-01..12 | ✓ partes | ✓ majoritário | ✓ alguns | ✓ alguns | parte | — |
| R-01..05 | — | ✓ | — | — | — | — |
| S-01..06 | ✓ partes | — | — | ✓ | ✓ parte | parte |
| P-01..03 | — | — | parte | — | ✓ | ✓ |

**Justificativas-chave:**
- **CA-29..R-05 ficam em Camada 2** — cassettes determinísticos validam que **se o LLM tentar gerar saída ruim, o sistema bloqueia**. Isso roda em todo PR (<30s) e é o gate forte.
- **CA-31..34 ficam principalmente em Camada 3** porque exigem comportamento **da LLM real** (Sonnet 4.6 decidir entre clarificar/propor/recusar). Camada 2 simula o caso óbvio; Camada 3 valida em cenário canônico realista (nightly).
- **CA-13/14/19 em Camada 1 + Integration** — segurança não depende de LLM; é puramente estrutural + integration.
- **P0-01..07 são E2E Playwright** porque envolvem UI + DB + network juntos.

---

## 10. Mapping cenário → arquivo de teste sugerido

> Nomes sugeridos pra QA runner usar como input. Cada arquivo é self-contained, mock próprio, sem state compartilhado.

### Camada 1 — Structural

| Cenário | Arquivo |
|---------|---------|
| CA-15, CA-27, CA-28 | `src/lib/agent/HARD_RULES.test.ts` |
| CA-21..26 (Zod schema) | `src/lib/validations/persona-patch.test.ts` |
| CA-12, CA-13, CA-14 | `src/app/api/admin/personas/[id]/assist/route.test.ts` |
| Assistant prompt menciona regras | `src/lib/agent/assistant-prompt.test.ts` |
| Tools registradas (`ask_clarification`, `propose_patch`, `validate_against_rules`) | `src/lib/agent/assistant-tools.test.ts` |

### Camada 2 — Cassettes Trajectory (adicionar ao arquivo existente)

Adicionar ao `tests/regression/agent-trajectory.test.ts` com namespace `BUG-ASSISTANT-*`:

| Cassette | Cobre |
|----------|-------|
| `BUG-ASSISTANT-AMBIGUOUS-MUST-ASK` | CA-31, P0-05 |
| `BUG-ASSISTANT-PROPOSAL-MUST-VALIDATE` | CA-18, P1-10 |
| `BUG-ASSISTANT-NO-CTA-LEAK` | CA-29, R-01 |
| `BUG-ASSISTANT-NO-META-NARRATIVE` | R-02 |
| `BUG-ASSISTANT-NO-REASONING-LEAK` | R-03 |
| `BUG-ASSISTANT-RESPECT-3-GATES` | R-04 |
| `BUG-ASSISTANT-NO-PROMISE-NO-RENDER` | R-05 |
| `BUG-ASSISTANT-RESPECT-PERSONA-ROLE` | CA-33, P1-08 |
| `BUG-ASSISTANT-RESPECT-PERSONA-CATEGORY` | CA-34 |
| `BUG-ASSISTANT-DIFF-BEFORE-MATCHES-CURRENT` | CA-16, P1-03 |
| `BUG-ASSISTANT-VERSION-RACE` | CA-17, P1-04 (mock layer) |
| `BUG-ASSISTANT-HISTORY-TRUNCATION` | CA-20, P1-02 |
| `BUG-ASSISTANT-OUT-OF-SCOPE-ACTIVE-TOOLS` | P1-07 |
| `BUG-ASSISTANT-CANONICAL-TOPIC-PROTECTION` | P1-11 |
| `BUG-ASSISTANT-REJECT-LOOP-ADAPTS` | P1-06 |
| `BUG-ASSISTANT-EXAMPLE-LIMIT-WARNING` | P1-09 |

### Camada 3 — Eval LLM real (nightly)

Novo arquivo: `tests/eval/assistant-flow.eval.test.ts`

| Cenário do eval | Cobre |
|-----------------|-------|
| "deixa menos formal" → clarification + propose válido | CA-31 |
| "adiciona exemplo de preço" → clarification + propose válido | CA-31, CA-25 |
| "remove o tópico de comissão" → identifica targetId existente + propose | CA-26 |
| "cumprimenta pelo nome assim que entrar" → recusa explicando | CA-32 |
| Persona concierge + "fala de parcela" → recusa | CA-33 |
| Persona auto + "exemplo sobre apartamento" → recusa | CA-34 |

### Integration

| Cenário | Arquivo |
|---------|---------|
| `POST` end-to-end com mock LLM (route + DB read) | `src/app/api/admin/personas/[id]/assist/route.integration.test.ts` |
| Version race (2 admins) | `tests/integration/persona-assist-race.test.ts` |
| Path traversal / UUID validation (S-06) | parte de `route.integration.test.ts` |

### E2E Playwright

Novo arquivo: `tests/e2e/admin-persona-assistant.spec.ts`

| Cenário E2E | Spec |
|-------------|------|
| P0-01..07 (golden path completo) | `describe('Persona Assistant — happy path')` |
| P1-12 (2 abas) | `describe('Persona Assistant — multi-tab')` |
| S-03 (no key leak) | parte do happy path + `expect(response.body).not.toContain('sk-ant-')` |
| S-05 (XSS escape) | `describe('Persona Assistant — XSS escape')` |

### Manual UI (gate final)

- Layout responsivo (≤768px vira Sheet).
- Frame rate sidebar aberto (P-03).
- Visual do DiffCard (cores: before vermelho riscado, after verde).
- Acessibilidade básica (Tab navigation, screen reader announces).

---

## 11. Riscos de falsa aprovação

> Onde testes verdes podem coexistir com feature quebrada em prod. **Mitigar antes do gate final**.

| # | Risco | Por quê acontece | Mitigação |
|---|-------|------------------|-----------|
| RA-01 | Cassettes Camada 2 mockam LLM — o **prompt real** do assistant pode estar diferente do que o cassette assume; testes passam mas LLM real falha. | `MockLanguageModelV3` recebe stream pré-gravado; não roda system prompt. | Camada 1 (`assistant-prompt.test.ts`) faz **scan de substring** do prompt real garantindo regras-chave presentes. Camada 3 nightly valida comportamento end-to-end com LLM real. |
| RA-02 | HARD_RULES.md fica desatualizado após mexer em `system-prompt.ts` ou adicionar cassette novo. Assistant gera saída válida pelo doc velho mas inválida pela regra nova. | Doc humano vs código vivo. | `HARD_RULES.test.ts` (CA-28) **scaneia cassettes** existentes e exige sync. Se um cassette novo introduz frase proibida e doc não menciona → FAIL no PR. |
| RA-03 | `propose_patch.execute()` valida `before`, mas race entre **fetch da row** e **emit do patch** ainda permite stale window de ~500ms. | Server lê row no início do POST e usa no system prompt; UPDATE de outro admin durante o stream não é detectado até o emit. | Validar `version` **no momento do emit do patch** (não só no início do POST). Pegar `SELECT version FROM personas WHERE id = ...` dentro de `propose_patch.execute()`. |
| RA-04 | E2E Playwright passa em `localhost.orb.local` mas falha em prod por causa de cookie/session config diferente. | Auth helper de E2E faz bypass de session. | Adicionar 1 cenário E2E **com session real** (login completo via UI, não mock). Roda em smoke pós-deploy. |
| RA-05 | Apply chama `setValue` com `shouldDirty: true`, mas form do Next.js 16 com React 19 + React Compiler pode pular re-render → botão Salvar não habilita visualmente. | React Compiler memoization quirks. | E2E **explicitamente** checa `Salvar.toBeEnabled()` após Aplicar (não confiar em assertion de `dirty` interno). |
| RA-06 | Assistant pode gerar `example.add.after.agentReply` que contém valor monetário inventado (ex: "R$ 800/mês"), violando HARD_RULE de "use valor literal das tools". Test só checa frases proibidas, não verifica padrão `R$ XXX`. | Lista de proibições é finita; padrões numéricos não estão. | Adicionar regex check em `validate_against_rules` para `R\$\s*[\d.]+` **em `agentReply` de examples**, com lista de exceções (placeholders `{value}` permitidos). Cobertura em Camada 1. |
| RA-07 | Rate limit em CA-14 testado com mock — produção usa Redis (ou similar) compartilhado; pode haver bypass se admin abrir múltiplas sessões. | Mock testa key=session.user.id, mas prod pode ter chave diferente. | Integration test usa o Redis real do workspace. |
| RA-08 | LLM pode "fingir" que validou via `validate_against_rules` mas não chamou de fato. Server-side **sempre** valida no emit, mas test pode confundir ordem. | Tool call ordering em streams é frágil. | Assertion no cassette: `expect(toolCalls.indexOf('validate_against_rules')).toBeLessThan(toolCalls.indexOf('propose_patch'))` quando ambos disparam — ou aceitar `propose_patch` sozinho desde que `execute()` rode a validação interna. Documentar invariante no `assistant-prompt.ts`. |
| RA-09 | DiffCard renderiza `before` do payload (que LLM mandou) ao invés do **DB atual**. LLM pode inventar `before` plausível; admin vê diff bonito mas `Aplicar` sobrescreve um valor diferente do esperado. | Confiança implícita no payload. | `DiffCard` componente client **NÃO usa `patch.before`** — busca o valor do form atual via `formMethods.getValues(field)` para mostrar visualmente. Server ainda valida no emit. |
| RA-10 | Conversa stateless (D8) mas se o usuário recarregar acidentalmente, perde 20 turns de trabalho. UX percebe como bug. | Decisão de produto. | Mitigação opcional V2: persistir conversa em `sessionStorage` (NÃO `localStorage`) — sobrevive reload, morre ao fechar aba. Não-bloqueante pro MVP. |

---

## 12. Definition of Done

A feature está **pronta para release** quando **TODOS** os itens abaixo estão verdes:

### Gate de release (P0)
- [ ] **CA-01 até CA-34** verificados (assertion ou screenshot por critério)
- [ ] **P0-01 até P0-07** passando em Playwright
- [ ] **R-01 até R-05** passando em Camada 2 (cassettes determinísticos)
- [ ] **S-01 até S-06** passando em integration + manual
- [ ] Suite `npm run test:pre-commit` verde (Camadas 1 + 2)
- [ ] Suite `tests/integration/**` verde no CI
- [ ] Suite `tests/e2e/admin-persona-assistant.spec.ts` verde no CI

### Gate de qualidade (P1)
- [ ] **P1-01 até P1-12** passando (cassette ou manual)
- [ ] **P-01..P-03** dentro do orçamento de latência/frame rate

### Gate nightly (não bloqueia merge)
- [ ] `tests/eval/assistant-flow.eval.test.ts` em ≥ 80% pass rate em 3 rodadas consecutivas

### Documentação e operação
- [ ] `src/lib/agent/HARD_RULES.md` versionado no commit da feature
- [ ] `src/lib/agent/HARD_RULES.test.ts` em sync (CA-28 passa)
- [ ] Spec atualizado com qualquer decisão tomada durante implementação
- [ ] Done report gerado em `.done/2026-05-19-NNNN-ai-assistant-persona-edit.md` via skill `done-report`
- [ ] PR description menciona: novas tabelas (zero), novas envs (zero ou `AI_MODEL_ASSISTANT` opcional), feature flags (a definir — recomendado `FEATURE_PERSONA_ASSISTANT=true`)
- [ ] Manual UX confirmado pelo Kairo em `helena-auto-conhecido` real (fluxo P0-01..03)

### Anti-falsa-aprovação
- [ ] RA-01 até RA-10 da seção 11 endereçados (cada um com check concreto)
- [ ] Smoke pós-deploy em dev: criar 1 persona de teste, rodar fluxo P0-01..03 em ambiente real (não local)

---

## Apêndice A — referências do código

- `src/db/schema.ts` linhas 289-337 — tabela `personas` (`version` integer, `voiceTone` text, `examples` jsonb, `forbiddenTopics` jsonb, `handoffTriggers` jsonb)
- `src/lib/agent/system-prompt.ts` — HARD_RULES atuais (linhas 63-352)
- `src/app/api/admin/personas/preview/route.ts` linhas 12-35 — padrão `requireRole("admin")` + `checkRateLimit(session.user.id)`
- `tests/regression/agent-trajectory.test.ts` — cassettes existentes (BUG-NO-CTA-AFTER-NAME ~1134, BUG-META-NARRATIVE ~179, BUG-INTERNAL-REASONING-LEAK ~1407, BUG-AUTO-SKIPS-PRE-VALUE-GATES ~1583, BUG-TOPIC-PICKER ~289, BUG-SAVE-CONTACT-NAME-MUST-FIRE ~1072)
- `tests/eval/agent-flow.eval.test.ts` — padrão user-bot (Haiku) + agent real (Sonnet)
- `docs/test-plans/lead-capture-web.md` — referência de estilo (este plano segue o mesmo formato)

---

## Apêndice B — convenções de naming dos cassettes

Para manter consistência com `agent-trajectory.test.ts`:

- Prefixo: `BUG-ASSISTANT-` (separa do agent de produção)
- Sufixo: ação ou regra (`-NO-CTA-LEAK`, `-RESPECT-3-GATES`, etc)
- Cada `describe` self-contained — sem state shared
- Mock-only — zero chamada Anthropic real (Camada 2 = determinístico)
- Asserts em camadas: cassette dispara detector (regex/contagem) **E** asserts estruturais no prompt/builder/schema
- Tempo alvo por cassette: < 100ms; suite inteira (já + os 16 novos) < 30s
