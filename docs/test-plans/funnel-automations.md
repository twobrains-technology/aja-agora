# TEST-PLAN — Funnel Automations

> Feature: Admin cria automações de funil que disparam ações (WhatsApp / Email / move stage / add note) ao mover lead entre stages ou quando lead fica idle. Inclui editor React Flow, AI Builder, engine BullMQ, gestão de templates Meta e UI de runs.
>
> Stack relevante: Next.js 16 + Drizzle + Postgres + BullMQ/Redis + @xyflow/react + Vercel AI SDK 6 (Claude Sonnet 4.6) + SendGrid + WhatsApp Cloud API v21.

---

## 1. Escopo

### Em escopo
- CRUD de automações (`/admin/automations` listagem + `/admin/automations/[id]` editor React Flow).
- Persistência do grafo em Postgres (Drizzle): nodes + edges + metadata + enabled flag + version.
- AI Builder via `generateObject` (Claude Sonnet 4.6) que converte prompt em grafo válido contra schema Zod.
- Engine de execução em worker BullMQ separado com 3 filas: `automation:evaluate`, `automation:step`, `automation:delayed`.
- Hook em `transitionLeadStage` (`src/lib/admin/lead-transitions.ts`) que enfileira `automation:evaluate`.
- Detector de idle (`idle_in_stage`) via job recorrente que escaneia `lead_events` mais recente por lead.
- Nodes implementados: Trigger (`stage_changed`, `idle_in_stage`, `chat_event`), Condition (`has_field`, `recently_received`), Action (`send_whatsapp` template+free_text, `send_email`, `move_to_stage`, `add_note`), Flow (`wait`, `end`).
- Validação no editor (frontend) e no worker (backend) — schema é fonte única.
- Gestão de WhatsApp Templates (`/admin/whatsapp-templates`): cadastro, submissão à Meta, sync de status via API + webhook `message_template_status_update`, listagem com filtro por status.
- Janela 24h Meta enforced no worker — `send_whatsapp` em modo `free_text` falha se última mensagem do lead pra plataforma >24h.
- Runs UI (`/admin/automations/[id]/runs`) com timeline por lead, status (running, completed, failed, skipped), passos com timestamps.
- Idempotência: dedup por `event_id` (lead_event UUID) — uma transição não dispara mesma automação 2x.
- Loop guard: `max_steps=50` por run, run termina em `failed_loop` se exceder.
- Retry com backoff exponencial em falha de envio (Meta/SendGrid), DLQ após 5 tentativas.
- Skip de automação se chat ativo nos últimos 5 minutos (verifica `conversations.last_user_message_at`).

### Fora de escopo (testar em fase 2)
- A/B testing entre automações.
- Branching condicional avançado (switch com mais de 2 saídas).
- Time-of-day windows (só disparar 9h-18h).
- Templates dinâmicos com variáveis calculadas (ex: nome do grupo do consórcio).
- Importar/exportar automação em JSON.
- Versionamento histórico do grafo (manter só `version` int incremental, sem rollback UI).
- Métricas agregadas (conversion rate por automação).

---

## 2. Pré-requisitos

### Envs (.env.test)
- `DATABASE_URL=postgres://aja:aja@localhost:5432/aja_test`
- `REDIS_URL=redis://localhost:6379/1`
- `ANTHROPIC_API_KEY=sk-ant-test-...` (chave real, baixo custo — generateObject)
- `META_GRAPH_API_BASE_URL=http://localhost:4001/meta-mock` (mock server)
- `META_WHATSAPP_PHONE_NUMBER_ID=test-phone-id`
- `META_WHATSAPP_TOKEN=test-meta-token`
- `META_WEBHOOK_VERIFY_TOKEN=test-verify-token`
- `SENDGRID_API_KEY=SG.test-...` (mock via nock/MSW)
- `SENDGRID_FROM_EMAIL=test@aja.local`
- `AUTOMATION_MAX_STEPS=50`
- `AUTOMATION_CHAT_ACTIVE_WINDOW_MS=300000` (5min)
- `AUTOMATION_META_24H_WINDOW_MS=86400000`

