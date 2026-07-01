# Simulator Time-Travel — Design

**Status:** Approved (Kairo, 2026-05-17)
**Autor:** Claude Opus 4.7 (sessão brainstorming)
**Branch:** `feat/simulator-memory`

---

## Contexto

O simulador (`/admin/simulator/{web,whatsapp}`) hoje deixa o admin encarnar um cliente e atravessar o mesmo orquestrador, prompt, tools e camada de memória Letta que o canal real. **Mas o que ele não permite é simular passagem de tempo** — todo `new Date()` retorna "agora", então testar reativação Letta (1 dia, 3 dias, 30 dias) exige esperar tempo real ou bagunçar timestamps no banco na unha.

Esta feature adiciona time-travel **por conversa simulada**, com semântica de "como se realmente tivesse se passado tempo": cada conversa simulada acumula um `clockOffsetMs` que afeta todos os pontos do caminho do agent (Letta, DB, dashboard, eval). UI: drawer lateral direito persistente no simulador web e WhatsApp.

## Objetivo

1. Avançar tempo de forma incremental e cumulativa em qualquer conversa simulada.
2. Tornar a passagem de tempo **completa** — Letta `lastInteractionAt`, `messages.createdAt`, `conversations.updatedAt`, `lastSimulation.date`, `lastRecommendation.date`, qualquer outro `new Date()` no caminho do turno simulado respeita o offset.
3. Mostrar ao operador qual o estado atual da memória Letta da identidade da conversa (bloco humano, archival relevante, dias-desde-última).
4. Não afetar o caminho real (conversa não-simulada): offset sempre 0, comportamento idêntico ao de hoje.

## Não-objetivos

- Voltar no tempo (offset negativo). Estado já registrado fica como está; reset zera o offset mas não rebobina mensagens passadas.
- Time-travel em conversa real (`is_simulated=false`). Bloqueado por API/UI.
- Simular passagem de tempo na semente da conversa (criar conversa "começando" em data passada). Apenas avanço a partir de "agora".
- Testar webhooks/cron jobs disparados por agendamento real (BullMQ, EventBridge etc.).

---

## Arquitetura

### Modelo de dados

Novo campo derivado em `conversations.metadata`:

```ts
metadata.simulator = {
  createdBySimUserId?: string;   // já existe hoje
  clockOffsetMs?: number;        // NOVO — int, default 0, sempre ≥ 0
  clockAdvancedAt?: string;      // NOVO — ISO timestamp da última mudança de offset (audit)
}
```

Sem migration DDL — `metadata` já é `jsonb` e novos campos são opcionais.

### Clock helper

```ts
// src/lib/utils/simulator-clock.ts
import { AsyncLocalStorage } from "node:async_hooks";

interface ClockContext {
  offsetMs: number;
  conversationId: string;
}

const als = new AsyncLocalStorage<ClockContext>();

export function runWithSimulatorClock<T>(ctx: ClockContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function simulatorNow(): Date {
  const ctx = als.getStore();
  return ctx ? new Date(Date.now() + ctx.offsetMs) : new Date();
}

export function getCurrentClockOffset(): number {
  return als.getStore()?.offsetMs ?? 0;
}
```

### Entrypoints — onde o ALS é setado

Toda entrada de turno em conversa simulada lê `metadata.simulator.clockOffsetMs` e roda o resto do turno dentro de `runWithSimulatorClock(ctx, () => …)`:

1. **Web chat:** `src/app/api/chat/route.ts` — após resolver `conv`, antes de chamar o orchestrator.
2. **WhatsApp processor:** `src/lib/whatsapp/processor.ts` — após `getOrCreateConversation()`, antes de `processWithOrchestrator()`. Para waId que começa com `SIM-`, lê conv do DB e injeta offset.
3. **Simulator `/send` (whatsapp):** `src/app/api/admin/simulator/whatsapp/[conversationId]/send/route.ts` — antes de delegar ao processor.
4. **Lead form / leads route:** quando `conversation.is_simulated=true`, idem.

Real (conversa não-simulada): nenhum ALS context é criado, `als.getStore()` retorna `undefined`, `simulatorNow()` retorna `new Date()` puro. Zero overhead, zero risco.

### Pontos de substituição de `new Date()`

