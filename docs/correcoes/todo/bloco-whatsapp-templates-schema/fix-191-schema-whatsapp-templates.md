---
id: FIX-191
titulo: "Criar schema whatsappTemplates + whatsappOutboundQueue + enums + migration"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/db/schema.ts
  - src/db/migrations/*
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "teremos que ter a figura da mensagem de template que tem q ser submetida pela meta,
> e sempre atualizarmos seu status até ficar aprovada. depois temos que falar onde essa
> mensagem é usada (por exemplo, essa é a mensagem de confirmação de contratação pelo whatsapp)."

## Cenário exato
- **Contexto:** hoje não existe nenhuma entidade de template no schema. Os status updates
  que a Meta manda pelo webhook são apenas logados (`src/app/api/webhook/whatsapp/route.ts:56-69`),
  não persistidos. Não há como cadastrar um template, saber seu status, nem mapear onde é usado.
- **Necessário:** uma tabela que represente o template registrado na Meta (com status
  acompanhável até `APPROVED`) e uma fila de mensagens business-initiated pendentes de
  template aprovado (o fallback anti-manual — ver FIX-193).

## Esperado × Atual
- **Esperado:** tabelas `whatsappTemplates` e `whatsappOutboundQueue` no schema, com migration versionada.
- **Atual:** inexistentes.

## Root cause (INVESTIGADO)
Mapa do Explore (2026-07-02): schema único em `src/db/schema.ts` (23 tabelas). Há
`channelEnum`, `conversations.waId`, `conversations.lastInboundAt` (janela 24h), mas
**nenhuma** tabela de template/HSM nem de status de envio. `sendTemplate()` já existe
(`api.ts:256`) mas não há de onde tirar o nome do template (PENDENTE-KAIRO no
`docs/correcoes/done/fix-85-whatsapp-send-template-hsm.md`).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `whatsappTemplates`: id, `usageKey` (unique quando setado), `metaName`, `language` (def `pt_BR`), `category` (enum), `components` (jsonb), `bodyPreview`, `status` (enum, def `DRAFT`), `metaTemplateId`, `rejectionReason`, `submittedAt`, `approvedAt`, `lastSyncedAt`, `createdAt`, `updatedAt` | `src/db/schema.ts` |
| `whatsappOutboundQueue`: id, `to` (E.164 sem +), `usageKey`, `params` (jsonb), `status` (enum def `pending`), `attempts` (int def 0), `lastError`, `createdAt`, `sentAt` | `src/db/schema.ts` |
| Enums `whatsappTemplateStatusEnum` (DRAFT/PENDING/APPROVED/REJECTED/DISABLED/PAUSED), `whatsappTemplateCategoryEnum` (UTILITY/MARKETING/AUTHENTICATION), `whatsappOutboundStatusEnum` (pending/sent/failed) | `src/db/schema.ts` |
| Migration versionada via `pnpm drizzle-kit generate` (NÃO push/migrate na mão) | `src/db/migrations/` |

## Regressão exigida
Camada 1 (structural, `src/db/*.test.ts`): assert de que as tabelas/enums existem no schema
exportado e que `usageKey` tem constraint de unicidade (quando não-nulo). Sem cassette
(código não-agêntico puro).