### Seeds (script `pnpm seed:test`)
- 1 admin user (`admin@aja.local`, role=admin)
- 7 leads, um por stage (`novo`, `engajado`, `qualificado`, `em_negociacao`, `proposta_enviada`, `fechado_ganho`, `perdido`)
- 2 leads com email vazio + 2 com telefone vazio (cenários `has_field`)
- 1 conversa WhatsApp ativa (última mensagem do lead há 1h — dentro da janela 24h)
- 1 conversa WhatsApp expirada (última mensagem do lead há 25h)
- 4 templates WhatsApp: `boas_vindas` APPROVED, `lembrete_assembleia` PENDING, `oferta_promo` REJECTED, `pausa_meta` PAUSED
- 2 automações pré-cadastradas: 1 enabled válida, 1 disabled

### Mocks
- **Meta mock server (porta 4001)**: aceita `POST /v21.0/{phone}/messages` (template + text), `POST /v21.0/{waba_id}/message_templates` (cadastro), `GET /v21.0/{waba_id}/message_templates` (listagem com status). Endpoint admin pro teste forçar webhook `message_template_status_update` com qualquer status.
- **SendGrid mock**: nock interceptando `https://api.sendgrid.com/v3/mail/send` — responde 202 por default, com path pra forçar 500/429.
- **Anthropic real**: bater na API real com prompt curto pro AI Builder (custo aceitável).

### Fixtures
- `tests/fixtures/automations/stage-changed-engajado-to-qualificado-whatsapp.json` — automação canônica P0.
- `tests/fixtures/automations/idle-7d-email.json`
- `tests/fixtures/automations/loop-bait.json` — automação que move pra stage anterior pra disparar outra (loop guard).
- `tests/fixtures/meta/template-status-update-approved.json` — payload webhook.

### Contas/personas
- Admin: `admin@aja.local` / senha em `.env.test`
- Lead-persona: criado dinâmico via `POST /api/leads` em cada teste (cleanup no afterEach).

---

## 3. Cenários (P0 — happy path)

### CA-P0-01: Criar automação simples via editor React Flow e persistir
- **Setup:** Admin logado em `/admin/automations`. Banco zerado (sem automações além das seeds).
- **Ação:**
  1. Click "Nova Automação" → navega para `/admin/automations/new`.
  2. Arrastar Trigger `stage_changed` (from=`engajado`, to=`qualificado`) e Action `send_whatsapp` (mode=template, name=`boas_vindas`).
  3. Conectar trigger → action.
  4. Nomear "Boas-vindas Qualificado" e clicar Save.
- **Critério de aceite (binário):**
  - É verdade que `POST /api/admin/automations` retornou 201 com body `{ id: <uuid>, name: "Boas-vindas Qualificado", enabled: false, version: 1 }`.
  - É verdade que tabela `automations` contém row com `name="Boas-vindas Qualificado"` e `graph.nodes.length === 2` e `graph.edges.length === 1`.
  - É verdade que página redireciona para `/admin/automations/<id>` e mostra o grafo renderizado com 2 nodes.
- **Output esperado:** Row no DB conforme acima; screenshot do editor com 2 nodes conectados; log do worker BullMQ sem nenhum job enfileirado (automação `enabled=false`).

### CA-P0-02: Ativar automação e disparar via transição de stage
- **Setup:** Automação CA-P0-01 criada, `enabled=false`. Lead `lead-engajado-01` em stage `engajado`. Template `boas_vindas` APPROVED. Sem chat ativo (`last_user_message_at` null).
- **Ação:**
  1. Toggle `enabled=true` na lista de automações.
  2. Via API admin `POST /api/admin/leads/<id>/transition` body `{ toStage: "qualificado" }`.
  3. Aguardar 3s.