| Arquivo | Linha aprox. | Trocar por |
|---|---|---|
| `src/lib/memory/letta-adapter.ts:187,194` | `daysBetween(block.lastInteractionAt, new Date())` | `daysBetween(block.lastInteractionAt, simulatorNow())` |
| `src/lib/memory/letta-adapter.ts:248` | `lastInteractionAt: new Date().toISOString()` | `lastInteractionAt: simulatorNow().toISOString()` |
| `src/lib/memory/extractor.ts:34` | `const today = new Date().toISOString()` | `const today = simulatorNow().toISOString()` |
| `src/lib/agent/orchestrator/index.ts:50` | `updatedAt: new Date()` | `updatedAt: simulatorNow()` |
| `src/lib/agent/orchestrator/lead-collection.ts:79,135` | idem | idem |
| `src/lib/whatsapp/proxy.ts:153,263,453,476,493,525,631` | `updatedAt: new Date()`, `createdAt: new Date().toISOString()` | `simulatorNow()` correspondente |
| `src/lib/whatsapp/simulator-bus.ts:65,98` | `createdAt: new Date().toISOString()` | `simulatorNow().toISOString()` |
| `src/app/api/chat/route.ts:155` | `createdAt: new Date().toISOString()` em `publishMessage` | `simulatorNow().toISOString()` |
| `src/lib/conversation/messages.ts` (saveMessage) | qualquer `new Date()` em insert/update | `simulatorNow()` |

**Garantia de cobertura:** lint rule custom + teste integration que avança +5d e verifica que **toda** linha gravada no DB pelo turno tem `createdAt >= now+5d-1min`.

### API

```
POST /api/admin/simulator/sessions/[id]/clock
  body: { advanceDays: number }  // > 0
  resp: { offsetMs, simulatedNow, conversation }

POST /api/admin/simulator/sessions/[id]/clock/reset
  resp: { offsetMs: 0, simulatedNow, conversation }

GET  /api/admin/simulator/sessions/[id]/memory
  resp: {
    identity: { kind, value, namespace } | null,
    agentExists: boolean,
    block: HumanMemoryBlock | null,
    daysSinceLastInteraction: number | null,
    reactivationHint: string | null,        // preview do hint do próximo turno
    archivalSample: ArchivalHit[],          // top 10 mais recentes
    clockOffsetMs: number,
    simulatedNow: string                    // ISO
  }
```

Todos os endpoints:
- Gateados por `isSimulatorEnabled()` (404 em prod sem flag)
- `requireRole("admin")`
- Validam `conv.is_simulated === true` (404 senão)

### UI

**Componente novo:** `<MemoryDevPanel conversationId={id} />`

- Renderizado dentro de `SimulatorWeb` e `SimulatorWhatsapp` como segunda coluna lateral à direita.
- Largura fixa 320px, colapsável por toggle no header (`>` chevron).
- Polling: `GET /api/admin/simulator/sessions/[id]/memory` a cada 3s **só enquanto aberto**.
- Re-fetch imediato após qualquer ação (avançar tempo, reset).

**Layout interno:**

```
┌─ 🕰️ Memória ────── (×) ─┐
│ Conversa simulada       │
│                         │
│ Agora real              │
│   17/05/2026 14:32      │
│ Agora simulado          │
│   22/05/2026 14:32      │
│   (+5d 0h)              │
│                         │
│ [+1 dia ] [+3 dias]     │
│ [+7 dias] [+30 dias]    │
│ [Avançar X dias…]       │
│ [↺ Resetar]             │
│                         │
│ ─── Letta ───           │
│ Identidade              │
│   phone +5511999999999  │
│   namespace: aja-...    │
│ Agent: ✓ existe         │
│ Dias desde última: 5    │
│                         │
│ Próximo hint:           │
│   [REATIVAÇÃO] Usuário  │
│   voltou após 5 dias.…  │
│                         │
│ ▾ Bloco humano (JSON)   │
│   { schemaVersion: 1,   │
│     name: "Maria",      │
│     stage: "engajado",  │
│     …                   │
│   }                     │
│                         │
│ ▾ Archival (10 últimos) │
│   • Simulou R$ 80k…     │
│   • Visualizou grupo…   │
│   …                     │
└─────────────────────────┘
```

Estados especiais:
- **Letta circuit aberto** → banner "⚠ Letta offline (Noop fallback). Memória não persistirá esta interação."
- **Conversa web sem cookie ainda** → "Sem identidade — primeira mensagem definirá o cookie anônimo."
- **Conversa web abaixo de threshold (1-2 turnos)** → "X/3 turnos para criação automática do agent Letta."
- **Conversa whatsapp `SIM-<uuid>`** → identidade é o phone fake; agent é criado já no 1º turno (comportamento real do canal).

