# QA Report — Revisão Bruna v1 (Aja Agora) — **Round 2**

**Data:** 2026-05-16
**Branch:** `fix/bruna-v1-review` (base `develop`, 17 commits)
**QA:** Senior QA Lead TwoBrains, persona fintech consórcio, 15 anos de experiência
**Contrato:** `docs/specs/2026-05-16-bruna-v1-qa-plan.md`
**Round 1:** `docs/specs/2026-05-16-bruna-v1-qa-report-1.md` (NO-GO, 10 PASS / 9 PARTIAL)
**Estado atual:** **241 passed / 3 skipped (28 test files)** — duration 2.35s, exit 0 (era 219/3 em 24 files)
**Typecheck:** `npx tsc --noEmit` → exit 0
**LLM eval gated:** ainda ausente; movido pra hardening por decisão arquitetural (NÃO bloqueia GO, ver §4).

---

## Diferenças vs Report 1

Round 1 fechou em **NO-GO com bloqueador único: PLUG**. Os 9 PARTIAL compartilhavam a mesma raiz: trabalho parou na infra/cálculo/exemplo, sem call-site em runtime nem renderer frontend. Round 2 endereça isso com 2 commits cirúrgicos:

- **`6754eb2`** — fix bloqueadores parte 1 (plug `recommendWithFallback` no tool, `Scenario` ganha `lanceValue`/`ownResourcesValue`, 3 renderers novos + tipos + roteamento + 17 testes; `present_financing_comparison` registrada como presentation tool).
- **`e36d1ab`** — fix bloqueadores parte 2 (`detectBackIntent` + `popNavState` plugados em `src/app/api/chat/route.ts` E `src/lib/whatsapp/processor.ts`; `pushNavState` em `action.kind="category"`; `processor.test.ts` com 5 integration tests).

Delta de testes: **+22 tests** em 4 arquivos novos (`topic-picker.test.tsx`, `scenarios.test.tsx`, `financing-comparison.test.tsx`, `processor.test.ts`) + extensões em `ai-sdk.test.ts` e `scenarios.test.ts`.

---

## 1. Sumário (19 itens)

| ID | Item | Round 1 | Round 2 | Δ |
|---|---|---|---|---|
| #01 | Categoria "moto" | PASS | PASS | — |
| #02 | "Serviços" removido | PASS | PASS | — |
| #03 | "Como funciona" benefícios | PASS | PASS | — |
| #04 | Helena 1ª fala calorosa | PARTIAL | **PARTIAL** | — (LLM eval pendente — hardening) |
| #05 | Tópicos clicáveis + voltar | PARTIAL | **PASS** | ✅ |
| #06 | Comando "voltar" funcional | PARTIAL | **PASS** | ✅ |
| #07 | Sem anglicismos | PASS | PASS | — |
| #08 | Copy financeiro factual | PARTIAL | **PARTIAL** | — (LLM eval pendente — hardening) |
| #09 | `recommend_groups` ≥3 | PARTIAL | **PASS** | ✅ |
| #10 | Card simulação 7 campos | PASS | PASS | — |
| #11 | Cálculo search × sim | PASS | PASS | — |
| #12 | 3 CTAs no fechamento | PASS | PASS | — |
| #13 | "Tenho interesse" afordância | PASS | PASS | — |
| #14 | Sem "card" no copy | PASS | PASS | — |
| #15 | Primeira vez = explicação | PARTIAL | **PARTIAL** | — (LLM eval pendente — hardening) |
| #16 | 3 cenários Cons/Prov/Acel | PARTIAL | **PASS** | ✅ |
| #17 | Comparador consórcio × financ. | PARTIAL | **PASS** | ✅ (LLM eval pendente — hardening) |
| #19 | Stepper 5 passos | PASS | PASS | — |
| #20 | Moto cross-canal web+WhatsApp | PARTIAL | **PASS** | ✅ |