- **Critério de aceite (binário):**
  - É verdade que `automations.enabled=true`.
  - É verdade que `lead_events` ganhou row `{ leadId, fromStage:"engajado", toStage:"qualificado", actorType:"admin" }`.
  - É verdade que fila `automation:evaluate` recebeu 1 job com `{ leadEventId: <id>, leadId, toStage:"qualificado" }`.
  - É verdade que mock Meta recebeu `POST /v21.0/test-phone-id/messages` com body contendo `"type":"template"` e `"name":"boas_vindas"`.
  - É verdade que `automation_runs` contém row com `automation_id=<id>`, `lead_id=<id>`, `status="completed"`, `steps_executed=2`.
- **Output esperado:** Log estruturado worker `automation.evaluate -> matched -> step -> send_whatsapp.ok`; row em `automation_runs` com timeline; chamada interceptada no Meta mock.

### CA-P0-03: Gerar automação via AI Builder
- **Setup:** Admin em `/admin/automations/new` com aba "Construir com IA" aberta.
- **Ação:** Digitar "Quando lead passar de qualificado pra em_negociacao, esperar 2 horas e enviar email com assunto 'Vamos conversar?'" → click "Gerar".
- **Critério de aceite (binário):**
  - É verdade que `POST /api/admin/automations/ai-build` retorna 200 em <30s com body `{ graph: { nodes: [...], edges: [...] } }`.
  - É verdade que `graph.nodes` contém exatamente 1 trigger `stage_changed` (from=`qualificado`, to=`em_negociacao`), 1 `wait` (`durationMs=7200000`), 1 `send_email` (subject contém "Vamos conversar"), 1 `end`.
  - É verdade que grafo passa validação Zod no backend (sem erros).
  - É verdade que o editor renderiza os 4 nodes conectados em sequência.
- **Output esperado:** JSON do grafo válido conforme schema; screenshot do editor renderizando o grafo; log Anthropic com prompt + tokens.

### CA-P0-04: Cadastrar template WhatsApp e submeter à Meta
- **Setup:** Admin em `/admin/whatsapp-templates`. Mock Meta configurado pra responder 201 no submit.
- **Ação:**
  1. Click "Novo Template", preencher `{ name: "lembrete_pagamento", language: "pt_BR", category: "UTILITY", components: [{type:"BODY", text:"Oi {{1}}, lembrete..."}] }`.
  2. Click Save → status local `DRAFT`.
  3. Click "Submeter à Meta".
- **Critério de aceite (binário):**
  - É verdade que mock Meta recebeu `POST /v21.0/<waba_id>/message_templates` com body matching schema Meta.
  - É verdade que tabela `whatsapp_templates` tem row com `name="lembrete_pagamento"`, `meta_template_id=<retornado pelo mock>`, `status="PENDING"`.
  - É verdade que UI mostra badge "PENDING" na linha do template.
- **Output esperado:** Row no DB; chamada interceptada; screenshot.

### CA-P0-05: Sync de status via webhook `message_template_status_update`
- **Setup:** Template `lembrete_pagamento` em status `PENDING` (CA-P0-04).
- **Ação:** Disparar `POST /api/webhooks/meta` com payload `message_template_status_update` `{ event: "APPROVED", message_template_id: <id> }` (X-Hub-Signature válida).
- **Critério de aceite (binário):**
  - É verdade que endpoint retorna 200.
  - É verdade que row `whatsapp_templates` atualizou `status="APPROVED"` e `last_status_update_at` é dentro dos últimos 5s.
  - É verdade que UI (após reload) mostra badge "APPROVED" verde.
- **Output esperado:** Row atualizada; log webhook com payload; screenshot UI.

### CA-P0-06: Trigger `idle_in_stage` dispara após duração
- **Setup:** Lead `lead-qualificado-01` em stage `qualificado` há 24h (forçar `lead_events.created_at = now() - 25h`). Automação enabled: trigger `idle_in_stage(stage=qualificado, durationMs=86400000)` → action `send_email`. Job recorrente `automation:scan-idle` configurado pra rodar a cada 1min.
- **Ação:** Disparar manualmente job `automation:scan-idle` (não esperar cron real).
- **Critério de aceite (binário):**
  - É verdade que `automation_runs` ganhou 1 row pra esse lead com `status="completed"`.
  - É verdade que SendGrid mock recebeu 1 chamada com `to=<lead.email>` e subject correto.
  - É verdade que `automation_run_dedup` registrou key `<automation_id>:<lead_id>:idle:<stage>` (evita re-disparar amanhã).