Disclaimer permanente no painel: *"Avançar o tempo afeta apenas esta conversa simulada (`is_simulated=true`). Conversa real não é impactada."*

### Trigger semântico — quando o offset entra em ação

Marco temporal | Comportamento |
|---|---|
| Operador clica "+5 dias" no turno N | API soma `5*86400000` em `clockOffsetMs`. Próximo turno (N+1) e em diante usam `simulatorNow()`. |
| Mensagem N+1 enviada | `messages.createdAt = simulatorNow()` (futuro). Letta carrega bloco; `daysBetween(lastInteractionAt antigo, simulatorNow())` ≥ 5 → reativação dispara. Após resposta, `storeMemories` grava `lastInteractionAt = simulatorNow()` (futuro). |
| Operador clica "+1 dia" novamente | Offset = 6 dias. Próxima mensagem é hour+6d. |
| Operador clica "Resetar" | Offset volta a 0. Mensagem futura volta a ser "agora". `lastInteractionAt` no bloco Letta **permanece no futuro** até a próxima mensagem reescrevê-lo. (Reset não reescreve passado — alinhado ao "não-objetivo: voltar no tempo".) |

---

## Edge cases & decisões

1. **Conversa simulada sem turno ainda + avançar tempo + abrir painel.**
   `lastInteractionAt` undefined → `daysSinceLastInteraction = null`. Painel mostra "Primeira interação". Reativação não dispara. OK.

2. **Avançar tempo enquanto agent está respondendo (streaming).**
   Offset é lido no início do turno (`runWithSimulatorClock`). Mudança no meio do turno só vale para o próximo. Aceitável — uma req atômica.

3. **Múltiplos admins na mesma conversa simulada.**
   `clockOffsetMs` é persistido no DB, único por conversa. Última escrita vence. Polling de 3s mantém todos sincronizados visualmente.

4. **Offset enorme (anos no futuro) quebra Letta?**
   Letta aceita ISO 8601 qualquer. Limite duro na API: `advanceDays ≤ 3650` (10 anos). Suficiente.

5. **`is_simulated` flip em produção.**
   Impossível por UI/API. Endpoint de clock valida `conv.isSimulated === true`. Em qualquer outro caso → 403.

6. **`isSimulatorEnabled()` desligado em prod.**
   Toda rota nova retorna 404. Helper `simulatorNow()` permanece exportado mas sem ALS context retorna `new Date()` puro — zero impacto.

7. **Letta indisponível ao avançar tempo.**
   Endpoint de clock só mexe em `conversations.metadata` (DB local). Letta é consultado pelo GET de memória; se circuit aberto, painel mostra warning mas o avanço de tempo segue funcionando.

8. **Conversa whatsapp com phone reconciliado para outro cookie.**
   `reconcileIdentity()` já é chamado real. Avançar tempo após reconcile usa o **agent destino** (phone). `daysSinceLastInteraction` reflete o block do destino. OK.

---

## Componentes a tocar (resumo)

**Novos:**
- `src/lib/utils/simulator-clock.ts` — ALS helper.
- `src/app/api/admin/simulator/sessions/[id]/clock/route.ts` — POST advance.
- `src/app/api/admin/simulator/sessions/[id]/clock/reset/route.ts` — POST reset.
- `src/app/api/admin/simulator/sessions/[id]/memory/route.ts` — GET snapshot.
- `src/components/admin/simulator/memory-dev-panel.tsx` — UI do drawer.
- `src/lib/memory/inspect.ts` — helper que retorna `{ identity, block, daysSince, reactivationHint, archivalSample }` para a rota GET (reutiliza `LettaMemoryAdapter.loadContext` + listArchival).

**Modificados (troca de `new Date()` por `simulatorNow()`):**
- `src/lib/memory/letta-adapter.ts`
- `src/lib/memory/extractor.ts`
- `src/lib/agent/orchestrator/index.ts`
- `src/lib/agent/orchestrator/lead-collection.ts`
- `src/lib/whatsapp/proxy.ts`
- `src/lib/whatsapp/simulator-bus.ts`
- `src/lib/conversation/messages.ts`
- `src/app/api/chat/route.ts` (publishMessage + runWithSimulatorClock wrap)
- `src/lib/whatsapp/processor.ts` (runWithSimulatorClock wrap)
- `src/app/api/admin/simulator/whatsapp/[conversationId]/send/route.ts` (wrap)
- `src/components/admin/simulator/web/simulator-web.tsx` (renderiza MemoryDevPanel)
- `src/components/admin/simulator/whatsapp/simulator-whatsapp.tsx` (idem)

