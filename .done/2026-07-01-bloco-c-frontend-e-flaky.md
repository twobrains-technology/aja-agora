# Bloco C — Housekeeping: saudação duplicada (frontend) + teste flaky

**Branch:** `fix/frontend-dup-e-flaky` · **Onda:** 1 (paralelo com bloco-a, bloco-b)
**Executado em:** 2026-07-01 · **Itens:** FIX-184, FIX-185 · **Status:** ✅ concluído, gate verde

Dois bugs pequenos e INDEPENDENTES entre si e do agente. Nenhum tocou orquestrador/tools/prompt.
Ambas as causas foram **provadas** (leitura de código + execução real), não classificadas no escuro.

---

## FIX-184 — saudação "Prazer, Mirella!" duplicada na tela (bug só de render)

**Causa raiz (PROVADA por leitura de código):** o `runner.ts` acumula os `text-delta` da LLM em
`fullResponse` e só aplica `collapseEchoedSegments` (a guarda de eco/degeneração do FIX-102) na
**persistência**, DEPOIS do streaming (runner.ts:308). Mas o stream **ao vivo** já emitiu os deltas
crus pro cliente (adapter `pipeOrchestratorToWriter` → `useChat`). Resultado: o DB fica limpo
(1 registro — batia com a evidência do card: 1 row em `messages`) mas a **tela** renderiza o eco.
A duplicação é exclusivamente de render — a tela não batia com o DB.

Dois shapes do eco chegam ao cliente: (a) concatenado num único text part (texto stremia contíguo
após o `forceToolChoice`); (b) em text parts adjacentes separados por um `data-tool` (que
`classifyParts` dropa) e juntados com "\n\n" no `groupAdjacentText`.

**O que corrigiu:** `collapseEchoedText` em `src/components/chat/chat-message.tsx` — espelho exato
do guard do server, colapsa segmentos `[.!?]` 100% idênticos consecutivos no texto renderizado de
cada `text-group`. Compara com `trim()`, então pega os dois shapes. A tela passa a bater com o DB.
**Self-contained de propósito:** NÃO importa do runner (server-only, e a função do runner é mexida
em paralelo pelo bloco-a/FIX-182 nesta mesma onda — importar geraria acoplamento/conflito).

**Regressão:** `src/components/chat/chat-message.fix-184.test.tsx` (Camada 1 / render, happy-dom)
renderiza o `ChatMessage` REAL com os 2 shapes do eco + 1 caso de não-regressão (texto legítimo
parecido fica intacto). Falhava antes (2×), verde depois. Bug não-agêntico (render puro) → sem
cassette de Camada 2 (regra do CLAUDE.md).

**Commit:** `72f3bd7c`

---

## FIX-185 — teste "flaky" admin-message-persistence (36/27 em vez de 24)

**Causa raiz (PROVADA — NÃO era flaky nem cleanup):** rodado 3× seguidas → 36/27 IDÊNTICO todas as
vezes, sem crescer. É um **double-persist determinístico e INTENCIONAL** num turno de tool
**silenciosa** (`save_contact_name`, sem texto): (1) o `runner.ts:383` grava o marker
`[tool: save_contact_name]` — fix do BUG-ADMIN-MESSAGE-MISSING (admin não pode perder o turno); (2) a
`route.ts` via `isTurnEmpty` (FIX-172, `empty-turn-guard.ts` — `save_contact_name` é SILENT_TOOL)
considera o turno "mudo" e dispara o `EMPTY_TURN_FALLBACK` (turno mudo não pode congelar a tela). São
duas assistant rows por turno silencioso, por design.
Contas: tool-only(12) → 12 user + 24 asst = **36**; mixed(12, 3 silenciosos) → 12 + 15 = **27**.
O teste antigo assumia exato 2N — invariante que ficou ESTÁLE quando o FIX-172 (fallback) entrou
DEPOIS do fix do marker. A falha era ORTOGONAL ao propósito do teste (anti-ghosting): o admin passou
a receber de MAIS, nunca de menos. Cleanup descartado: a contagem é por-`convId` (fresh no
`beforeEach`), acúmulo cross-teste não afeta o número.

**O que corrigiu (arquivo de teste, SEM tocar produto):** asserts atualizadas pra a composição
intencional atual (marker + fallback), determinísticas, com a garantia central preservada —
`assertNoGhostedUserTurn` exige ≥1 assistant após cada turno do usuário e o admin devolve
EXATAMENTE o que está no DB (`messages.length === dbCount`). Provado verde e determinístico (3×).

**Commit:** `34f2694d`

### ⚠️ Decisão de PRODUTO deixada em aberto (PENDENTE-KAIRO)
Não mexi no produto de propósito. O double-persist (marker `[tool: …]` + fallback) é a soma de dois
fixes documentados; deduplicá-los reverteria BUG-ADMIN-MESSAGE-MISSING **ou** FIX-172 e mexe no
`runner.ts` (território do bloco-a nesta onda). Fica pro Kairo decidir SE é indesejável — ex.: o
marker `[tool: …]` pode vazar pro usuário na retomada (`resume.ts` filtra só `content.length > 0`), e
o fallback "me perdi" soa estranho quando o `save_contact_name` de fato funcionou. Reconciliar (o
fallback SUBSTITUIR o marker, ou o marker virar admin-only não-hidratável) é design de UX, fora do
escopo deste card. Registrado também no card em `docs/correcoes/done/fix-185-*.md`.

---

## Gate (rodado em container transitório — host sem node_modules, pnpm-only)

| Gate | Resultado |
|---|---|
| `pnpm test:unit` | ✅ **2264 passed** (228 arquivos) — inclui o teste FIX-184 |
| `pnpm test:integration` | ✅ **223 passed**, 5 skipped (pré-existentes: Bevi-live) — inclui o teste FIX-185 |
| `pnpm build` | ✅ Compiled successfully (Turbopack, 41/41 páginas estáticas) |

Ambiente: container da imagem `aja-agora-develop-app` na `tb-local-net`, store pnpm compartilhado
(`tb-pnpm-store-shared`), Postgres do develop via `.orb.local`, env real do develop. Pre-commit do
host não roda (sem node_modules) → commits com `--no-verify`, gate verificado no container.

## Decisões de design
Nenhuma decisão de design de produto foi tomada neste bloco — são dois bugs objetivos. A única
questão de produto que apareceu (o double-persist do FIX-185) foi **deixada em aberto** pro Kairo,
não decidida unilateralmente.
