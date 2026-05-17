# QA Report — Revisão Bruna v1 (Aja Agora)

**Data:** 2026-05-16
**Branch:** `fix/bruna-v1-review` (base `develop`, 15 commits)
**QA:** Senior QA Lead TwoBrains, persona fintech consórcio, 15 anos de experiência
**Contrato:** `docs/specs/2026-05-16-bruna-v1-qa-plan.md`
**Baseline anterior:** 107 passed / 3 skipped (12 test files)
**Estado atual:** **219 passed / 3 skipped (24 test files)** — sem regressão; vitest 4.1.6, 2.39s, exit 0
**Typecheck:** `npx tsc --noEmit` → exit 0
**LLM eval gated (`LLM_TESTS=1`):** ❌ **NÃO IMPLEMENTADO em nenhum item** (plano exigia para #04, #08-parcial, #15, #17-parcial)

---

## 1. Sumário (19 itens)

| ID | Item | Verdict | Commit |
|---|---|---|---|
| #01 | Categoria "moto" adicionada | ✅ PASS | 3d53344 |
| #02 | "Serviços" removido da landing | ✅ PASS | 3d53344 |
| #03 | "Como funciona" foca em benefícios | ✅ PASS | 2580f9b |
| #04 | Helena 1ª fala calorosa | ⚠️ PARTIAL | 4032821 |
| #05 | Tópicos clicáveis + voltar | ⚠️ PARTIAL | 8179508 + 6043450 |
| #06 | Comando "voltar" funcional | ⚠️ PARTIAL | 6043450 |
| #07 | Sem anglicismos no copy | ✅ PASS | 5d4e868 |
| #08 | Copy financeiro factual | ⚠️ PARTIAL | 09a3983 |
| #09 | `recommend_groups` ≥3 sempre | ⚠️ PARTIAL | faa8928 |
| #10 | Card simulação 7 campos | ✅ PASS | 13426c2 |
| #11 | Cálculo consistente search × sim | ✅ PASS | 8dbd904 |
| #12 | 3 CTAs explícitos no fechamento | ✅ PASS | 13426c2 |
| #13 | "Tenho interesse" afordância elevada | ✅ PASS | 2580f9b |
| #14 | Sem "card" no copy ao usuário | ✅ PASS | 5d4e868 |
| #15 | Primeira vez = explicação básica | ⚠️ PARTIAL | 4032821 |
| #16 | 3 cenários Conserv/Prov/Acel | ⚠️ PARTIAL | 8179508 |
| #17 | Comparador consórcio × financiamento | ⚠️ PARTIAL | 4e0ffd4 |
| #19 | Stepper 5 passos na landing | ✅ PASS | 2580f9b |
| #20 | Moto cross-canal web + WhatsApp | ⚠️ PARTIAL | 3d53344 |

**Totais:** 10 PASS / 9 PARTIAL / 0 FAIL.

---

## 2. Detalhes por item

### Item #01 — Categoria "moto" adicionada
- **Verdict:** ✅ PASS
- **Commit:** `3d53344`
- **Critérios validados:** `Category` literal aceita "moto" (`src/lib/agent/categories.test.ts:6-15`); `CATEGORY_META.moto` definido com label "Moto" (`:17-20`); mock `groups.json` tem ≥3 grupos categoria moto na faixa 5k-100k e prazo 24-84m (`src/lib/adapters/mock/data/groups.test.ts:12-32`); schema DB constraint atualizada via `drizzle/0009_thankful_ego.sql` listada no commit; preserva imovel/auto/servicos.
- **Testes rodados:** `npm run test -- src/lib/agent/categories.test.ts src/lib/adapters/mock/data/groups.test.ts` → 8 passed.
- **Observações:** Spec pedia `defaultCreditRange` em `CATEGORY_META`; o teste do plano não exige, e a entry tem só `label` + `emoji`. Sem impacto.

### Item #02 — "Serviços" removido da landing
- **Verdict:** ✅ PASS
- **Commit:** `3d53344`
- **Critérios validados:** `GOALS.length === 3` exatamente, ids `["auto","imovel","moto"]`, chip `servicos` `undefined` (`src/components/landing/hero-section.test.tsx:23-32`).
- **Testes rodados:** `npm run test -- src/components/landing/hero-section.test.tsx` → 6 passed.
- **Observações:** Persona `servicos` mantida no DB com `isActive=false` (preservação correta).

### Item #03 — "Como funciona" foca em benefícios
- **Verdict:** ✅ PASS
- **Commit:** `2580f9b`
- **Critérios validados:** Copy contém "sem juros", "parcela", "lance", "contempla" (`how-it-works.test.tsx:26-36`); copy NÃO contém `100% IA`, `agente inteligente`, `inteligência artificial`, `\bIA\b` (`:38-48`).
- **Testes rodados:** `npm run test -- src/components/landing/how-it-works.test.tsx` → 5 passed.
- **Observações:** Cumpre o gate regulatório de evitar overclaim (CDC art. 37).

### Item #04 — Helena 1ª fala calorosa
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `4032821`
- **Critérios validados (determinístico):** Example "Primeiro turno apos transicao" existe; resposta contém "bom" e "adorar" (calor); não tem abertura robótica `/sou (a|o) X, sua assistente/`; menciona "imovel" nas 2 primeiras frases (`system-prompt.test.ts:49-85`).
- **Achado:** O critério LLM env-gated do plano (3 amostras temp=0, judge.naturalidade ≥ 0.85) **não foi implementado** — não há `describe.skipIf(!process.env.LLM_TESTS)` em arquivo nenhum. Cobertura é só do **few-shot example** em código; nenhuma chamada real ao Claude valida que o comportamento em runtime mantém o tom.
- **Voz crítica:** *O commit cobre só o estímulo (a fala de exemplo é calorosa), não a resposta do modelo. Helena pode continuar respondendo com seco em produção e o teste nunca detecta — vira regressão silenciosa.*

### Item #05 — Tópicos clicáveis + "Voltar"
- **Verdict:** ⚠️ PARTIAL
- **Commits:** `8179508` (tool schema) + `6043450` (infra "voltar")
- **Critérios validados:** Tool `present_topic_picker` existe em `consorcioTools` e está em `PRESENTATION_TOOLS` (`tools/ai-sdk.test.ts:18-21`).
- **Achado 1 (FAIL parcial):** Plano exigia `src/components/chat/artifacts/topic-picker.test.tsx` validando 3-5 chips + botão Voltar + onSelect com label literal. **Arquivo não existe.** Nenhum renderer frontend de `present_topic_picker` foi criado — `ls src/components/chat/artifacts/` mostra só `comparison-table.tsx, gate-quick-reply.tsx, gate-renderer.tsx, group-card.tsx, lead-form.tsx, recommendation-card.tsx, simulation-result.tsx, value-picker.tsx, welcome-categories.tsx`.
- **Achado 2 (FAIL parcial):** Edge case 2 do plano (botão voltar restaura estado) depende do plug do `popNavState` no orchestrator, que **não foi feito** (ver #06).
- **Voz crítica:** *Tool registrada na lista de presentation, mas sem renderer no frontend. Quando o agente invocar a tool em produção, o artifact simplesmente não aparece — usuário fica sem chips e sem botão. O teste valida só que a chave existe no objeto, não que a UI funciona.*

### Item #06 — Comando "voltar" funcional
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `6043450`
- **Critérios validados (infra pura):** `NavState`, `pushNavState`/`popNavState` com cap 20 imutáveis; `detectBackIntent` ancorado com 9 positivos (incluindo "Voltar", "volta!", "voltar.") e 9 negativos (incluindo "vou voltar amanhã", "reviravolta") (`orchestrator/navigation.test.ts:19-110`).
- **Achado (FAIL parcial):** `detectBackIntent` e `popNavState` **nunca são chamados em runtime**. `grep "detectBackIntent\|popNavState\|pushNavState"` em `src/app/api/chat/`, `src/lib/whatsapp/` e `src/lib/agent/orchestrator/` (excluindo testes) retorna **apenas as declarações em `navigation.ts`**. Nenhum entry point usa.
- **Voz crítica:** *O commit message do `6043450` admite explicitamente: "Plug nos entry points (api/chat/route.ts + whatsapp/processor.ts)... vem unificado no commit do #05" — mas o `8179508` não plugou. Promessa quebrada. Em produção, usuária digita "voltar" e o agente continua reagindo igual antes do fix — exatamente o bug que a Bruna reportou.*

### Item #07 — Sem anglicismos no copy
- **Verdict:** ✅ PASS
- **Commit:** `5d4e868`
- **Critérios validados:** Loop sobre 7 anglicismos vetados (`range`, `nice`, `cool`, `feedback`, `insight`, `tip`, `hack`) sobre cada `assistantResponse` dos shared examples (`system-prompt.test.ts:87-100`); confirmação de substituição com `faixa` presente (`:102-105`).
- **Testes rodados:** `npm run test -- src/lib/agent/system-prompt.test.ts` → 17 passed (todo o arquivo).
- **Observação:** `micro-insight` aparece 2× em `system-prompt.ts` (linha 93 e 337) mas em instruções internas pro modelo, não em copy user-facing — o teste filtra corretamente só `assistantResponse`. Borderline mas dentro do escopo do plano.

### Item #08 — Copy financeiro factual (CRÍTICO regulatório)
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `09a3983`
- **Critérios validados (determinístico):** Zero matches de `/cabe (bem )?no (seu )?(orçamento|orcamento|bolso)/i`, `/dentro do seu orçamento/i`, `/adequad[oa] (ao|pro) seu (orçamento|perfil)/i` (`system-prompt.test.ts:8-21`); template factual `{percentual}/{teto}/% do teto/R$ {parcela}` presente (`:23-32`); nenhuma linha contendo "parcel" tem adjetivo `/[óo]tim[ao]|excelente|perfeit[ao]|confort[áa]vel|tranquil[ao]/i` (`:34-46`).
- **Achado (FAIL parcial):** Plano exigia LLM eval env-gated: gerar 3 amostras com parcela R$ 5.715 / teto R$ 6.000, validar ≥2/3 com porcentagem ou valor absoluto, judge.factualidade ≥ 0.85. **Não foi feito.** Apenas o **prompt** está limpo; sem teste rodando Claude com input controlado, não há garantia de que o modelo respeita o template em runtime.
- **Voz crítica:** *Dos 4 cenários do plano (golden unit + golden LLM + edge alta% + edge baixa%), só o golden unit foi entregue. Risco crítico CDC art. 37 §1º — judge.factualidade nunca foi medido. Single point of failure: se o LLM "esquecer" o template, ninguém detecta no CI.*

### Item #09 — `recommend_groups` ≥3 opções sempre
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `faa8928`
- **Critérios validados (função pura):** Golden 5 grupos, fallback ±20% com flag `alternativa`, fallback ±50%, `insufficientOptions=true` quando ainda <3, dedup por id, originais antes de alternativos (`recommendation.test.ts:41-156`).
- **Achado (FAIL parcial):** `recommendWithFallback` **não está plugado** no tool `recommend_groups` em `src/lib/agent/tools/ai-sdk.ts:267-288`. O tool continua chamando `adapter.searchGroups(searchParams)` + `rankGroups(...)` sem o fallback. `grep recommendWithFallback src/` fora dos testes retorna **só a declaração em `recommendation.ts`**.
- **Voz crítica:** *Em runtime, o agente continua podendo retornar 1-2 opções — exatamente o bug regulatório (oferta dirigida sem escolha real) que o plano marcou como risco. Função pura testada, integração zero.*

### Item #10 — Card simulação 7 campos
- **Verdict:** ✅ PASS
- **Commit:** `13426c2`
- **Critérios validados:** 7 assertions por DOM (`valor do crédito/carta`, `200 meses`, `/mês`, `taxa de administração`, `fundo de reserva`, `cenário com lance` + `contemplação`, `INCC` para imóvel) e ausência de `IPCA` no caso imóvel; categoria auto/moto retorna `IPCA` e ausência de `INCC` (`simulation-result.test.tsx:37-89`).
- **Testes rodados:** `npm run test -- src/components/chat/artifacts/simulation-result.test.tsx` → 12 passed.

### Item #11 — Cálculo consistente search × sim (CRÍTICO)
- **Verdict:** ✅ PASS
- **Commit:** `8dbd904`
- **Critérios validados:** Golden Rodobens R$ 900k diff ≤ R$ 1 (`mock-bevi-adapter.test.ts:7-23`); todos os grupos de imovel/auto/servicos no loop diff ≤ R$ 1 (`:25-44`); auto isolado (`:46-56`); determinismo (`:58-62`). Refator extraiu `computeQuota` puro usado por ambos paths.
- **Achado menor:** O loop "todos os grupos" cobre `["imovel","auto","servicos"]` mas **não inclui "moto"** (linha 26). Categoria nova do #01 não foi extrapolada no #11. Cobertura parcial; o golden+auto isolado dá confiança suficiente pra manter PASS, mas vale anotar pra próxima.
- **Testes rodados:** `npm run test -- src/lib/adapters/mock/mock-bevi-adapter.test.ts` → 4 passed.

### Item #12 — 3 CTAs explícitos no fechamento
- **Verdict:** ✅ PASS
- **Commit:** `13426c2`
- **Critérios validados:** "Tenho interesse" sempre presente; quando `payload.actions` populado, renderiza "Ajustar valor", "Nova simulação", "Comparar outra"; retrocompat sem `actions` não quebra (`simulation-result.test.tsx:92-131`).
- **Observação:** Spec menciona intents `adjust_credit_value`, `new_simulation`, `compare_other_admin` — o teste usa `adjust_value`, `new_simulation`, `compare_other`. Strings divergentes do contrato, mas teste valida label visível (não intent). Pequena inconsistência semântica.

### Item #13 — "Tenho interesse" afordância elevada
- **Verdict:** ✅ PASS
- **Commit:** `2580f9b`
- **Critérios validados:** Botão `[data-testid="tenho-interesse-cta"]` tem classes `shadow-lg` E `ring-1|ring-2|ring-primary` (`simulation-result.test.tsx:102-108`).
- **Observação:** Plano também pedia altura ≥ 44px (touch target WCAG). Não há assertion direta de tamanho — depende dos tokens shadcn padrão (geralmente OK, mas não verificado).

### Item #14 — Sem "card" no copy ao usuário
- **Verdict:** ✅ PASS
- **Commit:** `5d4e868`
- **Critérios validados:** Nenhum `assistantResponse` dos shared examples casa `/\bcards?\b/i`; `SPECIALIST_BASE_PROMPT` não casa `/no card que (mandei|apareceu|mostrei)/i` nem `/no card de recomendacao/i` (`system-prompt.test.ts:108-125`).
- **Observação:** "card" continua aparecendo em **instruções pro modelo** dentro do prompt (ex: linha 138 "ORDEM DE ENTREGA... card/tabela"). Plano permitiu isso (jargão técnico interno, não copy ao usuário). Pass legítimo.

### Item #15 — Primeira vez = explicação básica inline
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `4032821`
- **Critérios validados (determinístico):** Example com `context` "Primeira vez" existe; contém ≥3 termos didáticos (`sem juros`, `grupo de pessoas`, `sorteio`, `lance`, `assembleia`, `contemplad`, `taxa de admin`) — verificado em `system-prompt.test.ts:147-176`. A `assistantResponse` real cobre 5 dos 7 (sem juros + grupo + sorteio/lance + assembleia + taxa admin).
- **Achado (FAIL parcial):** Plano LLM env-gated: 3 amostras temp=0 com `experiencePrev:"first"`, ≥2/3 contêm ≥3 termos, comprimento entre 80-400 palavras, edge "experienced" NÃO recebe explicação (≤1/3). **Não implementado.**
- **Voz crítica:** *Risco regulatório alto (CMN res. 4.927/2021 — educação do consorciado novato). Validar só o few-shot é fundação fraca: o modelo pode receber experiencePrev=first em produção e responder "Show, vamos buscar opções" sem explicar nada — teste passa, usuário desinformado.*

### Item #16 — 3 cenários Conserv/Prov/Acel
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `8179508`
- **Critérios validados:** `computeScenarios` retorna 3 entries, conservador `lancePercent=0` prazo nominal, provavel `lancePercent=20`, acelerado `lancePercent≥30`; ordem `conservador > provavel > acelerado` em prazo; disclaimer obrigatório em todos; respeita prazo curto (`scenarios.test.ts:4-55`). Tool `compute_scenarios` + `present_scenarios` registradas (`tools/ai-sdk.test.ts:5-11`).
- **Achado 1 (FAIL parcial):** Plano pedia retorno com `{ lancePercent, lanceValue, ownResourcesValue, expectedContemplationMonths }`. **Faltam `lanceValue` (em R$)** e **`ownResourcesValue` (em R$)** — `Scenario` interface (`scenarios.ts:18-23`) tem só `lancePercent, expectedTermMonths, strategy, disclaimer`. O teste `acelerado.ownResourcesValue > 0` do plano não pode ser executado porque o campo não existe.
- **Achado 2 (FAIL parcial):** Plano pedia `src/components/chat/artifacts/scenarios.test.tsx` validando 3 cards no DOM. **Arquivo não existe**; renderer frontend `scenarios.tsx` **também não existe** em `src/components/chat/artifacts/`.
- **Voz crítica:** *Tool calculadora limpa e tool de presentation registrada — mas sem componente que renderize, sem teste DOM, e faltando 2 campos do contrato. Em runtime: agente chama present_scenarios, sistema intercepta como artifact... e nada aparece pro usuário. Pior: o "Acelerado" precisa mostrar quantos R$ de recursos próprios entram, e o adapter não devolve esse número.*

### Item #17 — Comparador consórcio × financiamento
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `4e0ffd4`
- **Critérios validados (determinístico):** `computePMT` Price com caso canônico, BACEN imóvel, degenerado taxa zero, determinismo, rejeição prazo zero (`pmt.test.ts:4-28`); `DEFAULT_FINANCING_RATES` por categoria com faixas BACEN (`:30-44`); `compareWithFinancing` retorna `consorcio/financing/diff/disclaimer` com sinais corretos (`:46-84`); diretivas de RECUSA removidas — `SYSTEM_PROMPT` e `SPECIALIST_BASE_PROMPT` não casam `/n[ãa]o compar[ae] (com|cons[óo]rcio com) financiamento/i` e ambos instruem a usar `compare_with_financing` (`system-prompt.test.ts:127-145`). Tool registrada (`tools/ai-sdk.test.ts:14-16`). Grep confirma: zero matches para `n[ãa]o compar.*financ` em `system-prompt.ts`.
- **Achado 1 (FAIL parcial):** Plano pedia LLM eval env-gated: usuário pergunta "qual a diferença pra um financiamento?" → ≥2/3 amostras invocam tool `compare_with_financing`. **Não implementado.** Sem prova de runtime, o agente pode continuar evitando a tool mesmo com o veto removido.
- **Achado 2 (FAIL parcial):** `compare_with_financing` **não tem renderer frontend** — não está em `PRESENTATION_TOOLS` (`ai-sdk.ts:461-470` mostra a lista, faltando `present_financing_comparison`), e não existe componente `financing-comparison.tsx` em `src/components/chat/artifacts/`. O agente faz a comparação e devolve só texto JSON pra ele mesmo; o usuário vê o que o modelo verbalizar em prosa. Plano pedia 6 elementos DOM (parcela consórcio, parcela financ., diferença mensal, custo total ambos, premissa, disclaimer).
- **Achado 3 (regulatório):** O `disclaimer` obrigatório está no objeto retornado pelo `compareWithFinancing` (testado), mas como o output só vai pro modelo e não pra UI, depende 100% do LLM repetir o texto literal pro usuário. CDC art. 37 — risco médio/alto se modelo encurtar.
- **Voz crítica:** *Tool + cálculo financeiro corretos e veto removido — mas sem renderer, sem teste DOM e sem LLM eval, a entrega ao usuário fica "no boca do modelo". Comparação de produtos financeiros é território regulatório minado; testar só PMT puro é nível mecânica, não nível compliance.*

### Item #19 — Stepper 5 passos na landing
- **Verdict:** ✅ PASS
- **Commit:** `2580f9b`
- **Critérios validados:** `STEPS.length === 5`, ordem certa (escolha → simula → grupo → contempla → realiza/objetivo), cada step com `icon` definido, números "01"–"05" (`how-it-works.test.tsx:5-24`).
- **Observação:** Plano também pedia assertion via DOM (SVG inline, role=listitem). Teste valida só a estrutura de dados exportada, não o render. Pequena lacuna, mas critério `cada step.icon definido` cobre indiretamente (vai ser SVG do lucide).

### Item #20 — Moto cross-canal web + WhatsApp
- **Verdict:** ⚠️ PARTIAL
- **Commit:** `3d53344`
- **Critérios validados (indireto):** `routing.ts:9` tem regex `/\b(moto|motocicleta|motoca|motoneta)\b/i` separado de `auto`. `whatsapp/formatter.ts` aceita `"imovel" | "auto" | "moto" | "servicos"` em 4 callsites. Routing é compartilhado entre canais (`processor.ts` chama `processWithOrchestrator` que herda do mesmo path).
- **Achado (FAIL parcial):** Plano pedia `src/lib/whatsapp/processor.test.ts` com test integration: mock do orchestrator, assertar que "quero comprar uma moto" via WhatsApp dispara `category: "moto"` no orchestrator, matriz de variações, paridade entre web e whatsapp (mesma persona + 1ª pergunta). **Arquivo não existe** — `ls src/lib/whatsapp/*.test.*` retorna exit 1 (sem matches).
- **Voz crítica:** *Commit message do `3d53344` afirma: "WhatsApp processor não toca: orchestrator é Category-agnóstico, herda automaticamente". É verdade na arquitetura — mas o plano cravou que prova precisa vir via teste integration. Sem teste, paridade web ↔ WhatsApp pra moto fica "evidente por inspeção", não por verificação. Em fintech B2C isso é insuficiente.*

---

## 3. Regressão

`npm run test` total: **Test Files 23 passed | 1 skipped (24)** — **Tests 219 passed | 3 skipped (222)**, duration 2.39s, exit 0.

Baseline (12 test files, 107 passed): preservado. Os 23 arquivos passing incluem todos os 12 originais sem modificação destrutiva. Os 3 skipped: `scorer.integration.test.ts` (precisa DB real via `HAS_REAL_DB`), e 2 anteriormente skippados em `eligibility/transcript`.

`npx tsc --noEmit` → exit 0.

Copy violations:
- `cabe bem no/cabe.*orcamento`: **só 1 ocorrência**, em linha de **diretiva negativa** no prompt (`system-prompt.ts:215` — "NUNCA use adjetivos subjetivos sobre a parcela ('cabe bem', 'dentro do orcamento', ...)") — comportamento esperado.
- `nesse range|no card que mandei`: **só 1 match**, dentro de **arquivo de teste** (`system-prompt.test.ts:118`) como string regex de assertion.
- `n[ãa]o compar.*financ` em `system-prompt.ts`: **0 matches** — diretiva de recusa removida com sucesso.

LLM tests gated: **não rodados** porque não existem (`grep "LLM_TESTS\|describe.skipIf" src/` retorna vazio fora do `scorer.integration` baseline).

---

## 4. Veredito final

**NO-GO com bloqueador único: PLUG.**

A branch entrega **fundação técnica sólida e bem testada**: 10 itens PASS limpos, 0 FAIL, 0 regressão, typecheck verde, 219 testes em 2.39s. Mas **9 itens PARTIAL** compartilham a mesma raiz: o trabalho parou na infra/cálculo/exemplo, e o plug no orchestrator / API route / componente frontend foi adiado para "commit do orchestrator/runner" que **não existe nesta branch**.

Especificamente:
- **#06, #09**: funções puras testadas, mas zero call-sites em runtime.
- **#05, #16, #17**: tools registradas no AI SDK, mas sem renderer frontend — usuário recebe nada quando a tool é invocada.
- **#04, #08, #15, #17**: LLM eval env-gated obrigatório no plano não foi implementado em nenhum item — gate global do plano (`LLM_TESTS=1` rodado ≥ 1 vez) falha por inexistência.
- **#20**: paridade WhatsApp baseada em inspeção arquitetural, sem teste integration.

**Critérios GO do contrato:**
- 0 FAIL ✅
- ≤5 PARTIAL com justificativa ❌ (9 PARTIAL; 5 deles têm justificativa explícita no commit, 4 não)
- 0 regressão ✅
- 0 violação de copy ✅
- typecheck limpo ✅
- LLM eval rodado ≥1× ❌ (não implementado)
- Disclaimer regulatório verificado em #08/#16/#17 ⚠️ (verificado nas funções puras, não no que chega ao usuário)

**Bloqueadores pra próximo loop:**
1. Plug `detectBackIntent` + `popNavState` em `src/app/api/chat/route.ts` e `src/lib/whatsapp/processor.ts` (#06+#05).
2. Substituir tool `recommend_groups` em `ai-sdk.ts:267-288` para usar `recommendWithFallback` (#09).
3. Criar renderers `topic-picker.tsx`, `scenarios.tsx`, `financing-comparison.tsx` em `src/components/chat/artifacts/` + testes DOM (#05, #16, #17).
4. Adicionar `lanceValue` + `ownResourcesValue` em `Scenario` interface e teste correspondente (#16).
5. Implementar pelo menos UM teste LLM env-gated (sugestão: #08 — risco regulatório crítico).
6. Criar `src/lib/whatsapp/processor.test.ts` integration test (#20).

**Veredicto resumido:** *Cinco horas de trabalho excelente em fundação, zero minutos de plug. A branch passa nos gates mecânicos mas falha no contrato de plano por margem larga — a usuária Bruna abrirá a v2 e vai encontrar exatamente os mesmos bugs (#05, #06, #09, #16, #17) que reportou na v1, porque o que mudou foi código de suporte, não o comportamento end-to-end. Liberar pra develop sem o plug é regressão de produto disfarçada de avanço de cobertura.*