**Lint:**
- Regra Biome custom (ou comentário `// biome-ignore`) em arquivos sensíveis para forçar `simulatorNow()`. Se Biome não suportar regra custom direta, criar teste `no-new-date.test.ts` que faz grep e falha se `new Date(` aparecer fora de allow-list.

## Testing strategy

**Unit:**
- `simulator-clock.test.ts` — ALS funciona, nested run, fora de scope retorna agora puro.
- `extractor.test.ts` — adicionar caso "dentro de runWithSimulatorClock → today é offset".
- `reactivation.test.ts` — já cobre dias-desde-última; manter.

**Integration (Letta real, dev workspace):**
- `letta-adapter.integration.test.ts` — adicionar caso: cria agent, `storeMemories` dentro de `runWithSimulatorClock` com offset 5 dias, `loadContext` (sem offset) lê `lastInteractionAt` futuro, `daysSinceLastInteraction` negativo OK ou null tratado.

**E2E (Playwright):**
- `simulator-time-travel.spec.ts`
  1. Cria sessão WhatsApp via API.
  2. Manda 1ª mensagem ("oi quero comprar carro").
  3. Espera reply do agent.
  4. Avança 5 dias via painel.
  5. Manda 2ª mensagem ("voltei").
  6. Verifica que reply contém marcador de reativação (ex: persona-prompt expõe estilo diferente; OU verifica via DB que `messages.createdAt` da N=2 é ≥ now+5d-1min; OU verifica via `metadata.lettaDebugHint` (AJA_DEBUG_MEMORY=1) que hint `[REATIVAÇÃO]` foi prepended).
  7. Verifica drawer mostra "Dias desde última: 5".
- Idem para web simulator (após mandar 3 turnos para passar threshold).

**Anti-regressão:**
- `letta-adapter.test.ts` — caso baseline sem ALS: comportamento idêntico ao de hoje.
- `chat-route.test.ts` — conversa real (não-simulada) não tem mudança de timestamp.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Esquecer um `new Date()` no path do turno → DB inconsistente (uns campos futuro, outros agora) | Grep test `no-new-date.test.ts` + revisão manual de PRs futuros |
| ALS não propaga por `await` em alguma lib que faz `setImmediate`/`process.nextTick` mal | Test integration com `storeMemories` (fire-and-forget) verificando que ALS context permanece |
| Operador acidentalmente avança 100 anos | Hard cap 3650 dias na API |
| Painel polling 3s gera carga em Letta | GET `/memory` cacheia bloco por 1s; archival listado só on-demand (expand collapsed) |
| Conversa real com `is_simulated` flipado por bug futuro vaza time-travel pra prod | API valida `isSimulatorEnabled() && conv.isSimulated === true`. Em runtime, `runWithSimulatorClock` só é wrapado em paths gateados. |

## Critérios de aceite

(Detalhados em test plan separado pelo PO Lead — `docs/test-plans/simulator-time-travel.md`. Resumo binário:)

1. ✅ Avançar +5d numa conversa whatsapp simulada → 2ª mensagem tem `createdAt = primeira + ~5d` no DB.
2. ✅ Mesmo cenário → bloco Letta da identidade tem `lastInteractionAt` ≈ now+5d.
3. ✅ Mesmo cenário → próximo turno do agent é prepended com `[REATIVAÇÃO]` no system message (verificável via `metadata.lettaDebugHint`).
4. ✅ Drawer mostra estado real após cada ação (offset, dias-desde-última, bloco, archival).
5. ✅ Reset zera offset e mensagens subsequentes voltam a ter `createdAt = now`.
6. ✅ Conversa real (sem `is_simulated`) é 100% intocada — comportamento idêntico ao baseline.
7. ✅ Conversa simulada web só forma agent após 3 turnos do usuário (threshold preservado).
8. ✅ `isSimulatorEnabled()=false` em prod → todos os endpoints novos respondem 404; `simulatorNow()` retorna `new Date()` puro.
9. ✅ Hard cap: `advanceDays > 3650` → 400.
10. ✅ Conversa simulada whatsapp + Letta circuit aberto → painel mostra warning, avanço de tempo continua funcionando, próxima mensagem grava normalmente quando Letta volta.

---

## Out of scope (postergado)

- "Voltar no tempo" (offset negativo).
- Time-travel global (afetar várias conversas simuladas ao mesmo tempo).
- Simulação de assembleias / aging de leads no kanban com tempo simulado.
- Integração com BullMQ jobs agendados.