- **Output esperado:** Run completa; chamada SendGrid interceptada; row dedup.

### CA-P0-07: Action `move_to_stage` avança lead corretamente
- **Setup:** Lead em `novo`. Automação: trigger `chat_event(asked_for_human)` → action `move_to_stage(em_negociacao)` + `add_note("Cliente pediu humano")`.
- **Ação:** `POST /api/chat/events` simulando evento `asked_for_human` pra esse lead.
- **Critério de aceite (binário):**
  - É verdade que `leads.stage="em_negociacao"`.
  - É verdade que `lead_events` ganhou row `{ fromStage:"novo", toStage:"em_negociacao", actorType:"system" }`.
  - É verdade que `lead_notes` contém row `{ leadId, body:"Cliente pediu humano", source:"automation" }`.
- **Output esperado:** Estado DB conforme; timeline da automação mostra ambos passos OK.

---

## 4. Edge cases (P1)

### CA-P1-01: Janela 24h Meta — `free_text` fora da janela falha graciosamente
- **Setup:** Lead com última mensagem WhatsApp há 25h. Automação: trigger `stage_changed` → action `send_whatsapp(mode=free_text, body="oi")`.
- **Ação:** Disparar transição de stage.
- **Critério de aceite (binário):**
  - É verdade que mock Meta NÃO recebeu chamada `POST /messages`.
  - É verdade que `automation_runs.status="failed"` com `error_code="META_24H_WINDOW_EXPIRED"`.
  - É verdade que UI Runs mostra esse run em vermelho com a mensagem do erro.
- **Output esperado:** Run failed; zero chamadas Meta.

### CA-P1-02: Template PENDING/REJECTED/PAUSED bloqueado no editor
- **Setup:** Templates `lembrete_assembleia` PENDING, `oferta_promo` REJECTED, `pausa_meta` PAUSED.
- **Ação:** No editor, abrir dropdown de templates em uma action `send_whatsapp(template)`.
- **Critério de aceite (binário):**
  - É verdade que apenas templates com `status="APPROVED"` aparecem selecionáveis no dropdown.
  - É verdade que tentar salvar automação com referência a template não-APPROVED (via payload direto na API) retorna 400 com `error="template_not_approved"`.
- **Output esperado:** Screenshot dropdown só com APPROVED; resposta API 400.

### CA-P1-03: Template APPROVED muda pra PAUSED com automação ativa rodando
- **Setup:** Automação enabled usando template `boas_vindas` APPROVED. Trigger transição agendado (em wait 10s antes de enviar).
- **Ação:**
  1. Disparar trigger.
  2. Durante o wait, disparar webhook `message_template_status_update` mudando `boas_vindas` pra `PAUSED`.
  3. Aguardar wait completar (10s) e action executar.
- **Critério de aceite (binário):**
  - É verdade que worker re-valida template no momento do envio.
  - É verdade que `automation_runs.status="failed"` com `error_code="TEMPLATE_NOT_APPROVED_AT_SEND_TIME"`.
  - É verdade que zero chamadas a Meta `/messages` ocorreram para esse run.
- **Output esperado:** Run failed com erro específico; sem chamada Meta.

### CA-P1-04: Loop infinito — guard de max_steps
- **Setup:** Automação A: trigger `stage_changed(to=qualificado)` → action `move_to_stage(engajado)`. Automação B: trigger `stage_changed(to=engajado)` → action `move_to_stage(qualificado)`. Ambas enabled. Lead em `engajado`.
- **Ação:** `POST /admin/leads/<id>/transition { toStage: "qualificado" }`.
- **Critério de aceite (binário):**
  - É verdade que após max_steps=50, run para com `status="failed_loop"`.
  - É verdade que `leads.stage` está em `engajado` ou `qualificado` (último estado antes do guard).
  - É verdade que log estruturado contém `automation.loop_detected automation_id=<A_or_B> run_id=<id>`.
  - É verdade que UI Runs mostra esse run vermelho com label "loop detectado".
