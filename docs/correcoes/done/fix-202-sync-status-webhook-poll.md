---
id: FIX-202
titulo: "Sync de status: webhook message_template_status_update + reconcileTemplateStatuses"
status: done
commit: 2b36ff45
executado_em: 2026-07-02
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/template-sync.ts
  - src/app/api/webhook/whatsapp/route.ts
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "sempre atualizarmos seu status até ficar aprovada."

## Cenário exato
- **Passos:** 1) template submetido fica `PENDING`; 2) Meta aprova/rejeita (minutos a 24h);
  3) manda um webhook `message_template_status_update`; 4) o status local tem que refletir isso
  **sem refresh manual** e, ao aprovar, disparar a fila (FIX-201).
- **Dados usados:** payload do webhook + `GET /{WABA_ID}/message_templates` (poll de reconciliação).

## Esperado × Atual
- **Esperado:** status atualizado por webhook (tempo real) + poll de reconciliação (fallback); ao aprovar, `flushOutboundQueue`.
- **Atual:** o webhook só trata `messages`/`statuses` de mensagem; status de template é ignorado. Nenhum poll.

## Root cause (INVESTIGADO)
`src/app/api/webhook/whatsapp/route.ts:50-69` navega `body.entry[0].changes[0].value` e trata
`statuses` (entrega de mensagem) e `messages` (inbound) — **não trata** o field
`message_template_status_update`. Como não há tabela de template (até FIX-199), não havia onde
gravar. Regra global "nunca solução manual/refresh" → precisa das duas vias (webhook + poll).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `applyTemplateStatusUpdate(payload)`: atualiza `whatsappTemplates` por `metaTemplateId`/`metaName` (status, rejectionReason, approvedAt, lastSyncedAt); se virou APPROVED → `flushOutboundQueue(usageKey)` | `src/lib/whatsapp/template-sync.ts` (NOVO) |
| `reconcileTemplateStatuses()`: `listTemplates()` → reconcilia status local divergente → flush pros novos APPROVED (contrato exportado pro bloco-admin) | `src/lib/whatsapp/template-sync.ts` |
| Tratar `changes[].field === "message_template_status_update"` lendo `value.event/message_template_id/message_template_name/message_template_language/reason` → `applyTemplateStatusUpdate`. Template desconhecido → loga e ignora (sem linha órfã) | `src/app/api/webhook/whatsapp/route.ts` |

## Regressão exigida
Camada 1:
- `template-sync.test.ts`: `applyTemplateStatusUpdate` com evento APPROVED atualiza a linha e chama `flushOutboundQueue`; REJECTED grava `rejectionReason` e NÃO flusha; template desconhecido não cria linha.
- `reconcileTemplateStatuses` (com `listTemplates` mockado) atualiza status divergente e flusha os que viraram APPROVED.
- `route.<message-template-status>.test.ts`: POST do webhook com field `message_template_status_update` roteia pro handler certo sem quebrar o parsing de `messages`/`statuses`.
Sem cassette.
