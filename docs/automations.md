# Funnel Automations — guia operacional

Feature MVP que disparam ações (WhatsApp / email / move de stage / nota) ao mover lead entre stages, lead idle ou eventos de chat.

## Como criar uma automação

1. Admin → **Automações** → **Nova automação** (ou **Gerar com IA**).
2. Arraste nodes da paleta no canvas (ou peça pra IA gerar o grafo).
3. Conecte trigger → ações → end. Cada node clicável abre um sheet de config.
4. Nomeie e ative o toggle "Ativada".
5. Salve.

## Tipos de node disponíveis

| Tipo | Quando usar |
|---|---|
| `trigger.stage_changed` | Disparar quando lead muda de stage. Configurar `toStages` (e `fromStages` opcional). |
| `trigger.idle_in_stage` | Disparar quando lead fica parado em um stage por X tempo. Scan a cada 5 min. |
| `trigger.chat_event` | Disparar em evento do chat (no_reply, asked_for_human). Pro futuro — não está plugado no chat ainda. |
| `condition.has_field` | Branch true/false baseado em email/phone preenchido. |
| `condition.recently_received` | Branch baseado em janela de 24h de mensagem inbound (WhatsApp/web). |
| `action.send_whatsapp` | Template aprovado (qualquer hora) ou texto livre (só dentro de 24h). |
| `action.send_email` | SendGrid, HTML + assunto. |
| `action.move_to_stage` | Avança lead pra outro stage. |
| `action.add_note` | Cria entrada em `lead_notes` (visível no perfil do lead). |
| `wait` | Adia próximo passo por N ms. |
| `end` | Termina o run. |

## Templates WhatsApp (Meta)

WhatsApp Cloud API obriga template aprovado pra mandar mensagem fora da janela de 24h. Cadastre em **Templates WA**:

1. Body em PT-BR com placeholders `{{1}}`, `{{2}}`, etc.
2. Submeta à Meta — review demora ~24h.
3. Status sincroniza via webhook `message_template_status_update`.
4. Só templates `APPROVED` aparecem no editor de automação.

## Engine (worker)

- Hook em `transitionLeadStage` enfileira `automation-evaluate`.
- Idle scanner cron a cada `AUTOMATION_IDLE_SCAN_INTERVAL_MS` (default 5 min).
- Worker BullMQ executa step a step, persistindo em `automation_runs` + `automation_node_executions`.
- Retries: 5x exponencial. Após DLQ default do BullMQ.
- Guard `MAX_STEPS=50` por run.
- Skip se chat ativo nos últimos `AUTOMATION_CHAT_ACTIVE_WINDOW_MS` (default 5 min).

## Como debugar

- `/admin/automations/<id>/runs` mostra histórico, status, motivo de falha.
- Logs do container worker: `docker logs aja-worker-<workspace>`.
- Erro `META_24H_WINDOW_EXPIRED` = tentou `free_text` fora da janela — usar template.
- Erro `TEMPLATE_NOT_APPROVED_AT_SEND_TIME` = template virou PAUSED/REJECTED durante o run.
- Erro `MAX_STEPS_EXCEEDED` = loop detectado.

## Envs necessárias

```bash
REDIS_URL=redis://...
WHATSAPP_BUSINESS_ACCOUNT_ID=<waba-id>
WHATSAPP_ACCESS_TOKEN=<token>
WHATSAPP_PHONE_NUMBER_ID=<phone-id>
SENDGRID_API_KEY=<sg-key>
SENDGRID_FROM_EMAIL=<from-email>
ANTHROPIC_API_KEY=<claude-key>  # pra AI Builder
AUTOMATION_IDLE_SCAN_INTERVAL_MS=300000        # opcional, default 5min
AUTOMATION_CHAT_ACTIVE_WINDOW_MS=300000        # opcional, default 5min
```

## Out of scope MVP (Fase 2)

- A/B testing entre versões.
- Branching condicional avançado (>2 saídas).
- Time-of-day windows.
- Templates dinâmicos com variáveis calculadas.
- Import/export grafo JSON.
- Histórico de versões com rollback UI.
- `audit_log` central de mudanças.
- Endpoint `/api/admin/metrics/automations`.
- Cleanup automático de runs órfãos (worker crash mid-run).
- Replay manual de runs failed.
- Rate limit por automação.
- Suporte multi-idioma de templates.
- Webhook out (automação chamando endpoint externo).