- **Output esperado:** Run failed; log de loop; estado lead consistente.

### CA-P1-05: Idempotência — mesma transição não dispara automação 2x
- **Setup:** Automação enabled trigger `stage_changed(engajado→qualificado)` → send_email. Worker com 2 réplicas (simular concorrência via 2 jobs idênticos enfileirados manualmente).
- **Ação:** Enfileirar 2x o job `automation:evaluate` com mesmo `leadEventId`.
- **Critério de aceite (binário):**
  - É verdade que apenas 1 row em `automation_runs` foi criada para esse `lead_event_id`.
  - É verdade que SendGrid mock recebeu exatamente 1 chamada.
  - É verdade que segundo job marca-se como `skipped_duplicate` em log estruturado.
- **Output esperado:** 1 run; 1 email; 1 skip log.

### CA-P1-06: Skip se chat ativo nos últimos 5min
- **Setup:** Lead com `conversations.last_user_message_at = now() - 2min` (chat ativo). Automação enabled `stage_changed → send_whatsapp`.
- **Ação:** Disparar transição.
- **Critério de aceite (binário):**
  - É verdade que `automation_runs` row criada com `status="skipped"` e `skip_reason="chat_active"`.
  - É verdade que zero chamadas Meta foram feitas.
  - É verdade que UI Runs mostra badge cinza "skipped — chat ativo".
- **Output esperado:** Run skipped; sem chamadas.

### CA-P1-07: Condition `has_field` sem email pula action send_email
- **Setup:** Lead com `email=null`. Automação: trigger → condition `has_field(field=email, op=is_set)` → action `send_email`. Branch "false" do condition → action `add_note`.
- **Ação:** Disparar trigger.
- **Critério de aceite (binário):**
  - É verdade que SendGrid mock recebeu 0 chamadas.
  - É verdade que `lead_notes` ganhou 1 row.
  - É verdade que `automation_runs.steps` JSON contém `[trigger.ok, condition.false, add_note.ok, end]`.
- **Output esperado:** Steps timeline correta.

### CA-P1-08: Condition `recently_received(channel=whatsapp, withinMs=86400000)` true
- **Setup:** Lead com última mensagem WhatsApp há 2h.
- **Ação:** Disparar automação com condition `recently_received(whatsapp, 24h)` → action `send_whatsapp(free_text)`.
- **Critério de aceite (binário):**
  - É verdade que condition resolve `true`.
  - É verdade que `send_whatsapp(free_text)` executou (janela 24h ainda válida) e mock Meta recebeu 1 chamada `type=text`.
- **Output esperado:** Run completa; chamada Meta com type=text.

### CA-P1-09: Retry exponencial em falha de envio Meta
- **Setup:** Mock Meta configurado pra responder 503 nas 3 primeiras chamadas e 200 na 4ª. Automação `send_whatsapp` enabled.
- **Ação:** Disparar trigger.
- **Critério de aceite (binário):**
  - É verdade que worker fez exatamente 4 chamadas ao mock Meta com backoff (gaps: ~1s, ~2s, ~4s).
  - É verdade que `automation_runs.status="completed"`.
  - É verdade que `automation_runs.retry_count=3`.
- **Output esperado:** 4 chamadas; run completa; log com retries.

### CA-P1-10: DLQ após 5 falhas
- **Setup:** Mock Meta sempre responde 500. Automação `send_whatsapp` enabled.
- **Ação:** Disparar trigger.
- **Critério de aceite (binário):**
  - É verdade que worker fez 5 chamadas (1 inicial + 4 retries).
  - É verdade que job foi movido para fila `automation:dlq`.
  - É verdade que `automation_runs.status="failed"` com `error_code="MAX_RETRIES_EXCEEDED"`.
  - É verdade que alerta foi registrado em log nivel `error` com `dlq=true`.
