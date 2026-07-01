# Revisão adversarial — bloco-rev-d-whatsapp-chat

**Data:** 2026-06-28 · **Revisor:** Opus 4.8 (modelo certo) · **Branch:** `rev/whatsapp-chat`
**Motivo do bloco:** área escrita por sessões Superset com modelo FRACO — estrago já
provado no `chat-mesa` (`window.ts` com `require("@/db/schema")`, instância Drizzle
nova por chamada, `col.eq(x)` inventado, coluna sem migration). Missão: confirmar a
correção do `window.ts` e achar o MESMO padrão de erro no resto da área.

## Escopo auditado (leitura integral + testes rodados)

`src/lib/whatsapp/**` (window, api/client, processor, adapter, proxy, session,
interactive-handlers, identify-capture, contract-capture, simulator-bus, meta-helpers,
directives, mesa/outbound, mesa/routing), `src/lib/web/adapter.ts`, `src/lib/chat/**`
(provider, recovery, resume, bus-merge, message-bus, ui-message), `src/components/chat/**`
(chat-message — foco eco/duplicação), `src/app/api/webhook/whatsapp/route.ts`,
`src/app/api/chat/route.ts`, `src/app/api/admin/conversations/[id]/message/route.ts`.

**Ambiente de teste:** container transitório dedicado (`aja-revd-pg` + `aja-revd-test`),
store pnpm compartilhado, PG migrado (`db:migrate`, não push). O host do worktree não tem
node_modules (TRAVA Superset) — gate verde verificado no container, commits `--no-verify`.

## Bugs encontrados e corrigidos (4)

### BUG#1 — CRÍTICO — `sendTemplate` nunca enviava o template HSM à Meta
- **Evidência:** `src/lib/whatsapp/api.ts:230` (pré-fix) tinha `return simulatedAck()`
  INCONDICIONAL no topo da função → todo o resto (chamada real à Meta) era código morto.
- **Impacto:** template HSM é o ÚNICO caminho pra reabrir a janela de 24h quando ela fecha
  (chamado em `admin/conversations/[id]/message/route.ts:112`). O atendente recebia um ack
  `sim-*` falso e o cliente NUNCA recebia nada. Feature `chat-mesa-whatsapp` (HSM) quebrada
  em produção.
- **Causa:** padrão clássico de modelo fraco (`return` no topo matando a função). O payload
  da Meta v21 em si estava correto (`messaging_product`/`template.name`/`language.code`).
- **Fix:** gateia o ack por `isSimulatedWaId(to)` como as demais funções do client; corrige
  o tipo de `components` (Meta v21 espera ARRAY) e remove o `as any`.
- **Commit:** `06317f55` — `test+fix:` · TDD: bug reintroduzido → teste FALHOU (1/8) →
  restaurado → 8/8 PASS. Teste em `api.test.ts` (roda no gate test:unit).

### BUG#2 — CRÍTICO — rota do operador (Kanban) enviava ao `conversationId`, não ao `waId`
- **Evidência:** `admin/conversations/[id]/message/route.ts:79,112` (pré-fix) passava
  `conversationId` (UUID) como `to` de `sendTextMessage`/`sendTemplate`. O `to` deve ser o
  `waId` (número WhatsApp). Frontend `components/admin/pipeline/lead-detail-panel.tsx:78`
  manda `conversationId: lead.id`.
- **Impacto:** a Meta rejeita um UUID como destinatário → a mensagem do operador respondia
  200 mas NUNCA chegava ao cliente. O `proxy.ts` (handoff) já fazia certo (usa `conv.waId`);
  só esta rota estava errada.
- **Fix:** resolve o `waId` da conversa (`db.query.conversations.findFirst`) e envia pra ele;
  conversa de canal web (sem `waId`) responde 422 em vez de mandar pra destino inválido.
- **Commit:** `3ac47769` — `test+fix:` · TDD: 3 testes FALHARAM (`expected '1111…' to be
  '5562999990000'`, `expected 200 to be >= 400`) → fix → 3/3 PASS. Teste de route fica fora
  do glob `test:unit` (`route*.test.ts`) — validado explicitamente via `vitest run`.