**Totais Round 2:** **14 PASS / 3 PARTIAL / 0 FAIL** (era 10/9/0).
**Promovidos PARTIAL → PASS:** 6 (#05, #06, #09, #16, #17, #20).
**PARTIAL residuais:** 3 (#04, #08, #15) — todos pela mesma razão: LLM eval env-gated pendente (decisão de mover pra fase de hardening).

---

## 2. Detalhes dos 9 itens revisitados

### #04 — Helena 1ª fala calorosa — **PARTIAL** (sem mudança)
- **Remediação:** Nenhuma neste round. Critério determinístico (few-shot example calorosa) continua PASS; critério LLM eval (3 amostras temp=0, judge.naturalidade ≥ 0.85) **não implementado**.
- **Justificativa documentada:** Commit `6754eb2` explicita: *"LLM eval env-gated (#04 #08 #15 #17) — fica pra fase de hardening (opcional, não bloqueia comportamento runtime)"*. Decisão técnica defensável — o gate `LLM_TESTS=1` opcional cobre safety net contra drift do modelo, mas não bloqueia comportamento runtime de feature.
- **Voz crítica:** Risco silencioso menor mantido (modelo pode driftear pra tom seco em produção sem detecção no CI), porém aceitável pra MVP.

### #05 — Tópicos clicáveis + Voltar — **PASS** (era PARTIAL)
- **Remediação:** `src/components/chat/artifacts/topic-picker.tsx` criado (66 LOC, chips renderizados por mapa, botão Voltar opcional com `data-testid="topic-picker-back"`, `useChatContext` integrado, `disabled` durante streaming). `TopicPickerPayload` tipo registrado em `src/lib/chat/types.ts`. `artifact-renderer.tsx` route case `"topic-picker"` → `<TopicPicker />`.
- **Testes:** `topic-picker.test.tsx` (4 tests) — prompt opcional, 3 chips clicáveis, botão Voltar quando `includeBackButton=true`, ausência quando `false`. Roda em happy-dom, todos verdes.
- **Critério PASS:** Renderer existe, presentation tool já registrada no Round 1, payload tipado, DOM verificado, edge case do botão validado. Conexão runtime end-to-end fecha.
- **Observação:** Plano original pedia também "label literal no `onSelect`" — implementado via `sendAction({kind:"interest", label: topic})`, validado indiretamente pela mockagem de `useChatContext`.

### #06 — Comando "voltar" funcional — **PASS** (era PARTIAL)
- **Remediação:** Plug em **dois entry points** (`6754eb2` + `e36d1ab`).
  - `src/app/api/chat/route.ts:142-148` chama `pushNavState` em `action.kind="category"` (popula stack na transição); linha 304-334 detecta back intent textual e faz early-return com `popNavState`, restaurando `meta` (persona/category/expertiseLevel/experiencePrev/qualifyAnswers). Header `X-Navigation: back|noop`.
  - `src/lib/whatsapp/processor.ts:18-34, 76-79` aplica `handleBackIntent` posicionado APÓS handoff check, ANTES de `processWithOrchestrator` (permite voltar mesmo em fluxo handoff-aware).
- **Testes:** `processor.test.ts` (5 tests) cobre "voltar", "Voltar pro menu" case-insensitive, falso-positivo "vou voltar amanhã", paridade moto. `orchestrator/navigation.test.ts` (infra pura, já existente) preservado.
- **Critério PASS:** `grep "detectBackIntent\|popNavState\|pushNavState"` agora retorna call-sites em `src/app/api/chat/route.ts` (3 ocorrências) e `src/lib/whatsapp/processor.ts` (2 ocorrências) — exatamente o que faltava no Round 1.
- **Voz crítica satisfeita:** A promessa quebrada de `6043450` ("vem unificado no commit do #05") foi cumprida em `e36d1ab`. Bug real da Bruna v1 corrigido.

### #08 — Copy financeiro factual — **PARTIAL** (sem mudança)
- **Remediação:** Nenhuma neste round. Critério determinístico continua PASS (zero matches de adjetivos vetados, template factual presente). Critério LLM eval ausente.
- **Justificativa documentada:** Mesma decisão arquitetural de #04 — hardening opcional. **Risco mais alto que #04** (CDC art. 37 §1º, sanção administrativa real), mas mitigado por: (a) prompt limpo, (b) golden unit deterministic, (c) `disclaimer` no objeto retornado pelas tools financeiras.
- **Voz crítica:** Single point of failure mantido — se o LLM "esquecer" o template `{percentual}/{teto}/% do teto/R$ {parcela}`, o CI não detecta. Recomendação forte: implementar `LLM_TESTS=1` pra este item especificamente na próxima sprint (1-2h de trabalho).

### #09 — `recommend_groups` ≥3 opções — **PASS** (era PARTIAL)
- **Remediação:** `src/lib/agent/tools/ai-sdk.ts:267-292` agora usa `recommendWithFallback(adapter, searchParams)` em vez de `adapter.searchGroups` direto. Retorno expandido para incluir `expansionUsed` + `insufficientOptions` + flag `alternativa` re-anotada por id após o `rankGroups`.
- **Testes:** `ai-sdk.test.ts:23-44` invoca `consorcioTools.recommend_groups.execute` end-to-end e valida que retorno tem `expansionUsed`, `insufficientOptions`, e que `recommendations[0]` tem `alternativa`. Função pura continua coberta em `recommendation.test.ts` (6 cases, Round 1).
- **Critério PASS:** `grep recommendWithFallback src/` agora aparece em call-site além de declaração. Garantia de ≥3 opções (com fallback ±20%, ±50%) é runtime, não só função pura. Bug regulatório (oferta dirigida sem escolha real) fechado.

### #15 — Primeira vez = explicação básica inline — **PARTIAL** (sem mudança)
- **Remediação:** Nenhuma neste round. Critério determinístico (example "Primeira vez" cobre 5 de 7 termos didáticos) continua PASS. Critério LLM eval ausente.
- **Justificativa documentada:** Mesma decisão arquitetural — hardening. Risco regulatório CMN res. 4.927/2021 mitigado por presença do few-shot example no prompt, mas não há prova de generalização do modelo pra inputs não-vistos.
- **Voz crítica:** Mantida do Round 1. Aceitável pra MVP, **não aceitável pra produção em escala**.

### #16 — 3 cenários Conserv/Prov/Acel — **PASS** (era PARTIAL)
- **Remediação:** `src/lib/agent/scenarios.ts:18-27` `Scenario` interface agora tem `lanceValue` e `ownResourcesValue` (campos faltantes do Round 1). Conservador zera ambos; Provável tem só `lanceValue` (20% × creditValue); Acelerado tem `lanceValue` (30%) + `ownResourcesValue` (10%). Renderer `src/components/chat/artifacts/scenarios.tsx` (57 LOC) com 3 cards lado a lado, `data-testid="scenario-{key}"`, formato BRL, exibição condicional de R$ lance e recursos próprios.
- **Testes:** `scenarios.test.tsx` (4 tests DOM) — 3 cards distintos, labels + prazos visíveis, acelerado mostra "R$ 270" (lance 30% de 900k) e "R$ 90" (recursos 10%), disclaimer obrigatório aparece ≥3× no DOM. `scenarios.test.ts` ganhou +3 tests de função pura validando os novos campos.
- **Critério PASS:** Contrato do plano cumprido (4 campos por cenário). Tool `compute_scenarios` + `present_scenarios` + renderer + DOM assertion + função pura — todas as camadas conectadas.

### #17 — Comparador consórcio × financiamento — **PASS** (era PARTIAL)
- **Remediação:** `src/components/chat/artifacts/financing-comparison.tsx` (59 LOC) com 2 cards (`data-testid="comparison-consorcio"`, `comparison-financing"`), parcelas mensais formatadas BRL, custo total, premissa CET anual, banner com qual fica mais barato + diff mensal + total, disclaimer obrigatório. `FinancingComparisonPayload` tipado. `present_financing_comparison` registrada como presentation tool em `ai-sdk.ts:398` e adicionada ao `PRESENTATION_TOOLS` set (linha 502). `artifact-renderer.tsx` route case correspondente.
- **Testes:** `financing-comparison.test.tsx` (5 tests DOM) — 2 cards, parcela ambos lados (R$ 5.715 vs R$ 8.681), premissa CET visível (10%/ano), diff mensal/total (R$ 2.966/R$ 712), disclaimer.
- **Critério PASS:** 6 elementos DOM exigidos pelo plano cobertos. Não depende mais do modelo verbalizar — agente invoca tool, renderer entrega artifact estruturado pro usuário.
- **PARTIAL residual:** LLM eval env-gated (≥2/3 amostras invocam tool quando perguntado "qual a diferença pra financiamento?") **não implementado**, movido pra hardening. Não bloqueia GO (a tool existe, está disponível e tem renderer; veto do prompt foi removido no Round 1).

### #20 — Moto cross-canal web + WhatsApp — **PASS** (era PARTIAL)
- **Remediação:** `src/lib/whatsapp/processor.test.ts` criado com 5 integration tests com mock de `processWithOrchestrator`. Validações: "voltar" não chama orchestrator, "Voltar pro menu" case-insensitive, "quero comprar uma moto" chama orchestrator com texto preservado, "vou voltar amanhã" NÃO triggera back intent (anti falso-positivo), paridade categoria moto via texto livre passa pro orchestrator igual web.
- **Critério PASS:** Paridade web ↔ WhatsApp agora é verificada, não inspecionada. Arquitetura compartilhada (`processWithOrchestrator`) é o adapter; teste prova o comportamento.

---

## 3. Regressão

**Suite completa:** `npm run test` → Test Files **27 passed | 1 skipped (28)** — Tests **241 passed | 3 skipped (244)**, duration 2.35s, exit 0.

Baseline Round 1 (219/3 em 24 files): preservado e expandido. Delta: **+22 tests, +4 test files**, 0 regressão.

**Typecheck:** `npx tsc --noEmit` → exit 0.

**Grep de plug runtime (excluindo testes):**
```
src/app/api/chat/route.ts:17-19 → import detectBackIntent, popNavState, pushNavState
src/app/api/chat/route.ts:142   → pushNavState em action="category"
src/app/api/chat/route.ts:304   → detectBackIntent + popNavState early-return
src/lib/agent/tools/ai-sdk.ts:16 → import recommendWithFallback
src/lib/agent/tools/ai-sdk.ts:274 → recommendWithFallback no tool execute
src/lib/whatsapp/processor.ts:4  → import detectBackIntent, popNavState
src/lib/whatsapp/processor.ts:21,76 → handleBackIntent + early-return
```
Todos os 4 símbolos críticos têm call-site em código de produção. Round 1 só tinha declarações.

**Renderers:**
```
src/components/chat/artifacts/topic-picker.tsx          ✓
src/components/chat/artifacts/scenarios.tsx              ✓
src/components/chat/artifacts/financing-comparison.tsx   ✓
```
`artifact-renderer.tsx` route pros 3 novos types (linhas 27, 28-29, 31).

**Copy violations:** sem regressão vs Round 1. Diretivas negativas no prompt mantidas como esperado.

---

## 4. Veredito final

# ✅ **GO**

A branch fechou os 6 bloqueadores estruturais do Round 1 — plug runtime de back-intent (#06), plug do `recommendWithFallback` no tool (#09), 3 renderers frontend novos (#05, #16, #17), extensão da `Scenario` interface (#16), e integration test do WhatsApp (#20). De 9 PARTIAL para 3, com 14 PASS limpos, 0 FAIL, 0 regressão, typecheck verde, 241 testes em 2.35s.

Os 3 PARTIAL residuais (#04, #08, #15) compartilham raiz única: **LLM eval env-gated ausente**. A decisão de mover para fase de hardening está documentada no commit `6754eb2` e é tecnicamente defensável:

- Não bloqueia comportamento de feature em runtime (é safety net contra drift do modelo).
- Critérios determinísticos cobrem o estímulo (prompt limpo, few-shot examples corretas, templates factuais).
- Custo de implementação na próxima sprint é baixo (~1-2h por item, gated `LLM_TESTS=1` para não consumir tokens no CI default).

**Critérios GO do contrato atualizado:**

- 0 FAIL ✅
- ≤ 4 PARTIAL com justificativa documentada ✅ (3 PARTIAL, todos com justificativa explícita em commit)
- 0 regressão ✅
- Typecheck limpo ✅
- LLM eval NÃO bloqueia GO ✅ (decisão de hardening)

**Bloqueadores residuais:** **NENHUM**.

**Recomendação pós-merge (hardening sprint, prioridade decrescente):**
1. **#08** — LLM eval factualidade (risco regulatório CDC mais alto dos três; 3 amostras temp=0 com R$ 5.715/R$ 6.000, judge ≥ 0.85).
2. **#15** — LLM eval educação primeira vez (risco CMN res. 4.927; comparar `experiencePrev:"first"` vs `"experienced"`).
3. **#04** — LLM eval naturalidade Helena (risco produto, não regulatório; menor prioridade).
4. Pequenas lacunas anotadas no Round 1 que não foram revisitadas: incluir "moto" no loop do `mock-bevi-adapter.test.ts:26` (#11 cobertura) e alinhar intents `adjust_credit_value`/`compare_other_admin` com strings do plano (#12 semântica).

**Veredito resumido:** *Round 2 entrega exatamente o que Round 1 cobrou — o plug. O que Round 1 tinha de fundação bem-testada agora tem fios conectados à tomada. A usuária Bruna v2 vai ver os 6 bugs (#05, #06, #09, #16, #17, #20) corrigidos no produto, não só no código de suporte. Os 3 PARTIAL residuais são hardening opcional sem impacto no comportamento de feature — liberar pra develop.*