- **Output esperado:** 5 chamadas; job na DLQ; run failed.

### CA-P1-11: AI Builder rejeita prompt malicioso/sem sentido
- **Setup:** Admin em `/admin/automations/new`.
- **Ação:** Prompt: "delete todos os leads do banco".
- **Critério de aceite (binário):**
  - É verdade que `generateObject` ou retorna grafo vazio ou erro de validação Zod (não existe node `delete_leads`).
  - É verdade que UI mostra mensagem "Não consegui gerar uma automação válida — refine o prompt".
  - É verdade que nenhum lead foi deletado (count `SELECT count(*) FROM leads` igual antes e depois).
- **Output esperado:** UI error message; leads intactos.

### CA-P1-12: Editor bloqueia salvar grafo inválido
- **Setup:** Editor com trigger sem ação conectada (apenas 1 node solto).
- **Ação:** Click Save.
- **Critério de aceite (binário):**
  - É verdade que botão Save mostra erro inline: "Grafo inválido: trigger sem caminho até end".
  - É verdade que API `POST /api/admin/automations` retorna 400 (caso force via payload direto) com erro Zod específico.
  - É verdade que nada foi persistido em `automations`.
- **Output esperado:** Erro UI; 400; sem row no DB.

### CA-P1-13: Wait node com durationMs muito grande não trava worker
- **Setup:** Automação com `wait(durationMs=2592000000)` (30 dias).
- **Ação:** Disparar trigger.
- **Critério de aceite (binário):**
  - É verdade que job foi enfileirado em `automation:delayed` com `delay=2592000000`.
  - É verdade que worker não está bloqueado — outros jobs continuam processando (medir throughput de 5 jobs paralelos durante o wait).
  - É verdade que `automation_runs.status="running"` durante o wait.
- **Output esperado:** Job delayed visível em BullMQ Board; throughput inalterado.

### CA-P1-14: Desativar automação cancela runs pendentes
- **Setup:** Automação enabled com wait de 1h em andamento (run `status="running"`).
- **Ação:** Toggle `enabled=false`.
- **Critério de aceite (binário):**
  - É verdade que `automation_runs.status` muda pra `cancelled` para runs em andamento (ou worker checa enabled no resume e marca cancelled).
  - É verdade que action pós-wait NÃO executa.
  - É verdade que zero chamadas Meta/SendGrid após disable.
- **Output esperado:** Runs cancelled; sem envios.

### CA-P1-15: Múltiplas automações no mesmo trigger executam em paralelo isoladas
- **Setup:** 3 automações enabled, todas com trigger `stage_changed(engajado→qualificado)`, ações diferentes (send_whatsapp, send_email, add_note).
- **Ação:** Disparar 1 transição.
- **Critério de aceite (binário):**
  - É verdade que 3 rows em `automation_runs` foram criadas (1 por automação).
  - É verdade que falha de uma automação não afeta outras (forçar Meta 500 só na primeira).
  - É verdade que cada run tem seu próprio steps JSON.
- **Output esperado:** 3 runs independentes; 1 failed, 2 completed.

---

## 5. Regressões prováveis

### REG-01: Kanban admin (`/admin/leads`) continua mostrando stages corretamente
- **Risco:** Hook em `transitionLeadStage` pode quebrar fluxo síncrono.
- **Critério:** Mover lead via drag-and-drop no Kanban continua atualizando `leads.stage` e `lead_events` (sem regressão de UX).

### REG-02: Simulator WhatsApp (`/admin/simulator/whatsapp`) continua funcional
- **Risco:** Mudanças em `src/lib/whatsapp/api.ts` ou `processor.ts` podem afetar simulator.
- **Critério:** Enviar mensagem no simulator continua chegando no agente do chat e respondendo (regression suite existente em `processor.test.ts` passa).

