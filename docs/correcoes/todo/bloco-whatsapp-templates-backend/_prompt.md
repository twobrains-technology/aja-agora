Você é o executor do **bloco-whatsapp-templates-backend** (onda 2) no worktree isolado deste branch (`feat/whatsapp-templates-backend`). Projeto: aja-agora (Next.js 16 + Vercel AI SDK 6 + Drizzle). Idioma: PT-BR. Package manager: **pnpm** (npm/yarn PROIBIDOS).

Este branch forkou da base que JÁ TEM o schema da onda 1 integrado: as tabelas `whatsappTemplates` e `whatsappOutboundQueue`, os enums, e as funções `createTemplate`/`listTemplates`/`sendTemplate` em `src/lib/whatsapp/api.ts`. Confirme que existem antes de começar (`grep whatsappTemplates src/db/schema.ts`).

1. Leia, nesta ordem:
   - `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md` (a spec inteira — fonte de verdade).
   - `docs/correcoes/README.md` + `docs/correcoes/todo/bloco-whatsapp-templates-backend/` (`_bloco.md` + `fix-193` + `fix-194` + `fix-195`).
   - `src/lib/whatsapp/window.ts` (`isWindowOpen`/`isWindowOpenFast` — a janela de 24h).
   - `src/lib/whatsapp/api.ts` (`sendTemplate`, `sendTextMessage`, `listTemplates`).
   - `src/app/api/webhook/whatsapp/route.ts` (hoje só trata `messages`/`statuses`; você ADICIONA o field `message_template_status_update` sem quebrar o resto).
   - `src/lib/whatsapp/interactive-handlers.ts` (`handleOfferConfirm` ~:150-184 — onde a confirmação é disparada) e `src/lib/bevi/contract-summary.ts` (`sendContractSummary`).

2. DESIGN: fechado na spec — NÃO reabra. Decisões travadas: (a) chave lógica `usageKey` gerida no admin (não hardcode nome de template); (b) janela aberta → texto livre rico atual; janela fechada → template; (c) template não aprovado + janela fechada → enfileira + envia ao aprovar. Trade-off de implementação novo → decida como sênior e registre no resumo.

3. Execute NA ORDEM, TDD strict (teste falha antes do código). **Feature não-agêntica → foco em teste de integração (Camada 1). SEM cassette (Camada 2): nenhum comportamento da LLM muda — os pontos de disparo são código determinístico.**
   - **FIX-201** `src/lib/whatsapp/template-dispatch.ts`: `resolveAndSend({to, waId, usageKey, params, freeTextFallback})`:
     1) `isWindowOpen(waId)` → executa `freeTextFallback()` (a copy rica atual, passada pelo caller);
     2) janela fechada + template `APPROVED` (busca por `usageKey`) → `sendTemplate(metaName, language, componentsFromParams)`;
     3) janela fechada + não aprovado → grava linha `pending` em `whatsappOutboundQueue` + dispara alerta admin (reuse o canal de alerta existente da mesa se houver; senão, um log estruturado claro).
     `flushOutboundQueue(usageKey)`: envia as `pending` daquele usageKey via `sendTemplate`, marca `sent`; em falha incrementa `attempts` + `lastError`, mantém `pending` (NUNCA marca sent sem sucesso). Idempotente.
   - **FIX-202** `src/lib/whatsapp/template-sync.ts`: `applyTemplateStatusUpdate(payload)` (atualiza `whatsappTemplates` por `metaTemplateId`/`metaName`; se virou APPROVED → `flushOutboundQueue(usageKey)`); `reconcileTemplateStatuses()` (chama `listTemplates()` e reconcilia o status local, dispara flush pros que viraram APPROVED). No webhook (`route.ts`): tratar `entry[].changes[].field === "message_template_status_update"` lendo `value.event`, `value.message_template_id`, `value.message_template_name`, `value.message_template_language`, `value.reason` → `applyTemplateStatusUpdate`. Status de template desconhecido localmente → loga e ignora (não cria linha órfã).
   - **FIX-203**: os 3 pontos de disparo passam a rotear por `resolveAndSend` com `usageKey` (`confirmacao_contratacao`, `resumo_contratacao`, `proposta_pronta`) e o texto livre atual como `freeTextFallback`. Não mude a copy do texto livre — só a torne o fallback dentro da janela.

4. **1 commit Conventional (PT-BR) por item** (`feat:` / `test+feat:`).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` (`status: done` + `commit` + `executado_em`). Bloco esvaziou → apague a pasta (best-effort).

6. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/whatsapp-templates-backend`) + gere `.done/2026-07-02-bloco-whatsapp-templates-backend.md`. ⚠️ **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.**

7. RESUMO FINAL: decisões de design tomadas (uma por linha). Sem decisão? Diga isso. Exporte `reconcileTemplateStatuses` de `template-sync.ts` com assinatura estável — o `bloco-admin` importa isso (contrato nível 3).
