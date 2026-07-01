# Plano de Teste — Revisão Bruna v1 (Aja Agora)

**Data:** 2026-05-16
**Branch:** `fix/bruna-v1-review` (base `develop`)
**Autor:** PO Lead (Opus 4.7) — persona QA fintech consórcio, 15 anos de experiência
**Consumidores:**
- Developer (escreve testes que falham primeiro, conforme TDD global do Kairo)
- QA Crítico (próximo agent) — marca PASS / FAIL / PARTIAL por item usando este documento como contrato

## Contexto

A Product Designer Bruna fez review da v1 da plataforma e produziu 20 críticas (defeitos técnicos, copy, UX, features novas). 19 itens entram nesta branch (#18 vira roadmap separado). O plano técnico de execução está em `~/.claude/plans/joyful-hatching-dewdrop.md`. Este documento é o **contrato de aceite** — cada item tem critérios formais GIVEN/WHEN/THEN, métricas mensuráveis, cenários negativos e lista de testes existentes que NÃO podem regredir. Sem critério verificável, sem GO.

Stack relevante para testes: Next.js 16, Vitest 4.1.6 (12 test files passando hoje), eval framework custom em `src/lib/eval/` com `judge`/`scorer`/`signals`, happy-dom (a ser adicionado na Etapa 0 pra component tests), Vercel AI SDK 6 com Claude Anthropic.

---

## Resumo executivo

| ID | Item | Tipo | Severidade | Risco regulatório |
|---|---|---|---|---|
| #01 | Categoria "moto" (substitui Serviços) | unit + component | alta | não |
| #02 | Tirar "Serviços" do landing | component | média | não |
| #03 | "Como funciona" foca em benefícios consórcio | component | média | sim (overclaim "100% IA") |
| #04 | Helena 1ª fala calorosa | eval (LLM) | média | não |
| #05 | "Entender mais antes" → chips + voltar | integration + component | alta | não |
| #06 | Comando "voltar" funcional | unit + integration | alta | não |
| #07 | Tirar anglicismos do copy | unit (regex) | baixa | não |
| #08 | Copy financeiro factual, não subjetivo | eval (LLM) + unit (regex) | **crítica** | **sim — Susep/CMN/CDC** |
| #09 | `recommend_groups` ≥3 opções sempre | unit | alta | sim (oferta inadequada por escassez) |
| #10 | Card simulação com 7 campos completos | component + unit | alta | sim (omissão de info contratual) |
| #11 | Cálculo consistente comparativo vs simulação | unit | **crítica** | sim (preço divergente = publicidade enganosa) |
| #12 | CTAs explícitos no fechamento | component | média | não |
| #13 | "Tenho interesse" com afordância elevada | component | média | não |
| #14 | Tirar palavra "card" do copy | unit (regex) | baixa | não |
| #15 | Primeira vez = explicação básica inline | eval (LLM) | alta | sim (educação contratual obrigatória) |
| #16 | 3 cenários (Conservador/Provável/Acelerado) | integration + component | alta | sim (premissa de contemplação tem que ser cravada) |
| #17 | Comparador consórcio × financiamento | unit + eval (LLM) | alta | **sim — comparação de produtos financeiros** |
| #19 | Stepper visual 5 passos na landing | component | baixa | não |
| #20 | Moto cross-canal (web + WhatsApp) | integration | alta | não |

Total: 19 itens. 5 itens com risco regulatório alto. 2 itens críticos (#08 overclaim, #11 cálculo divergente).

---

## Critérios globais

### TDD policy (regra global Kairo — não negociável)

Cada item segue o ciclo:

1. Escrever teste de regressão PRIMEIRO (reproduz o bug ou crava o comportamento esperado)
2. Rodar teste e VER FALHAR (sem isso o teste pode estar verde por motivo errado)
3. Corrigir código
4. Rodar teste e VER PASSAR
5. Commit único `test+fix: #NN <descrição>`

O QA Crítico deve verificar no `git log` que cada commit `test+fix:` contém TANTO o arquivo `*.test.ts(x)` QUANTO o arquivo de produção alterado.

### LLM eval tests — gate e determinismo

Itens dependentes de comportamento do LLM (#04, #08, #15, #17 parcial): rodam via `LLM_TESTS=1 npm run test` (env-gated). Em CI default ficam **skipped** com `describe.skipIf(!process.env.LLM_TESTS)`. Convenção:

- `temperature: 0` no `generateText`/`streamText` da call de teste
- N=3 amostras por assertion (3 chamadas independentes ao Claude)
- Threshold de PASS: **≥ 2/3** amostras atendem o critério
- Logar todas 3 amostras em failure pra diagnóstico
- Modelo: o mesmo configurado em `src/lib/agent/system-prompt.ts` (não fixar versão diferente)

QA Crítico roda `LLM_TESTS=1 npm run test` pelo menos uma vez durante validação. Falha de 1/3 amostras (i.e., 2/3 PASS) ainda conta como PASS — registrar no relatório qual amostra falhou.

### DOM tests setup

Etapa 0 do plano técnico já instala `happy-dom` e troca `vitest.config.ts` pra `environment: "happy-dom"`. Component tests usam:

- `render(<Component />)` via `@testing-library/react` (a ser adicionado se não existir) OU
- Fallback: `renderToString` do `react-dom/server` + `parse5`/regex se Testing Library não couber

Convenção pra DOM tests: assertion via `data-testid` quando elemento é crítico (botão "Tenho interesse", campos do card de simulação, chips de categoria). Texto literal em assertions OK, mas preferir `aria-label` + role-based queries quando possível.

### Anti-regressão geral (TODOS os itens)

Os seguintes test files do baseline (12 hoje) **NÃO podem quebrar** após nenhuma alteração:

- `src/lib/eval/judge.test.ts`
- `src/lib/eval/rubric.test.ts`
- `src/lib/eval/scorer.test.ts`
- `src/lib/eval/scorer-pipeline.test.ts`
- `src/lib/eval/scorer.integration.test.ts`
- `src/lib/eval/signals.test.ts`
- `src/lib/eval/transcript.test.ts`
- `src/lib/eval/eligibility.test.ts`
- `src/lib/eval/types.test.ts`
- `src/lib/agent/example-selector.test.ts`
- `src/lib/diagnose/diagnose.test.ts`
- `src/lib/validations/persona-example.test.ts`

Toda PR/iteração roda `npm run test` total ao final. Itens individuais ainda citam quais desses são MAIS relevantes pra atenção.

### Sign-off rules

Item só recebe PASS quando:
- Todos cenários GIVEN/WHEN/THEN passam
- Cenários negativos não acontecem (verificados explicitamente)
- Anti-regressão verde
- Code review confirma fix corresponde à métrica (não só "teste verde por sorte")

---

## Item #01 — Adicionar categoria "moto" (substitui Serviços na landing)

**Tipo:** unit + component
**Severidade:** alta
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/categories.test.ts` (novo)
- `src/lib/agent/personas.test.ts` (novo, se ainda não existir)
- `src/components/landing/hero-section.test.tsx` (novo)
- `src/lib/adapters/mock/groups.test.ts` (novo) — valida que `groups.json` tem ≥5 grupos categoria `moto`

### Cenários de aceite

#### Golden path
- **GIVEN** a aplicação inicializada
- **WHEN** importa `Category` de `src/lib/agent/personas.ts`
- **THEN** o type literal aceita os valores `"imovel" | "auto" | "moto" | "servicos"`
- **Métrica:** tsc compila sem erro um arquivo de teste que declara `const c: Category = "moto"`. Adicionalmente, `CATEGORIES` config tem entrada com chave `moto` contendo `label`, `icon`, `defaultCreditRange`.

#### Edge case 1 — adapter retorna grupos moto
- **GIVEN** mock adapter inicializado com `groups.json` atualizado
- **WHEN** chama `adapter.searchGroups({ category: "moto", creditRange: [15000, 40000] })`
- **THEN** retorna **≥ 3** grupos com `category === "moto"` e `creditValue` dentro do range
- **Métrica:** `result.length >= 3 && result.every(g => g.category === "moto")`

#### Edge case 2 — DB constraint aceita moto
- **GIVEN** schema Drizzle atualizado e migration aplicada
- **WHEN** insert persona com `category: "moto"`
- **THEN** insert sucesso, sem violation
- **Métrica:** test unitário do schema valida que `check constraint` da coluna `category` em `personas` lista os 4 valores. (Se não tiver DB em CI, mockar Drizzle e assertar que o schema definido em `src/db/schema.ts` referencia os 4 literais.)

### Cenários negativos (NÃO PODE acontecer)
- Categoria "servicos" deletada do enum/literal (deve continuar válida, só `isActive=false`)
- Categoria "moto" sem persona associada no DB seed
- `groups.json` ter grupos com `category: "moto"` fora da faixa típica (>R$ 100k ou <R$ 5k)
- Ícone moto importado de pacote diferente de `lucide-react` (consistência com restante)

### Anti-regressão (tests existentes que NÃO podem quebrar)
- `src/lib/agent/example-selector.test.ts` — selector continua resolvendo personas existentes
- `src/lib/validations/persona-example.test.ts` — validação aceita as 4 categorias

---

## Item #02 — Tirar "Serviços" do landing (chip removido)

**Tipo:** component
**Severidade:** média
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/components/landing/hero-section.test.tsx` (mesmo arquivo do #01)

### Cenários de aceite

#### Golden path
- **GIVEN** componente `HeroSection` renderizado
- **WHEN** consultar o DOM dos chips/CTAs principais
- **THEN** existem exatamente 3 chips: "Imóvel", "Carro", "Moto"
- **Métrica:** `screen.getAllByRole("button", { name: /imóvel|carro|moto/i }).length === 3` E `screen.queryByRole("button", { name: /serviços/i }) === null`

#### Edge case 1 — labels case-insensitive
- **GIVEN** HeroSection renderizado
- **WHEN** procurar texto "Serviços", "serviços", "SERVIÇOS", "Servicos"
- **THEN** nenhum match
- **Métrica:** `screen.queryByText(/serv[ií]cos?/i) === null`

### Cenários negativos (NÃO PODE acontecer)
- Chip "Serviços" reaparecer em mobile (testar com `userAgent` mobile se houver render condicional)
- Chip "Serviços" virar `<a>` desabilitado em vez de removido (DOM ainda contém o texto)
- Persona `servicos` deletada do DB (deve estar só `isActive=false` — verificável via seed test)

### Anti-regressão
- Nenhum teste existente toca `hero-section.tsx` hoje — primeiro test do componente.

---

## Item #03 — "Como funciona": foco em benefícios do consórcio (sem juros, parcela menor, contemplação por lance), não em IA

**Tipo:** component
**Severidade:** média
**Risco regulatório:** sim — overclaim "100% IA" / "agente inteligente que vai te assessorar" pode ser publicidade enganosa se a expectativa criada não bater com a entrega real (CDC art. 37). Removendo, mitigamos.
**Arquivos de teste sugeridos:**
- `src/components/landing/how-it-works.test.tsx` (novo)

### Cenários de aceite

#### Golden path
- **GIVEN** `HowItWorks` renderizado
- **WHEN** ler todo texto visível
- **THEN** contém **todas** as palavras-chave de benefício: "sem juros", "parcela menor" (ou variação "parcela mais baixa"), "lance", "contemplação"
- **Métrica:** `expect(text).toMatch(/sem juros/i)` && `expect(text).toMatch(/parcela (menor|mais baixa)/i)` && `expect(text).toMatch(/lance/i)` && `expect(text).toMatch(/contempla(ção|cao)/i)`

#### Edge case 1 — ausência de jargão IA
- **GIVEN** mesmo render
- **WHEN** ler texto visível
- **THEN** NÃO contém: "100% IA", "agente inteligente", "powered by AI", "inteligência artificial"
- **Métrica:** `expect(text).not.toMatch(/100% ia|agente inteligente|powered by ai|intelig[êe]ncia artificial/i)`

### Cenários negativos (NÃO PODE acontecer)
- Substituir "100% IA" por "automação inteligente" ou sinônimo equivalente (manter intenção é regressão)
- Steps perderem ordem lógica (contemplação antes de simulação, etc)
- Texto ficar genérico sem mencionar consórcio (palavra "consórcio" deve aparecer ≥ 1)

### Anti-regressão
- Nenhum test existente. Coordenar com #19 (mesmo componente).

---

## Item #04 — Helena (specialist imóvel) 1ª fala mais calorosa, com entusiasmo

**Tipo:** eval (LLM, env-gated)
**Severidade:** média
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/system-prompt.test.ts` (novo) — descreve `describe.skipIf(!process.env.LLM_TESTS)`

### Cenários de aceite

#### Golden path
- **GIVEN** sistema iniciado, usuário acabou de escolher categoria "Imóvel" na home (sem mensagem prévia)
- **WHEN** gerar 3 transcripts independentes da 1ª fala da Helena (temp 0, prompt determinístico)
- **THEN** ≥ 2/3 amostras contêm pelo menos UMA palavra do conjunto: `/legal|show|ótimo|otimo|animad[oa]|bora|que (bom|legal|ótimo)|adoro|amei|que (massa|bacana)/i` E judge.dimensions.naturalidade ≥ 0.85 (usando rubric existente em `src/lib/eval/rubric.ts`)
- **Métrica:** `samplesPassingRegex >= 2 && samplesPassingNaturalidade >= 2`

#### Edge case 1 — tom não é exagerado/forçado
- **GIVEN** mesmo setup
- **WHEN** judge avalia "autenticidade do tom" (rubric existente ou nova dimensão)
- **THEN** judge não classifica como "forced enthusiasm" / "fake friendly"
- **Métrica:** dimensão `naturalidade` (ou similar) ≥ 0.7 em todas 3 amostras

### Cenários negativos (NÃO PODE acontecer)
- Primeira fala começa com "Olá! Sou a Helena, sua assistente..." (formal/robótico) — vetar regex `/sou (a|o) [a-z]+, su[ao] (assistente|consultor)/i`
- Primeira fala usar 2+ emojis (over-the-top)
- Tom calorosa quebrar coerência de specialist em imóvel (deve mencionar imóvel/casa/apartamento dentro das primeiras 2 frases)

### Anti-regressão
- `src/lib/eval/judge.test.ts` — judge continua produzindo schema válido
- `src/lib/agent/example-selector.test.ts` — example selector continua resolvendo persona `imovel`

---

## Item #05 — "Entender mais antes" mostra tópicos clicáveis (chips de dúvidas) + botão "← Voltar"

**Tipo:** integration + component
**Severidade:** alta
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/tools/ai-sdk.test.ts` (novo) — tool `present_topic_picker` schema válido
- `src/components/chat/artifacts/topic-picker.test.tsx` (novo) — render dos chips + botão voltar

### Cenários de aceite

#### Golden path
- **GIVEN** usuário escolheu categoria, está no fluxo de qualificação e clicou "Entender mais antes"
- **WHEN** agente chama tool `present_topic_picker`
- **THEN** artifact renderizado contém 3-5 chips clicáveis com tópicos pré-definidos (ex: "Como funciona o lance?", "E se eu não for contemplado?", "Posso desistir?") + 1 botão "← Voltar"
- **Métrica:** `chips.length >= 3 && chips.length <= 5 && backButton !== null && backButton.textContent.match(/voltar/i)`

#### Edge case 1 — clique em chip dispara intent
- **GIVEN** topic picker renderizado
- **WHEN** usuário clica em chip "Como funciona o lance?"
- **THEN** mensagem enviada ao agente é igual ao label do chip (não um id opaco)
- **Métrica:** `onSelect` recebe string igual ao label do chip

#### Edge case 2 — botão voltar restaura estado anterior
- **GIVEN** topic picker renderizado após qualificação
- **WHEN** usuário clica "← Voltar"
- **THEN** estado do orchestrator volta pra qualificação (depende de #06)
- **Métrica:** integração com #06 — após click, próximo render do chat mostra última pergunta de qualificação

### Cenários negativos (NÃO PODE acontecer)
- Topic picker sem botão voltar
- Chips serem campos abertos (input) em vez de botões
- Chips repetidos
- Mais de 5 chips (overload cognitivo)

### Anti-regressão
- `src/lib/agent/example-selector.test.ts`
- Tools existentes em `src/lib/agent/tools/ai-sdk.ts` continuam funcionando (qualquer regressão de schema quebra todas)

---

## Item #06 — Comando "voltar" (texto OU botão) restaura estado anterior do orchestrator

**Tipo:** unit + integration
**Severidade:** alta
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/orchestrator/transition.test.ts` (novo) — stack push/pop
- `src/lib/agent/turn-analyzer.test.ts` (novo) — detecta intent "voltar"

### Cenários de aceite

#### Golden path
- **GIVEN** metadata inicial `{ navigationStack: [] }` e usuário avança por 3 estados (A → B → C)
- **WHEN** chamar `orchestrator.transition({ intent: "back" })`
- **THEN** estado corrente vira B, stack vira `[A]`
- **Métrica:** após pop, `currentState === "B" && navigationStack.length === 1 && navigationStack[0] === "A"`

#### Edge case 1 — texto "voltar" reconhecido
- **GIVEN** turn analyzer recebe mensagem do usuário
- **WHEN** mensagens testadas: `"voltar"`, `"Voltar"`, `"volta"`, `"Volta pro menu"`, `"voltar pro menu"`, `"vlt"` (gíria — opcional)
- **THEN** intent `"back"` é detectado para todas exceto a opcional
- **Métrica:** `analyzer.detect("voltar").intent === "back"` para cada caso; regex sugerido: `/^vol(t|ta|tar|tar pro menu)\b/i`

#### Edge case 2 — voltar do estado inicial
- **GIVEN** `navigationStack: []` e usuário no estado inicial
- **WHEN** intent "back"
- **THEN** orchestrator NÃO crasha; comportamento esperado: no-op com mensagem "Você já está no início" OU permanece no estado atual (decidir e cravar)
- **Métrica:** `transition({ intent: "back" })` não lança exceção; resposta documentada

### Cenários negativos (NÃO PODE acontecer)
- Stack crescer indefinidamente sem teto (vetar — cap em 20 estados, depois descarta o mais antigo)
- "Voltar" detectar match em frases tipo "vou voltar amanhã" (falso positivo) — regex precisa ser ancorada `^vol...`
- Pop deixar metadata inconsistente (ex: persona ativa não bater com estado)
- Botão "← Voltar" do #05 chamar API diferente da do texto "voltar" (deve ser o mesmo path)

### Anti-regressão
- `src/lib/eval/scorer.test.ts` — não toca orchestrator mas qualquer mudança em metadata pode propagar
- `src/lib/agent/example-selector.test.ts` — examples não dependem de navigation stack, mas confirmar

---

## Item #07 — Remover anglicismos do copy ao usuário (ex: "range" → "faixa")

**Tipo:** unit (regex sobre prompt e tools strings)
**Severidade:** baixa
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/system-prompt.test.ts` (mesmo arquivo do #04 mas seção determinística, sem `skipIf`)

### Cenários de aceite

#### Golden path
- **GIVEN** import do `SYSTEM_PROMPT` e `SHARED_SPECIALIST_EXAMPLES` de `src/lib/agent/system-prompt.ts`
- **WHEN** grep por palavras inglesas em strings consumidas pelo usuário
- **THEN** zero matches para: `\brange\b`, `\bnice\b`, `\bcool\b`, `\bok\b` (cuidado: "OK" em frase tipo "Ok!" pode ser aceitável — definir regra), `\bfeedback\b`, `\binsight\b`
- **Métrica:** `expect(SYSTEM_PROMPT).not.toMatch(/\brange\b/i)` + cada outra palavra. Lista de palavras vetadas: `["range", "nice", "cool", "feedback", "insight", "tip", "hack"]`. Whitelist: termos técnicos sem tradução comum (ex: "consórcio" é OK).

#### Edge case 1 — substituições corretas
- **GIVEN** "range" foi substituído
- **WHEN** grep por "faixa" no mesmo arquivo
- **THEN** "faixa" aparece pelo menos 1 vez (confirma substituição, não só remoção)
- **Métrica:** `expect(SYSTEM_PROMPT).toMatch(/faixa/i)`

### Cenários negativos (NÃO PODE acontecer)
- Anglicismo aparecer em descrição de tool que o LLM apresenta ao usuário (verificar `description` field dos `tool({ description })`)
- Substituir por outro anglicismo (ex: "range" → "scope")
- Quebrar exemplos few-shot ao deletar contexto demais (sample um example pós-fix e verificar coerência)

### Anti-regressão
- `src/lib/agent/example-selector.test.ts` — selector usa examples, não pode quebrar parsing
- `src/lib/validations/persona-example.test.ts`

---

## Item #08 — Substituir "parcela cabe bem no seu orçamento" (subjetivo) por linguagem factual ("R$ 5.715 = 95% do seu teto mensal R$ 6.000")

**Tipo:** eval (LLM, env-gated) + unit (regex no prompt)
**Severidade:** **crítica**
**Risco regulatório:** **SIM — alto.** Frase subjetiva "cabe no seu orçamento" pode caracterizar:
- **CDC art. 39 IV** — prevalecer-se da fraqueza/ignorância do consumidor pra impingir produto ("cabe" induz contratação)
- **Susep / Banco Central** — IF não pode avaliar capacidade de pagamento do cliente sem dados completos (estamos fora de regulação direta de IF mas mimetizamos)
- **CMN res. 4.927/2021** (consórcios) — informação ao consorciado tem que ser "clara, precisa e adequada", não opinativa
- **CDC art. 37 §1º** — publicidade enganosa por omissão (sugerir adequação sem fundamento financeiro completo)
Mitigação: substituir por fato verificável (% do teto declarado pelo próprio usuário, valor absoluto). Não é assessoria, é matemática sobre input dele.

**Arquivos de teste sugeridos:**
- `src/lib/agent/system-prompt.test.ts` (seção determinística + seção LLM env-gated)

### Cenários de aceite

#### Golden path — unit determinístico
- **GIVEN** import do `SYSTEM_PROMPT`
- **WHEN** grep por frases subjetivas
- **THEN** zero matches: `/cabe (bem )?no seu (orçamento|orcamento|bolso)/i`, `/dentro do seu orçamento/i`, `/adequad[oa] (ao|pro) seu (orçamento|perfil)/i`
- **Métrica:** lista de regexes vetadas, todas com 0 matches. Lista positiva: prompt DEVE conter template tipo `"R$ {parcela} = {percentual}% do seu teto"` ou similar (verificável via match `/{percentual}|{percent}|%/`)

#### Golden path — LLM eval (env-gated)
- **GIVEN** transcript onde recomendação é feita pra usuário com teto R$ 6.000 e parcela R$ 5.715
- **WHEN** gerar 3 amostras da fala de fechamento
- **THEN** ≥ 2/3 amostras contêm porcentagem OU valor absoluto comparativo (não só "cabe no seu orçamento")
- **Métrica:** ≥ 2/3 amostras match `/\d{1,3}\s?%|R\$\s?\d/` E zero amostras match regex vetadas acima

#### Edge case 1 — alta % do teto (acima 80%)
- **GIVEN** parcela R$ 5.715, teto R$ 6.000 (95%)
- **WHEN** agente apresenta
- **THEN** agente comunica explicitamente que é proporção alta ("isso representa 95% do seu teto declarado, vale ter folga pra imprevistos") OU pelo menos não usa adjetivo positivo ("ótima parcela", "cabe bem")
- **Métrica:** judge avalia dimensão `factualidade` ≥ 0.85; ausência de adjetivos vetados regex `/[óo]tim[ao]|excelente|perfeit[ao]|cabe bem/i`

#### Edge case 2 — baixa % do teto (abaixo 50%)
- **GIVEN** parcela R$ 2.500, teto R$ 6.000 (42%)
- **WHEN** agente apresenta
- **THEN** ainda factual: mostra a porcentagem; pode comentar "te dá folga" mas com base no número, não como opinião isolada
- **Métrica:** match `/\d{1,2}\s?%|R\$\s?\d{2,3}/` E não match `/cabe (bem|tranquilo)/i`

### Cenários negativos (NÃO PODE acontecer)
- Substituir por outra frase subjetiva ("parcela tranquila", "valor confortável", "ótima opção")
- Apresentar % sem base numérica do teto ("é só 95%" sem dizer 95% de quê)
- Arredondar parcela ou teto sem indicar (mostra "R$ 5.700" em vez do valor real R$ 5.715)
- Omitir o cálculo quando perguntado ("como você chegou nesse %?")

### Anti-regressão
- `src/lib/eval/judge.test.ts`
- `src/lib/eval/rubric.test.ts` — rubric pode precisar de nova dimensão `factualidade`; verificar não quebra existentes
- `src/lib/eval/scorer-pipeline.test.ts`

---

## Item #09 — `recommend_groups` sempre retorna ≥3 opções

**Tipo:** unit
**Severidade:** alta
**Risco regulatório:** sim (médio) — apresentar 1 ou 2 opções pode ser "venda casada" / oferta dirigida sem escolha real. Consórcio precisa permitir escolha.
**Arquivos de teste sugeridos:**
- `src/lib/agent/recommendation.test.ts` (novo)

### Cenários de aceite

#### Golden path
- **GIVEN** filtros estritos que naturalmente retornariam 5 grupos
- **WHEN** chamar `recommendGroups({ category, creditRange, monthlyBudget })`
- **THEN** retorna 5 grupos, todos sem flag `alternativa: true`
- **Métrica:** `result.length >= 3 && result.filter(g => g.alternativa).length === 0`

#### Edge case 1 — fallback expansão ±20%
- **GIVEN** filtros que naturalmente retornariam só 2 grupos
- **WHEN** chamar `recommendGroups(...)`
- **THEN** retorna ≥ 3 grupos; os 2 originais com `alternativa: false`, os adicionais com `alternativa: true` (valor expandido em até 20%)
- **Métrica:** `result.length >= 3 && result.filter(g => g.alternativa).length >= 1 && expandedGroups.every(g => Math.abs(g.creditValue - targetCredit) / targetCredit <= 0.2)`

#### Edge case 2 — fallback insuficiente (catálogo pobre)
- **GIVEN** filtros onde mesmo ±20% só dá 2 grupos
- **WHEN** chamar `recommendGroups(...)`
- **THEN** comportamento documentado: ou expande mais até ±50% (com flag) OU retorna o que tem + sinal `insufficientOptions: true` pro agente comunicar
- **Métrica:** cravar decisão — sugestão PO: expandir até ±50%; se ainda insuficiente, retornar n < 3 com flag explícita pra agente avisar usuário

### Cenários negativos (NÃO PODE acontecer)
- Retornar 2 grupos sem flag ou aviso
- Expandir faixa silenciosamente sem marcar `alternativa: true`
- Expandir além de ±50% sem cravar e documentar
- Duplicar grupos pra atingir 3 (mesmo id repetido)
- Ordenar de forma que originais venham depois dos alternativos (originais sempre primeiro)

### Anti-regressão
- `src/lib/eval/scorer.test.ts` — recomendação alimenta scorer downstream
- `src/lib/eval/scorer-pipeline.test.ts`

---

## Item #10 — Card de simulação exibe TODOS estes campos

Campos obrigatórios: valor da carta, prazo, parcela, taxa adm, fundo de reserva, cenário com lance, correção prevista (INCC pra imóvel, IPCA pra auto/moto).

**Tipo:** component + unit
**Severidade:** alta
**Risco regulatório:** sim — CMN res. 4.927/2021 exige informação completa sobre composição da parcela e custos. Omitir taxa adm ou fundo de reserva pode caracterizar publicidade enganosa por omissão.
**Arquivos de teste sugeridos:**
- `src/components/chat/artifacts/simulation-result.test.tsx` (novo)
- `src/lib/adapters/mock/mock-bevi-adapter.test.ts` (mesmo arquivo do #11) — schema da `QuotaSimulation` tem novos campos

### Cenários de aceite

#### Golden path
- **GIVEN** `QuotaSimulation` válida com todos 7 campos populados e `SimulationResult` renderizado
- **WHEN** consultar DOM
- **THEN** todos os 7 valores estão visíveis com label semântico:
  1. Valor da carta (`/carta|cr[ée]dito/i`)
  2. Prazo (`/prazo|meses/i`)
  3. Parcela (`/parcela|mensal/i`)
  4. Taxa adm (`/taxa adm|administra[çc][ãa]o/i`)
  5. Fundo de reserva (`/fundo de reserva/i`)
  6. Cenário com lance (`/lance|contempla(ção|cao)/i`)
  7. Correção prevista (`/corre[çc][ãa]o|INCC|IPCA/i`)
- **Métrica:** 7 assertions `screen.getByText(regex)` todas passam. Adicionalmente: cada campo tem valor numérico/textual NÃO vazio (não pode ser "—" ou "N/A" como default).

#### Edge case 1 — categoria imóvel usa INCC
- **GIVEN** simulação com `category: "imovel"`
- **WHEN** render
- **THEN** correção mostrada é INCC (label e nome do índice)
- **Métrica:** `screen.getByText(/INCC/i)` existe; `screen.queryByText(/IPCA/i)` é null

#### Edge case 2 — categoria auto/moto usa IPCA
- **GIVEN** simulação com `category: "auto"` (e "moto")
- **WHEN** render
- **THEN** correção é IPCA
- **Métrica:** `screen.getByText(/IPCA/i)` existe; `screen.queryByText(/INCC/i)` é null

### Cenários negativos (NÃO PODE acontecer)
- Algum campo dos 7 ausente no DOM
- Campo presente mas valor placeholder ("N/A", "—", "0", "—")
- "Taxa adm" e "fundo de reserva" agrupados num só campo "encargos" (Bruna pediu explícitos)
- Cenário com lance ser número fixo sem indicar % de lance considerado
- Correção mostrada como % sem indicar índice (só "+5%/ano" sem "INCC")

### Anti-regressão
- `src/lib/eval/scorer.test.ts`
- Nenhum component test existente — primeiro do `simulation-result.tsx`

---

## Item #11 — Bug crítico: parcela retornada por `searchGroups` deve ser idêntica (±R$1) à parcela de `simulateQuota` pro mesmo grupo+crédito

**Tipo:** unit
**Severidade:** **crítica**
**Risco regulatório:** sim — divergência entre o preço anunciado (comparativo) e o preço cotado (simulação) = publicidade enganosa pura (CDC art. 30, 35, 37). Cliente pode exigir o menor.
**Arquivos de teste sugeridos:**
- `src/lib/adapters/mock/mock-bevi-adapter.test.ts` (novo)
- `src/lib/adapters/mock/compute-quota.test.ts` (novo, se função pura for extraída)

### Cenários de aceite

#### Golden path
- **GIVEN** mock adapter com `groups.json` populado; grupo Rodobens imóvel R$ 900k existe
- **WHEN** chamar `searchGroups({ category: "imovel", creditRange: [800000, 1000000] })` e depois `simulateQuota({ groupId: <id>, creditValue: 900000 })` pro mesmo grupo
- **THEN** `searchGroupResult.monthlyPayment === simulateQuotaResult.monthlyPayment` (diferença absoluta ≤ R$ 1,00)
- **Métrica:** `Math.abs(searchResult.monthlyPayment - simResult.monthlyPayment) <= 1`

#### Edge case 1 — todos os grupos do catálogo
- **GIVEN** todos grupos em `groups.json`
- **WHEN** para cada grupo, comparar `searchGroups` (filtro pelo creditValue do grupo) com `simulateQuota` do mesmo crédito
- **THEN** todos os pares passam o teste de ±R$ 1
- **Métrica:** `groups.every(g => Math.abs(searchPmtFor(g) - simPmtFor(g)) <= 1)`

#### Edge case 2 — categoria auto e moto (extrapola fix além de imóvel)
- **GIVEN** grupo auto R$ 80k e grupo moto R$ 30k
- **WHEN** mesmo teste
- **THEN** mesma consistência ±R$ 1
- **Métrica:** análoga, replicada por categoria

### Cenários negativos (NÃO PODE acontecer)
- Tolerância maior que R$ 1 (justificar arredondamento explicitamente se necessário, mas ideal é mesma função pura `computeQuota()` chamada nos dois lugares)
- `monthlyPayment` lido de `groups.json` em vez de computado (cravar: deletar campo do JSON ou ignorar)
- Diferença vir de cálculo de `fundoReserva` ou `taxaAdm` divergente entre paths
- Mock retornar valores aleatórios (deve ser determinístico)

### Anti-regressão
- `src/lib/eval/scorer.test.ts` — scorer recebe `monthlyPayment` do recommendation
- `src/lib/eval/scorer-pipeline.test.ts`
- `src/lib/eval/scorer.integration.test.ts`

---

## Item #12 — Fechamento da simulação tem CTAs explícitos clicáveis

CTAs: "Ajustar valor", "Nova simulação", "Comparar outra adm" (além do "Tenho interesse").

**Tipo:** component
**Severidade:** média
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/components/chat/artifacts/simulation-result.test.tsx` (mesmo arquivo #10)

### Cenários de aceite

#### Golden path
- **GIVEN** `SimulationResult` renderizado com simulação completa
- **WHEN** consultar botões no DOM
- **THEN** existem 4 botões clicáveis: "Tenho interesse" (existente), "Ajustar valor", "Nova simulação", "Comparar outra adm"
- **Métrica:** `screen.getAllByRole("button").length >= 4` E cada label aparece via `getByRole("button", { name: regex })`

#### Edge case 1 — click dispara intent correto
- **GIVEN** mesma render
- **WHEN** click em cada um dos 3 CTAs novos
- **THEN** callback recebe intent semanticamente apropriado: `adjust_credit_value`, `new_simulation`, `compare_other_admin`
- **Métrica:** `onAction` chamado com o intent string esperado

#### Edge case 2 — disabled state
- **GIVEN** simulação sem `groupId` válido (estado quebrado)
- **WHEN** render
- **THEN** botões dependentes ficam desabilitados ou ausentes (não crashar)
- **Métrica:** `button.disabled === true` ou ausência do botão; sem exceção no render

### Cenários negativos (NÃO PODE acontecer)
- CTAs como links de texto em vez de buttons (afordância baixa)
- CTAs em menu dropdown / overflow (devem ser visíveis sem clique adicional)
- "Tenho interesse" sumir após adicionar os outros 3

### Anti-regressão
- Mesmo arquivo do #10 + #13 (cobertura conjunta)

---

## Item #13 — Botão "Tenho interesse" com afordância elevada (sticky bottom OU variant destaque + sombra)

**Tipo:** component
**Severidade:** média
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/components/chat/artifacts/simulation-result.test.tsx`

### Cenários de aceite

#### Golden path
- **GIVEN** `SimulationResult` renderizado
- **WHEN** inspecionar atributos/classes do botão "Tenho interesse"
- **THEN** o botão tem pelo menos UMA dessas afordâncias visuais elevadas:
  - Classe contendo `sticky` E `bottom`
  - OU variant `destaque`/`primary`/`hero` + classe de shadow (`shadow-`)
  - OU `data-testid="cta-primary"` + estilo `position: fixed` ou similar
- **Métrica:** `button.className.match(/sticky.*bottom|bottom.*sticky/) || button.className.match(/shadow-(md|lg|xl|2xl)/) && button.className.match(/(primary|hero|destaque)/)`

#### Edge case 1 — mobile touch target
- **GIVEN** mesmo render
- **WHEN** medir altura do botão
- **THEN** altura ≥ 44px (WCAG / Apple HIG / Material — touch target mínimo)
- **Métrica:** `button.className.match(/min-h-\[44px\]|h-(11|12|14)/) || computedStyle.height >= 44px`

### Cenários negativos (NÃO PODE acontecer)
- Sticky bottom cobrir conteúdo essencial (ex: ficar por cima do 7º campo da simulação) — verificar visual ou z-index sane
- Botão ficar inacessível por contraste insuficiente (validação manual; QA Crítico checa)
- Outros 3 CTAs do #12 também virarem sticky (só "Tenho interesse" tem destaque)

### Anti-regressão
- Mesmo arquivo

---

## Item #14 — Remover palavra "card" do copy ao usuário

(mensagens do agente, descrições de tools visíveis)

**Tipo:** unit (regex)
**Severidade:** baixa
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/agent/system-prompt.test.ts` (estende #07)
- `src/lib/agent/tools/ai-sdk.test.ts` (verifica `description` strings)

### Cenários de aceite

#### Golden path
- **GIVEN** import do `SYSTEM_PROMPT`, `SHARED_SPECIALIST_EXAMPLES` e schemas de tools com `description` user-facing
- **WHEN** grep `/\bcards?\b/i` em todas strings consumidas pelo usuário
- **THEN** zero matches em strings user-facing
- **Métrica:** lista de strings testadas explícita; cada uma `.not.toMatch(/\bcards?\b/i)`. Substituições aceitas: "opção", "proposta", "alternativa", "resumo".

#### Edge case 1 — comentário de código não conta
- **GIVEN** arquivo `tools/ai-sdk.ts` pode conter `// renders card UI`
- **WHEN** grep
- **THEN** apenas STRINGS em runtime (não comentários TS) são alvo
- **Métrica:** assertion específica em variáveis exportadas, não em conteúdo bruto do arquivo

### Cenários negativos (NÃO PODE acontecer)
- "Card" sumir do prompt mas reaparecer em descrição de tool nova (#05, #16, #17)
- Substituição quebrar gramática ("apresentando o opção" sem ajustar artigo)
- Aparecer em UI labels (botões, headings)

### Anti-regressão
- Mesmos do #07

---

## Item #15 — Quando `experiencePrev='first'` (1ª vez do usuário), agente entrega explicação básica inline

Conteúdo obrigatório: sem juros, grupo de pessoas, sorteio, lance, contemplação, assembleia.

**Tipo:** eval (LLM, env-gated)
**Severidade:** alta
**Risco regulatório:** sim — CMN res. 4.927/2021 e instruções Banco Central exigem que consorciado tenha clareza sobre o funcionamento ANTES de contratar. Omitir educação a usuário declaradamente novato é risco de venda inadequada.
**Arquivos de teste sugeridos:**
- `src/lib/agent/system-prompt.test.ts` (seção LLM env-gated)

### Cenários de aceite

#### Golden path
- **GIVEN** usuário em qualificação que respondeu `experiencePrev: "first"` (1ª vez)
- **WHEN** gerar 3 amostras da próxima fala do agente (temp 0)
- **THEN** ≥ 2/3 amostras contêm **pelo menos 3** dos seguintes termos-chave: `/sem juros/i`, `/grupo de pessoas/i`, `/sorteio/i`, `/lance/i`, `/contempla(ção|cao)/i`, `/assembleia/i`
- **Métrica:** `samplesWithAtLeast3Terms >= 2`

#### Edge case 1 — usuário experiente NÃO recebe explicação
- **GIVEN** usuário com `experiencePrev: "experienced"`
- **WHEN** gerar 3 amostras
- **THEN** agente NÃO insere explicação básica (não infantiliza)
- **Métrica:** ≤ 1/3 amostras contêm 3+ termos da lista acima

#### Edge case 2 — não vira "muro de texto"
- **GIVEN** primeira fala pós `experiencePrev=first`
- **WHEN** medir tamanho da resposta
- **THEN** comprimento entre 80 e 400 palavras (digestível, não exaustivo)
- **Métrica:** `wordCount >= 80 && wordCount <= 400` em ≥ 2/3 amostras

### Cenários negativos (NÃO PODE acontecer)
- Explicação enviada pra TODOS usuários (independente de experiencePrev)
- Explicação só citar 1-2 termos da lista (não cobre o básico)
- Explicação em formato lista bullet seca sem contexto conversacional
- Conteúdo da explicação ser cópia literal do landing `how-it-works.tsx` (deve ser conversacional, mesmo se reaproveitar fonte de verdade)

### Anti-regressão
- `src/lib/agent/example-selector.test.ts` — example selector deve continuar resolvendo persona conforme experiencePrev
- `src/lib/eval/judge.test.ts`

---

## Item #16 — Tool nova `present_scenarios`: 3 cards (Conservador / Provável / Acelerado)

- Conservador: 0% lance
- Provável: 20% do crédito como lance
- Acelerado: 30% do crédito + recursos próprios

Cada card com prazo esperado de contemplação.

**Tipo:** integration + component
**Severidade:** alta
**Risco regulatório:** sim — "prazo esperado de contemplação" é projeção. Tem que estar marcado como estimativa, não garantia (CMN/CDC).
**Arquivos de teste sugeridos:**
- `src/lib/agent/tools/ai-sdk.test.ts` (schema da tool)
- `src/lib/adapters/mock/mock-bevi-adapter.test.ts` (método `simulateContemplationScenarios`)
- `src/components/chat/artifacts/scenarios.test.tsx` (novo)

### Cenários de aceite

#### Golden path — adapter
- **GIVEN** grupo válido e creditValue R$ 900k
- **WHEN** chamar `adapter.simulateContemplationScenarios({ groupId, creditValue: 900000 })`
- **THEN** retorna objeto `{ conservador, provavel, acelerado }`, cada um com `{ lancePercent, lanceValue, ownResourcesValue, expectedContemplationMonths }`
- **Métrica:** `conservador.lancePercent === 0 && provavel.lancePercent === 0.2 && acelerado.lancePercent === 0.3 && acelerado.ownResourcesValue > 0`

#### Golden path — component
- **GIVEN** dados acima passados pro componente `Scenarios`
- **WHEN** render
- **THEN** 3 cards no DOM com labels "Conservador", "Provável", "Acelerado" e prazo em meses visível em cada
- **Métrica:** `screen.getByText(/conservador/i)`, `getByText(/prov[áa]vel/i)`, `getByText(/acelerado/i)`; cada um próximo de texto matching `/\d+\s?meses/i`

#### Edge case 1 — prazos coerentes
- **GIVEN** mesma simulação
- **WHEN** comparar prazos
- **THEN** `conservador.expectedContemplationMonths > provavel.expectedContemplationMonths > acelerado.expectedContemplationMonths` (ordem: mais lance = mais rápido)
- **Métrica:** assertion de ordenação estrita

#### Edge case 2 — disclaimer de estimativa
- **GIVEN** scenarios renderizado
- **WHEN** consultar texto
- **THEN** existe disclaimer tipo "estimativa baseada em histórico", "não é garantia"
- **Métrica:** `screen.getByText(/estimativ[ao]|n[ãa]o (é )?garantia|hist[óo]rico/i)` presente

### Cenários negativos (NÃO PODE acontecer)
- Prazos iguais entre cenários (não diferenciam nada)
- "Acelerado" prometer contemplação em mês específico sem disclaimer ("você será contemplado no mês 8")
- Recursos próprios do Acelerado serem zero ou negativos
- Falta de qualquer um dos 3 cenários (todos sempre presentes)

### Anti-regressão
- `src/lib/eval/scorer.test.ts`
- `src/lib/eval/scorer.integration.test.ts`

---

## Item #17 — Tool nova `compare_with_financing` + remover diretiva do system-prompt

Compara parcela consórcio vs PMT financiamento (Price formula). Taxas anuais hardcoded: imóvel 10%, auto 22%, moto 28%. Agente DEIXA de recusar essa pergunta.

**Tipo:** unit + eval (LLM, env-gated)
**Severidade:** alta
**Risco regulatório:** **SIM — médio/alto.** Comparar produtos financeiros é território minado:
- CDC art. 37 — publicidade comparativa permitida se objetiva, verdadeira e não enganosa
- BACEN — não somos IF mas anunciar "consórcio mais barato que financiamento" sem premissas claras = enganoso
- Lei do Consórcio (11.795/2008) — informação ao consorciado tem que ser "clara, precisa e adequada"
- **Mitigação obrigatória**: disclaimer com premissa (taxa anual usada, fonte BACEN aproximado), variabilidade da taxa real, taxa adm consórcio incluída na comparação

**Arquivos de teste sugeridos:**
- `src/lib/finance/pmt.test.ts` (novo)
- `src/lib/agent/tools/ai-sdk.test.ts` (schema da tool)
- `src/components/chat/artifacts/financing-comparison.test.tsx` (novo)
- `src/lib/agent/system-prompt.test.ts` (verifica remoção de diretiva + LLM eval env-gated)

### Cenários de aceite

#### Golden path — fórmula PMT
- **GIVEN** crédito R$ 900.000, prazo 240 meses, taxa anual 10%
- **WHEN** chamar `pmt(900000, 240, 0.10)` (Price)
- **THEN** retorna valor próximo de R$ 8.681,75 (cálculo Price padrão; tolerância ±R$ 5)
- **Métrica:** `Math.abs(pmt(900000, 240, 0.10) - 8681.75) <= 5`. Testar também: imóvel R$ 500k 180m 10%, auto R$ 80k 60m 22%, moto R$ 30k 48m 28%.

#### Golden path — tool e componente
- **GIVEN** simulação ativa com grupo selecionado
- **WHEN** agente chama `compare_with_financing({ groupId, creditValue, financingTerm })`
- **THEN** componente renderiza: parcela consórcio, parcela financiamento, diferença mensal, custo total ambos, premissa de taxa, disclaimer
- **Métrica:** 6 elementos DOM presentes; disclaimer match `/estimativa|premissa|taxa varia|consulte/i`

#### Golden path — LLM eval (env-gated)
- **GIVEN** usuário pergunta "qual a diferença pra um financiamento?"
- **WHEN** gerar 3 amostras
- **THEN** ≥ 2/3 amostras invocam a tool `compare_with_financing` (NÃO recusam)
- **Métrica:** verificar `toolCalls` no resultado do streamText; ≥ 2/3 amostras têm `toolName === "compare_with_financing"`

#### Edge case 1 — diretiva antiga removida
- **GIVEN** import do `SYSTEM_PROMPT`
- **WHEN** grep
- **THEN** zero matches para diretivas tipo `/n[ãa]o (compar[eaê]|fala) (sobre )?financiamento/i`, `/recus[ea] compara[çc][ãa]o/i`
- **Métrica:** assertions explícitas

#### Edge case 2 — premissa de taxa correta por categoria
- **GIVEN** comparação chamada com `category: "imovel"`
- **WHEN** verificar taxa usada
- **THEN** taxa anual = 10%
- **Métrica:** test confirma taxa por categoria (imóvel 10%, auto 22%, moto 28%)

### Cenários negativos (NÃO PODE acontecer)
- Comparação omitir taxa adm do consórcio no custo total (apples-to-oranges)
- Falar "consórcio é sempre mais barato" sem mostrar números
- Faltar disclaimer de premissa de taxa
- Agente continuar recusando quando perguntado
- Taxa do financiamento ser variável/aleatória entre calls (deve ser determinística por categoria)
- Diferença mensal mostrar sinal trocado (consórcio aparecer "mais caro" quando é mais barato)

### Anti-regressão
- `src/lib/agent/example-selector.test.ts` — examples não devem ter recusa explícita
- `src/lib/eval/judge.test.ts`

---

## Item #19 — Landing "Como funciona" stepper visual de 5 passos

Passos: (1) Escolha o plano (2) Faça sua simulação (3) Entre no grupo (4) Seja contemplado (5) Realize seu objetivo — com ícones lucide.

**Tipo:** component
**Severidade:** baixa
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/components/landing/how-it-works.test.tsx` (mesmo arquivo do #03)

### Cenários de aceite

#### Golden path
- **GIVEN** `HowItWorks` renderizado
- **WHEN** consultar DOM
- **THEN** 5 passos renderizados na ordem certa, cada um com ícone (SVG) e número visível
- **Métrica:** `screen.getAllByRole("listitem")` ou container com `data-testid="step-N"` para N=1..5; texto de cada passo presente; SVG dentro de cada passo

#### Edge case 1 — ordem semântica
- **GIVEN** mesma render
- **WHEN** ler labels em ordem do DOM
- **THEN** ordem: Escolha o plano → Faça sua simulação → Entre no grupo → Seja contemplado → Realize seu objetivo
- **Métrica:** `steps.map(s => s.textContent)` corresponde à ordem esperada

#### Edge case 2 — ícones de `lucide-react`
- **GIVEN** SVGs do stepper
- **WHEN** inspecionar atributos/class
- **THEN** SVGs têm classes do padrão lucide (ex: `lucide` ou data-attr) — verificar pelo menos que NÃO são `<img>` (devem ser inline SVG)
- **Métrica:** todos elementos de ícone são `<svg>`, não `<img>`

### Cenários negativos (NÃO PODE acontecer)
- Stepper com 4 ou 6 passos
- Passos sem ícone (apenas número)
- Layout vertical apenas em desktop (mobile-first é constraint do projeto — testar com viewport mobile se feasible)
- Quebrar #03 (manter palavras-chave de benefício no copy ao redor)

### Anti-regressão
- Mesmo arquivo do #03

---

## Item #20 — Categoria Moto disponível no canal WhatsApp

`src/lib/whatsapp/processor.ts` — orchestrator roteia "moto" igual web.

**Tipo:** integration
**Severidade:** alta
**Risco regulatório:** não
**Arquivos de teste sugeridos:**
- `src/lib/whatsapp/processor.test.ts` (novo)

### Cenários de aceite

#### Golden path
- **GIVEN** WhatsApp processor inicializado, usuário envia "quero comprar uma moto"
- **WHEN** processar mensagem
- **THEN** orchestrator é chamado com category derivada `"moto"` (não erro, não fallback genérico)
- **Métrica:** mock do orchestrator captura a call; `expect(orchestratorMock).toHaveBeenCalledWith(expect.objectContaining({ category: "moto" }))`

#### Edge case 1 — variações de menção
- **GIVEN** mensagens: "moto", "motocicleta", "uma moto nova", "quero financiar uma scooter"
- **WHEN** processar cada uma
- **THEN** todas roteiam pra category `"moto"` (exceto "scooter" se decisão for não cobrir — cravar)
- **Métrica:** matrix de inputs → category esperada; "moto" e "motocicleta" obrigatórias

#### Edge case 2 — paridade com web
- **GIVEN** mesmo input "quero uma moto" enviado pelo canal web E pelo canal WhatsApp
- **WHEN** ambos processam
- **THEN** mesma persona ativada (persona `moto`), mesma 1ª pergunta de qualificação
- **Métrica:** comparar `persona.id` e primeira mensagem do agente entre os 2 canais

### Cenários negativos (NÃO PODE acontecer)
- "moto" cair em fallback "Não entendi, escolha entre Imóvel ou Carro"
- Persona moto não estar disponível pro canal WhatsApp
- Comportamento divergente entre web e WhatsApp (mesma persona, fluxo diferente)
- Hardcode de categorias no `processor.ts` que precisaria ser atualizado a cada nova categoria

### Anti-regressão
- Nenhum test existente em `whatsapp/`; primeiro do módulo. Cuidado: integração com `personas-repo.ts`.

---

## Sign-off matrix

QA Crítico preenche este checklist no relatório final. Item só recebe **PASS** quando TODOS os critérios da seção do item estão verdes; **PARTIAL** quando golden path passa mas algum edge ou negativo falha; **FAIL** quando golden path falha.

| ID | Item | Status | Justificativa |
|---|---|---|---|
| #01 | Categoria moto adicionada | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #02 | "Serviços" removido | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #03 | "Como funciona" foca benefícios | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #04 | Helena 1ª fala calorosa (LLM) | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #05 | Tópicos clicáveis + voltar | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #06 | Comando "voltar" funcional | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #07 | Sem anglicismos | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #08 | Copy financeiro factual (crítico) | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #09 | recommend_groups ≥3 sempre | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #10 | Card simulação 7 campos | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #11 | Cálculo consistente (crítico) | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #12 | 3 CTAs explícitos | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #13 | "Tenho interesse" elevado | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #14 | Sem "card" no copy | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #15 | 1ª vez = explicação básica (LLM) | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #16 | 3 cenários renderizados | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #17 | Comparador financiamento (LLM) | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #19 | Stepper 5 passos | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |
| #20 | Moto no WhatsApp | [ ] PASS / [ ] PARTIAL / [ ] FAIL | |

### Gates globais (TODOS obrigatórios pra liberar merge)

- [ ] `npm run test` total verde (anti-regressão)
- [ ] `LLM_TESTS=1 npm run test` rodado ≥ 1 vez na branch; falhas LLM dentro do threshold ≥ 2/3
- [ ] `npm run typecheck` verde
- [ ] Cada commit `test+fix:` contém TANTO arquivo de teste QUANTO arquivo de produção
- [ ] Migrations não rodadas direto contra DB (regra global Kairo) — aplicadas via app no docker compose local
- [ ] Disclaimer regulatório presente em #08, #16, #17 (verificado manualmente)
- [ ] 0 items com status FAIL (PARTIAL aceitável apenas se justificado e aprovado por Kairo)