### REG-03: Agente do chat (Claude tool calling) não conflita com automações
- **Risco:** Automação dispara `send_whatsapp` enquanto agente também está respondendo no chat web — duplica mensagem ou contradiz contexto.
- **Critério:** Skip de chat ativo (CA-P1-06) cobre. Verificar que automação respeita janela `last_user_message_at` mesmo em chat web (não só WhatsApp).

### REG-04: Drizzle migrations existentes não quebram
- **Risco:** Novas tabelas (`automations`, `automation_runs`, `automation_run_dedup`, `whatsapp_templates`, `lead_notes`) adicionadas sem conflito.
- **Critério:** `drizzle-kit generate` produz migration limpa, sem alterar tabelas existentes; rollback testado em DB de dev.

### REG-05: Webhook Meta `/api/webhooks/meta` continua processando mensagens (não só template status)
- **Risco:** Novo handler `message_template_status_update` pode mascarar `messages` payload.
- **Critério:** Mensagens normais (texto, interactive) continuam roteadas pro processor; teste existente passa.

### REG-06: BullMQ existente (se houver) coexiste com novas filas
- **Risco:** Novas filas `automation:*` brigam por conexão Redis ou eventos.
- **Critério:** Filas existentes (caso existam) não veem aumento de latência; Redis pool size configurado.

### REG-07: Auth admin (`require-role.ts`) continua bloqueando rotas
- **Risco:** Novas rotas `/admin/automations/*` e `/admin/whatsapp-templates/*` precisam exigir admin.
- **Critério:** Usuário não-admin recebe 401/redirect em todas as novas rotas.

---

## 6. Pontos de falha conhecidos

### PF-01: Race condition transição → enqueue → execução
Worker pode processar `automation:evaluate` antes da transação que commitou `lead_events` ter sido vista por replica/snapshot. **Mitigação esperada:** `transitionLeadStage` enfileira após `await db.transaction(...)` commit; worker faz `SELECT FOR UPDATE` em `lead_events` ou aguarda 100ms grace period. **Cobertura:** CA-P0-02 + teste de carga com 100 transições paralelas.

### PF-02: Janela 24h depende de relógio do servidor vs Meta
Se servidor estiver com clock skew, lead que tecnicamente está dentro de 24h pode ser bloqueado (ou vice-versa). **Mitigação:** Usar `messages.created_at` armazenado quando webhook chegou, não `now()` no momento da decisão; warning se skew >5min vs NTP. **Cobertura:** CA-P1-01 + CA-P1-08 testam ambos lados.

### PF-03: Status Meta async pode chegar fora de ordem
Webhook `APPROVED` pode chegar depois de `PAUSED` se rede atrasar. **Mitigação:** Comparar `last_status_update_at` antes de atualizar; só aplicar mudança se evento é mais recente. **Cobertura:** Cenário extra a adicionar — submeter 2 webhooks com timestamps invertidos.

### PF-04: AI Builder pode gerar grafo válido sintaticamente mas semanticamente quebrado
Ex: trigger `stage_changed(from=fechado_ganho, to=novo)` (transição backward que nunca acontece). **Mitigação:** Validador semântico no backend além de Zod: rejeitar transições impossíveis dado `STAGE_ORDER`. **Cobertura:** Adicionar cenário CA-P1-16 (ver §7 critério global).

### PF-05: Multi-canal — lead recebe automação WhatsApp enquanto está no chat web
Já coberto por CA-P1-06. Risco residual: chat web "ativo" pode ser stale (usuário fechou aba sem timeout). **Mitigação:** `last_user_message_at` vs `last_assistant_message_at` — só skip se user enviou recentemente, não se agente respondeu sozinho.

### PF-06: Loop entre 3+ automações (cíclico longo)
CA-P1-04 cobre loop 2-ciclos. Loop A→B→C→A só é detectado por max_steps. **Mitigação:** Já cobre via max_steps=50. Risco de gastar tempo/dinheiro até bater no guard. **Cobertura:** Adicionar log de aviso em N=25 steps (metade do guard) pra alertar antes de hit total.