### BUG#3 — MÉDIO — `text-start` órfão no `lead-collection-prompt` (canal web/SSE)
- **Evidência:** `src/lib/web/adapter.ts:214` (pré-fix) emitia `text-start` com
  `crypto.randomUUID()` que nunca recebia delta nem `text-end`; o `ensureTextStarted()`
  abria OUTRO id pro delta → 2 `text-start`, 1 `text-end` no stream.
- **Impacto:** parte de texto vazia/aberta no cliente quando o turno emite um
  lead-collection-prompt (mistura de `crypto.randomUUID()` inline com `ensureTextStarted()`
  — cheiro de modelo fraco).
- **Fix:** bloco isolado e fechado (um id que abre, recebe delta e fecha), como os demais cases.
- **Commit:** `b7dce95a` — `test+fix:` · TDD: teste FALHOU (2 starts vs 1 end) → fix → PASS.
  Teste em `web/adapter.lead-collection.test.ts` (roda no gate test:unit).

### BUG#4 — BAIXO — acentuação PT-BR na mensagem de erro de grupo (WhatsApp)
- **Evidência:** `src/lib/whatsapp/interactive-handlers.ts:497` — "opcao/credito/voce" sem
  acento numa resposta visível ao cliente (`handleGroupSelected`). Viola a regra inviolável
  de ortografia PT-BR plena.
- **Fix:** "opção/crédito/você". Typo de copy (string estática, não comportamento de agente)
  → dispensa teste por regra.
- **Commit:** `81c688ac` — `fix:`.

## Confirmações (foco extra do bloco)

- **`window.ts`** — CORRETO: `import { eq } from "drizzle-orm"`, `db` singleton de `@/db`,
  `isWindowOpenFast` puro. Sem `require`, sem instância nova de DB. (já corrigido antes; confirmado)
- **Webhook** (`api/webhook/whatsapp/route.ts`) — CORRETO: valida assinatura HMAC
  `x-hub-signature-256` quando `WHATSAPP_APP_SECRET` setado; atualiza `lastInboundAt` a cada
  inbound do cliente (`updateLastInboundAt`, busca por `conversations.waId`) → é o que (re)abre
  a janela de 24h. Sem token logado.
- **Processor multi-canal** (`processor.ts` / `adapter.ts`) — CORRETO: envio sequencial com
  `await`, ordem preservada, sem perda/duplicação; drizzle correto, `db` singleton.
- **Varredura final de antipadrões na área inteira** — 0 ocorrências de: `require("@/")` em
  runtime, `new Pool/Drizzle`/`drizzle()`, API inventada (`col.eq/.and/.or`), catch vazio,
  `.skip`/`.only`. Os `return simulatedAck()` restantes estão todos dentro de guards corretos.

## Gate

`pnpm test:unit` no container: **185 arquivos, 1942 testes, PASS (exit 0)**.

## PENDENTE-KAIRO (decisão de produto — NÃO implementado)

- **FIX-102 (eco/duplicação de texto do assistant)** — card em
  `docs/correcoes/todo/bloco-h-chat-render/fix-102-assistant-texto-duplicado-eco.md`.
  Avaliado: `chat-message.tsx` (`groupAdjacentText`) e o caminho de stream são 100% fiéis
  aos `parts`; a causa é degeneração NÃO-determinística da LLM (1 ocorrência em todo o DB de
  homologação), não bug de código. A guarda defensiva (colapsar segmentos idênticos
  consecutivos) é decisão de PRODUTO do Kairo e mexe em comportamento do agente → exigiria as
  3 camadas de regressão. Severidade baixa. Não implementado por ser decisão de produto.

## PENDENTE-REV-E

- Nenhum. Não toquei `src/db/schema.ts` nem `drizzle/**`; nenhuma coluna/migration faltando
  encontrada nesta área.

## Nota de execução

Um fork lançado pra auditar os componentes desviou (herdou o contexto com os bugs já
identificados) e corrigiu+commitou o BUG#1 (commit `06317f55`, correto). Foi parado pra eu
assumir controle único das edições; os componentes foram então auditados por leitura direta.
Nada foi pushado pelo fork (a branch não existia no origin). Lição: fork no MESMO worktree
herda a missão maior e pode editar fora do escopo dado — para auditoria read-only, usar
agente `Explore` (sem Edit/Write).
