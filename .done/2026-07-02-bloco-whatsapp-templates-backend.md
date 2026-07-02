# Bloco Backend — Templates WhatsApp Meta oficial (dispatch + fila + sync)

> 2026-07-02 · onda 2 · branch `feat/whatsapp-templates-backend` · Kairo (via Claude)

## O que este bloco entrega (visão de negócio)

Fecha o buraco que quebrava a confirmação de contratação quando a jornada acontece
na **web**: fora da janela de 24h do WhatsApp, a Meta bloqueia texto livre iniciado
pela empresa, então a mensagem de "parabéns / sua proposta está pronta / resumo da
contratação" simplesmente **não chegava** ao cliente. Agora existe uma camada única
que decide sozinha, sem operador no meio:

- **Janela aberta** (cliente falou nas últimas 24h) → manda o **texto rico atual**,
  intacto, sem custo de template.
- **Janela fechada + template aprovado** → manda o **template oficial da Meta**.
- **Janela fechada + template ainda não aprovado** → **enfileira** a confirmação e a
  **dispara sozinha assim que a Meta aprovar** (via webhook ou poll). Nada se perde.

O status dos templates se atualiza sozinho — webhook em tempo real + poll de
reconciliação — sem ninguém apertar "atualizar".

## Itens entregues (TDD, 1 commit por item)

| Item | Entrega | Commit |
|------|---------|--------|
| FIX-201 | `template-dispatch.ts`: `resolveAndSend` (janela decide o canal) + `flushOutboundQueue` (entrega garantida ao aprovar, idempotente) | `3c39e1cd` |
| FIX-202 | `template-sync.ts`: `applyTemplateStatusUpdate` + `reconcileTemplateStatuses` + webhook `message_template_status_update` | `2b36ff45` |
| FIX-203 | Os 3 disparos da confirmação roteados por `resolveAndSend` com chave lógica | `889d7380` |

## Qualidade entregue

- **Gate `pnpm test:unit` verde: 250 arquivos, 2491 testes** (rodado em container
  transitório com Postgres migrado — host sem node_modules por política pnpm-only).
- Regressão Camada 1 nova: `template-dispatch.test.ts` (DB real, 7), `template-sync.test.ts`
  (9), `webhook.message-template-status.test.ts` (3), `interactive-handlers.template-routing.test.ts`,
  `contract-summary.template-routing.test.ts`.
- **Sem cassette (Camada 2)**: nenhum comportamento da LLM muda — os pontos de disparo
  são código determinístico (alinhado à spec §Testes).
- Regressos existentes preservados (`contract-summary.test.ts`, `interactive-handlers.contract.test.ts`)
  com shim de "janela aberta", mantendo o regresso crítico do META-WIPE intacto.

## Decisões de design tomadas (trade-offs de implementação)

- **Chave da janela = `conversationId`, não o `waId` do telefone.** A spec chamava o
  parâmetro de `waId`, mas `isWindowOpen` (window.ts) filtra por `conversations.id`;
  passar o telefone leria janela sempre fechada. `resolveAndSend` recebe `to` (destino
  E.164) **e** `conversationId` (janela) separados.
- **Alerta admin = log estruturado.** Não existe canal de alerta genérico da mesa hoje
  (só notificação a atendentes no handoff). Usei log estruturado claro (mesmo padrão de
  observabilidade do `contract-summary.ts`), substituível por canal dedicado quando existir.
- **Dedupe de template por `usageKey` no fechamento.** O `closingPresentation` emite
  vários textos que mapeiam pra `confirmacao_contratacao`; fora da janela isso viraria
  N envios do mesmo template. `handleOfferConfirm` guarda as chaves já "templadas" e
  envia **um** template por chave, preservando a ordem/copy exatas **dentro** da janela.
- **`params` → componentes da Cloud API por convenção `params.header`/`params.body`**
  (arrays ordenados dos placeholders `{{1}}`, `{{2}}`...). A copy real dos templates é
  mais enxuta que o texto livre (trade-off aceito na spec: texto rico fica na janela).
- **`applyTemplateStatusUpdate(change)` recebe payload NORMALIZADO** (via
  `parseTemplateStatusChange`, pura) — desacopla a lógica do envelope do webhook e a
  torna testável no gate (o webhook `route*.test.ts` é excluído do `test:unit`).
- **DI (`resolveAndSendImpl`) em `sendContractSummary`** — segue o padrão de deps já
  existente no arquivo, preservando os regressos sem tocar em DB real nesses testes.

## Contrato para o bloco-admin (nível 3)

`reconcileTemplateStatuses(): Promise<{ checked, updated, flushed }>` exportado de
`src/lib/whatsapp/template-sync.ts` — assinatura estável, é o que o botão "sincronizar
status" do admin importa. Ordem de merge: este bloco (backend) **antes** do bloco-admin.

## Gaps honestos

- **WABA ID real ainda é PENDENTE-KAIRO** — a submissão/aprovação real na Meta depende
  disso; os testes usam Graph mockada / fila.
- **`params`→placeholder é best-effort** enquanto não há template real aprovado; o admin
  define o corpo e o vínculo `usageKey`→template.