### PF-07: Worker crash mid-run deixa run em `status="running"` órfão
Se Node morre durante step. **Mitigação:** TTL no run (ex: `expires_at = started_at + 24h`); job recorrente que marca runs órfãos como `failed_orphan`. **Cobertura:** Cenário extra (manualmente kill -9 worker durante wait, verificar cleanup).

### PF-08: Dedup key colide entre automações diferentes pro mesmo lead_event
Se dedup é `lead_event_id` só, 2 automações no mesmo trigger compartilham key. **Mitigação:** Dedup key deve ser `<lead_event_id>:<automation_id>`. **Cobertura:** CA-P1-15 valida indiretamente.

### PF-09: SendGrid rate limit (429) tratado como falha permanente
Se SendGrid retorna 429, retry deve respeitar `Retry-After` header. **Mitigação:** Parser de Retry-After, backoff mínimo 60s. **Cobertura:** Cenário extra a adicionar.

### PF-10: Editor React Flow perde estado em refresh sem salvar
Admin perde 30min de trabalho. **Mitigação:** Auto-save draft em localStorage a cada 10s; warning em `beforeunload`. **Cobertura:** Cenário UX extra.

### PF-11: Templates Meta com parâmetros `{{N}}` exigem ordem exata
Action `send_whatsapp(template, params=["João","R$ 500"])` mapeia `{{1}}=João`, `{{2}}=R$ 500`. Se admin trocar ordem, Meta rejeita ou exibe errado. **Mitigação:** Editor mostra preview do template com `{{N}}` numerados; campo de params named (label opcional). **Cobertura:** Cenário UX a adicionar — preview deve refletir params na ordem.

### PF-12: Concorrência de update na mesma automação (2 admins editando)
Versão otimista via `version` int. **Mitigação:** `PATCH /api/admin/automations/<id>` exige `version` no body; retorna 409 se conflito. **Cobertura:** Cenário extra (2 sessões simulâneas).

---

## 7. Critérios de aceite globais (gate de fechamento)

Feature só é "done" quando TODOS abaixo são verdadeiros:

1. CA-P0-01 a CA-P0-07 verdes.
2. CA-P1-01 a CA-P1-15 verdes.
3. REG-01 a REG-07 verdes (suite existente continua passando).
4. PF-01, PF-02, PF-03, PF-07, PF-09, PF-11, PF-12 com cenários implementados e verdes (não apenas mitigação documentada).
5. Migrations Drizzle aplicam limpo em DB zerado E em DB com dados de seed (idempotente).
6. Lint + typecheck zero warnings (`pnpm lint && pnpm typecheck`).
7. Worker BullMQ resiste a kill -9 mid-run e cleanup em <60s (PF-07).
8. AI Builder gera grafo válido em 5 prompts diferentes (smoke pra não decorar 1 prompt).
9. Documentação `docs/automations.md` cobre: como criar, status de template, debug de run, troubleshooting de loops.
10. Endpoints admin auditáveis em `audit_log` (CRUD de automação + toggle enable/disable + edição de template).
11. Métricas básicas expostas (`/api/admin/metrics/automations`): runs/hour, success rate, top error codes.
12. Zero `console.log` ou `// TODO` em código de produção; logs estruturados via logger central.

---

## 8. Out of scope (não testar agora)

- A/B test entre 2 versões de uma automação.
- Branching condicional avançado (switch com >2 saídas).
- Time-of-day windows (só disparar 9h-18h).
- Templates com variáveis dinâmicas calculadas server-side (nome do grupo etc.).
- Importar/exportar grafo como JSON via UI.
- Histórico de versões da automação (apenas `version` int incrementa; sem rollback UI).
- Métricas agregadas avançadas (funil de conversão por automação).
- Rate limit por automação ("no máximo 100 disparos/dia").
- Personalização de templates por segmento de lead.
- Webhook out — automação chamando endpoints HTTP externos como action.
- Suporte multi-idioma de templates (assumir pt_BR).
- Replay manual de run failed via UI.
