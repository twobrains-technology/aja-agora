# Plano de Teste Consolidado v2 — Aja Agora

**Data:** 2026-05-17
**Branch base:** `develop` (cabeça `835692c`)
**Autor:** PO Lead (Opus 4.7) — persona QA fintech consórcio sênior
**Antecessores:**
- `docs/specs/2026-05-16-bruna-v1-qa-plan.md` (plano Bruna v1, 19 itens, GO mergeado em `1182653`)
- `docs/specs/2026-05-16-bruna-v1-qa-report-2.md` (round 2, 14 PASS / 3 PARTIAL / 0 FAIL)
- `docs/test-plans/simulador-completo.md` (plano simulador, 120 CAs)
- `docs/specs/2026-05-16-pos-venda-24h-roadmap.md` (item #18 Bruna v1, fora do MVP)
**Insumo novo:** `~/Downloads/Revisão_Plataforma_v1 (1).docx` — Bruna v2 (12 pontos)

Este documento é **contrato de aceite** pro QA Crítico. Cada critério é binário (passa / não passa). Sem linguagem opinativa ("deveria", "talvez"). Itens novos da Bruna v2 prefixados com **Bv2-**.

---

## 1. Sumário executivo

### Estado do produto (snapshot)

| Indicador | Valor |
|---|---|
| Testes automatizados | **408 passed / 4 skipped** (após bug #02 moto) |
| Typecheck (`tsc --noEmit`) | exit 0 |
| Cobertura camada de memória | 93.9% linhas / 86.4% branches |
| Migrations aplicadas (via container) | `0001` → `0012_persona_bruno_moto.sql` |
| Personas ativas | Helena (imovel), Rafael (auto), **Bruno (moto, novo)**, servicos inativo |
| Canais suportados | Web (SSE via AI SDK), WhatsApp (Meta Cloud API) |
| Camada de memória | Letta sidecar com circuit breaker + fallback Noop |
| Simuladores admin | Web, WhatsApp e Atendente — isolados (`is_simulated=true`) |

### O que entrou desde 1182653 (último merge Bruna v1)

1. **Phase 12 — Letta cross-channel** (`45d7539`) — memória persistente entre sessões e canais (web ↔ WhatsApp), circuit breaker síncrono, fallback Noop, 173 testes (93.9% cov)
2. **Simulador completo** (`7136f36`) — hub `/admin/simulator` com Cliente Web, Cliente WhatsApp e Atendente; flag `is_simulated` isola conversas/leads de painéis comerciais; 128 testes
3. **Local-dev workspaces** (`e0a35a4`) — stack inteira segregada por branch, DNS `aja-<workspace>.orb.local` (não é critério de teste — infra)
4. **Bug #01 crypto.randomUUID** (`34d6420`) — polyfill defensivo pra non-secure context (DNS `.orb.local` é HTTP); 5 testes
5. **Bug #02 categoria Moto E2E** (`835692c`) — gap descoberto pelo QA: cards UI + rates.json + formatter WhatsApp + persona Bruno; 9 testes

### Gaps conhecidos herdados

- **3 PARTIAL residuais Bruna v1** — #04 Helena, #08 copy factual, #15 explicação primeira vez — todos por LLM eval env-gated ausente
- **Smoke E2E Letta** — 4 testes `skipped`, validação manual no browser pendente
- **Smoke E2E simulador** — 53 dos 120 CAs do plano simulador dependem de `docker compose up` + Playwright e não foram rodados
- **Item #18 Bruna v1 (pós-venda 24h)** — roadmap aberto, sem implementação

---

## 2. Itens da Bruna v2 (do .docx)

A Bruna entregou 12 pontos no documento `Revisão_Plataforma_v1 (1).docx`. Foram normalizados em IDs `Bv2-01` a `Bv2-12`. Categoria, criticidade e confronto com plano anterior abaixo.

---

### Bv2-01 — "Colocar moto na entrada — tirar serviços no início"

**Descrição literal:** *Colocar moto na entrada - tirar serviços no início*
**Categoria:** UX (landing) / regressão de cobertura
**Severidade:** alta (era blocker da v1, virou re-check)
**Risco regulatório:** não
**Confronto com v1:** **bate com #01 + #02 + #20 v1** — todos PASS no round 2. Bug #02 da sessão atual fechou os call-sites que ainda faltavam na UI/persona/WhatsApp. **Este item da v2 vira ANTI-REGRESSÃO** — a Bruna está confirmando que precisa aparecer.

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** landing `/` renderizada em mobile e desktop
- **WHEN** o usuário vê o hero
- **THEN** os 4 cards de categoria são, em ordem: **Imóvel, Carro, Moto, Eletrodomésticos/Reforma** OU equivalente que **NÃO inclua "Serviços"** e **inclua "Moto"** com ícone `Bike` do lucide.

#### Cenários de teste

1. **Happy:** DOM contém botão/card com texto `/moto/i`; **não** contém botão/card com texto `/servi[cç]os/i`.
2. **Anti-regressão UI:** `welcome-categories.tsx` `CATEGORY_CONFIG.moto` permanece definido; grid é `grid-cols-2 sm:grid-cols-4`; ícone é `Bike`.
3. **WhatsApp paridade:** mensagem inicial do WhatsApp lista as 4 categorias (mesma ordem); `RANGES.moto` tem ≥5 faixas; `valuePicker` aceita `category="moto"`.
4. **Persona pipeline:** clicar/escolher "Moto" entra na persona Bruno (specialist moto); orquestrador NÃO logga `no active specialist persona for category 'moto'`.
5. **DB:** persona `Bruno` ativa (`is_active=true`) na tabela `personas` para `category='moto'`; migration `0012` aplicada.

#### Risco regulatório
- Indireto: ausência de paridade entre canais pode caracterizar oferta diferenciada (CDC art. 30/35). Fechado pela paridade web ↔ WhatsApp.

---

### Bv2-02 — "Na parte 'como funciona': colocar benefícios do consórcio, não dar foco em IA"

**Descrição literal:** *na parte como funciona: colocar benefícios do consórcio, não necessariamente dar foco no IA*
**Categoria:** UX (landing) + risco regulatório
**Severidade:** média
**Risco regulatório:** **sim** — overclaim de "IA" pode ser publicidade enganosa (CDC art. 37) se o entregue não bater com a expectativa criada.
**Confronto com v1:** **bate com #03 v1** (PASS). **Reforço da Bruna** — virou ANTI-REGRESSÃO + aprofundamento.

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** seção `HowItWorks` renderizada
- **WHEN** o texto visível é coletado
- **THEN** menciona **pelo menos 4** das palavras-chave: `/sem juros/i`, `/parcela (menor|mais baixa)/i`, `/lance/i`, `/contempla(ção|cao)/i`, `/assembleia/i`, `/grupo/i`
- **AND** **NÃO** contém: `/100% ia/i`, `/agente inteligente/i`, `/powered by ai/i`, `/intelig[êe]ncia artificial/i`, `/automa[çc][ãa]o inteligente/i`, `/ai-first/i`.

#### Cenários

1. **Happy:** ≥4 palavras-chave presentes; vetadas ausentes.
2. **Edge — copy adjacente:** hero + features-section + how-it-works combinados também respeitam o veto (não é só `HowItWorks` isolado).
3. **Edge — visual:** se houver badge/chip "Powered by AI" ou similar no header/footer, **deve ser removido** ou substituído por linguagem de benefício.
4. **Anti-regressão #19:** stepper de 5 passos permanece (escolha plano → simulação → grupo → contemplado → objetivo).

#### Risco regulatório
- CDC art. 37 §1º — publicidade enganosa por overclaim. Vetar copy de IA na landing mitiga.

---

### Bv2-03 — "Após escolher imóvel — fala mais calorosa"

**Descrição literal:** *após escolher imóvel: Legal: irei te ajudar a escolher a melhor opção! Ou: Estamos animados que vamos te ajudar a escolher o seu imóvel!*
**Categoria:** UX (copy do agente Helena)
**Severidade:** média
**Risco regulatório:** não
**Confronto com v1:** **bate com #04 v1** (PARTIAL — LLM eval ausente). **A Bruna está cobrando o gap residual.** Bv2-03 fecha #04.

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** usuário acabou de selecionar categoria "Imóvel" na home (sem mensagem prévia)
- **WHEN** geram-se 3 amostras independentes (`temperature=0`) da 1ª fala da Helena
- **THEN** ≥ 2/3 amostras:
  - contêm pelo menos UMA das palavras de calor: `/legal|show|ótimo|otimo|animad[oa]|bora|que (bom|legal|ótimo)|adoro|amei|que (massa|bacana)/i`
  - **OU** seguem o padrão "Estamos animados que vamos te ajudar a escolher seu imóvel" (entusiasmo + 1ª pessoa do plural)
- **AND** judge `dimensions.naturalidade` ≥ 0.85 em ≥ 2/3 amostras
- **AND** NÃO começa com fórmula robótica `/sou (a|o) [a-z]+, su[ao] (assistente|consultor)/i`

#### Cenários

1. **Happy:** 3 amostras temp=0; ≥2/3 passam regex + judge.
2. **Anti-regressão:** specialist mencionado (imóvel/casa/apto) nas primeiras 2 frases; sem 2+ emojis.
3. **Edge — Bruno/Rafael:** mesmo padrão aplicado aos specialists `moto` e `auto` (paridade); falas iniciais calorosas, não robóticas.

#### Risco regulatório
- Não direto. Indireto: tom robótico pode prejudicar adesão (taxa de conversão).

#### Plug obrigatório
- Suite `src/lib/agent/system-prompt.test.ts` com `describe.skipIf(!process.env.LLM_TESTS)` deve ser **implementada** nesta v2 (fecha gap #04, #08, #15 v1 que ficaram em hardening).

---

### Bv2-04 — "Opção 'entender mais antes' — quebrar em tópicos com voltar ao menu"

**Descrição literal:** *A opção entender mais antes - não é melhor já fazer em tópicos para saber a dúvida ou dar a opção: voltar ao menu anterior?*
**Categoria:** UX (chat flow) / produto
**Severidade:** alta
**Risco regulatório:** não
**Confronto com v1:** **bate com #05 + #06 v1** (PASS round 2). **Bruna re-confirma — pedido vivo, virar verificação ponta-a-ponta.**

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** usuário em qualificação e clicou "Entender mais antes"
- **WHEN** o agente chama `present_topic_picker`
- **THEN** o artifact renderiza:
  - 3 a 5 chips clicáveis com tópicos pré-definidos (ex: "Como funciona o lance?", "E se eu não for contemplado?", "Posso desistir?")
  - 1 botão `← Voltar` com `data-testid="topic-picker-back"`
- **AND WHEN** clicar em chip → mensagem enviada é igual ao label do chip (não opaco)
- **AND WHEN** clicar em "← Voltar" → orchestrator pop'a estado, próxima render mostra última pergunta de qualificação

#### Cenários

1. **Happy chip click:** clique em "Como funciona o lance?" → próxima mensagem agente responde sobre lance.
2. **Happy back:** clique em "← Voltar" no topic picker → volta à pergunta de qualificação anterior; `meta.persona/category/expertiseLevel/qualifyAnswers` preservados.
3. **Edge — texto "voltar":** WhatsApp recebe `"voltar"` → mesmo comportamento do botão.
4. **Edge falso-positivo:** mensagem `"vou voltar amanhã"` NÃO triggera back intent.
5. **Anti-regressão:** stack `navigationStack` em `metadata` da conversa, cap 20.

#### Risco regulatório
- Não.

---

### Bv2-05 — "Tirar palavras em inglês — ex: range"

**Descrição literal:** *Tirar palavras em ingles - ex:range*
**Categoria:** UX (copy)
**Severidade:** baixa
**Risco regulatório:** não
**Confronto com v1:** **bate com #07 + #14 v1** (PASS). **Anti-regressão obrigatória.**

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** importa `SYSTEM_PROMPT`, `SHARED_SPECIALIST_EXAMPLES`, descriptions de tools e textos dos renderers `topic-picker.tsx`, `scenarios.tsx`, `financing-comparison.tsx`, `simulation-result.tsx`
- **WHEN** grep por anglicismos
- **THEN** zero matches em strings user-facing para: `\brange\b`, `\bcards?\b`, `\bnice\b`, `\bcool\b`, `\bfeedback\b`, `\binsight\b`, `\btip\b`, `\bhack\b`, `\bbudget\b`, `\bdeal\b`
- **AND** substituições positivas: `/faixa/i` presente; `/op[çc][ãa]o|alternativa|proposta/i` presente quando o contexto pedia "card".

#### Cenários

1. **Happy:** lista de regexes vetadas, todas zeradas em todas as strings.
2. **Edge — comentário de código não conta:** assertion específica em variáveis exportadas, não no conteúdo bruto do arquivo.
3. **Edge — renderers novos (Letta + simulador):** `whatsapp-stage.tsx`, `simulator-web.tsx`, `inbox.tsx`, `handoff-banner.tsx` também respeitam.

#### Risco regulatório
- Não.

---

### Bv2-06 — "Não afirmar adequação financeira sem dado — mostrar pelo menos 3 opções antes da sugestão"

**Descrição literal:** *A Rodobens se destaca pelo crédito de R$ 900 mil com parcela que cabe bem no seu orçamento e taxa dentro da média do mercado - não temos conhecimento do cliente, para saber se cabe no bolso ou não - temos como deixar sempre, pelo menos 3 opções e depois mostrar a nossa sugestão?*
**Categoria:** **regulatório (crítico)**
**Severidade:** **crítica**
**Risco regulatório:** **alto — CDC art. 39 IV, CDC art. 37 §1º, CMN res. 4.927/2021**
**Confronto com v1:** **bate com #08 + #09 v1** — #08 ficou PARTIAL (sem LLM eval), #09 PASS. **A Bruna está cobrando justamente o gap.**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — copy factual (fecha #08 PARTIAL v1)

- **GIVEN** usuário pediu detalhamento de uma administradora específica
- **WHEN** geram-se 3 amostras (temp=0)
- **THEN** ≥ 2/3 amostras:
  - contêm porcentagem do teto declarado pelo cliente (`/\d{1,3}\s?%/`) OU valor absoluto comparativo (`/R\$\s?\d/`)
  - NÃO contêm: `/cabe (bem )?no seu (orçamento|orcamento|bolso)/i`, `/dentro do seu orçamento/i`, `/adequad[oa] (ao|pro) seu (orçamento|perfil)/i`, `/ótim[ao]|excelente|perfeit[ao]|cabe bem/i`, `/taxa dentro da média/i` (a menos que cite a fonte)

##### Parte B — sempre ≥ 3 opções antes da sugestão (cobre #09)

- **GIVEN** qualificação completa do cliente
- **WHEN** agente chama `recommend_groups`
- **THEN** retorna **≥ 3** opções com `alternativa: false` quando possível; se não houver, completa com `alternativa: true` (fallback ±20% → ±50%); zero duplicados; originais ordenados primeiro
- **AND** o agente apresenta as ≥ 3 opções **antes** de eleger 1 como "destaque/sugestão"

##### Parte C — destaque explícito separado da apresentação

- **GIVEN** ≥ 3 opções apresentadas
- **WHEN** o agente sugere 1 como melhor
- **THEN** a sugestão vem em mensagem/artifact **separado** do comparativo (não embedded na 1ª fala) e justifica com fato verificável (taxa adm menor, prazo mais curto, % do teto), não com adjetivo subjetivo

#### Cenários

1. **Happy A:** parcela R$ 5.715, teto R$ 6.000 → fala contém "95% do seu teto" ou "R$ 5.715 (de R$ 6.000)"; sem adjetivos vetados.
2. **Happy B:** filtro estrito retorna 5 → todos com `alternativa: false`.
3. **Edge B1:** filtro retorna 2 → expande ±20%, completa pra ≥3 com `alternativa: true`.
4. **Edge B2:** mesmo ±50% só dá 2 → retorna 2 + flag `insufficientOptions: true` pro agente explicar.
5. **Edge C — alta % do teto (≥80%):** agente comunica explicitamente "isso representa 95% do teto declarado, vale ter folga pra imprevistos" sem adjetivo positivo.
6. **Edge C — baixa % (<50%):** fala factual sem virar opinativa ("cabe tranquilo" vetado).
7. **Anti-regressão #11:** parcela mostrada no comparativo == parcela do detalhamento (±R$1).

#### Risco regulatório

- **CDC art. 39 IV** — prevalecer-se da fraqueza/ignorância: "cabe no orçamento" induz contratação sem dado financeiro completo.
- **CDC art. 37 §1º** — publicidade enganosa por omissão.
- **CMN res. 4.927/2021** — informação tem que ser "clara, precisa e adequada", não opinativa.
- **Mitigação:** linguagem matemática sobre input do próprio usuário (% do teto declarado) + ≥3 opções (escolha real).

#### Plug obrigatório nesta v2

1. Implementar `LLM_TESTS=1` suite para #08 (3 amostras temp=0).
2. Verificar que `recommendWithFallback` está plugado em **TODOS** os call-sites do agente (não só `recommend_groups`).
3. Validar via QA crítico que a apresentação de 1 destaque vem **depois** das ≥3 opções no fluxo conversacional real (Playwright).

---

### Bv2-07 — "Simulação deve ter: valor da carta, prazo, parcela, taxa adm, fundo de reserva, cenário com lance, correção prevista"

**Descrição literal:** *Temos que ter as seguintes infos no simulador: valor da carta, prazo,parcela, taxa adm, fundo de reserva, cenário com lance, correção prevista - não vi esses*
**Categoria:** UX / regulatório
**Severidade:** alta
**Risco regulatório:** sim — CMN res. 4.927/2021 exige composição completa da parcela.
**Confronto com v1:** **bate com #10 + #16 v1** (PASS round 2). **A Bruna está dizendo "não vi esses" — possível regressão visual OU artifact não está sendo invocado no fluxo.**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — artifact `SimulationResult` renderiza os 7 campos

- **GIVEN** `QuotaSimulation` válida e `SimulationResult` renderizado
- **WHEN** consultar DOM
- **THEN** todos os 7 valores estão visíveis com label semântico, valor NÃO vazio (sem "—" ou "N/A"):
  1. Valor da carta (`/carta|cr[ée]dito/i`)
  2. Prazo (`/prazo|meses/i`)
  3. Parcela (`/parcela|mensal/i`)
  4. Taxa adm (`/taxa adm|administra[çc][ãa]o/i`)
  5. Fundo de reserva (`/fundo de reserva/i`)
  6. Cenário com lance (`/lance/i`) — pode ser o componente `Scenarios` renderizado em sequência
  7. Correção prevista (`/INCC|IPCA/i`)

##### Parte B — artifact é DE FATO invocado quando o usuário pede simulação

- **GIVEN** fluxo qualificado completo
- **WHEN** agente chega no momento de simular (tool `simulate_quota` ou equivalente)
- **THEN** chama tool de presentation `present_simulation_result` (não só verbaliza o resultado)
- **AND** Playwright (smoke) renderiza o artifact com os 7 campos visíveis na UI real

#### Cenários

1. **Happy A:** 7 assertions DOM passam.
2. **Edge — categoria imóvel:** INCC presente, IPCA ausente.
3. **Edge — categoria auto/moto:** IPCA presente, INCC ausente.
4. **Happy B (E2E novo desta v2):** Playwright via `/admin/simulator/web` → simular conversa → verificar que após "quero simular" o agente entrega `SimulationResult` com 7 campos.
5. **Anti-regressão #11:** parcela = `searchGroups.monthlyPayment` (±R$1).
6. **Anti-regressão #16:** `Scenarios` (3 cards Conservador/Provável/Acelerado) coexiste com `SimulationResult` (são artifacts diferentes; o pedido é que **lance** apareça como campo na simulação **E** como `Scenarios` quando relevante).

#### Risco regulatório
- **CMN res. 4.927/2021** — omissão de fundo de reserva ou taxa adm = publicidade enganosa por omissão.
- **CDC art. 30** — vincula a oferta; campos têm que aparecer pré-assinatura.

#### Diagnóstico esperado do QA crítico
Verificar se a Bruna viu o artifact ou só a fala do agente. Se ela viu só a fala (sem o componente), o problema é o agente não invocando `present_simulation_result` no fluxo — não a ausência dos campos no componente.

---

### Bv2-08 — "Valores mudaram entre comparativo e detalhamento da Rodobens"

**Descrição literal:** *Recebi o comparativo das adms, mas quando pedi mais detalhes apenas da Robobens, os valores mudaram:*
**Categoria:** **regulatório (crítico)** + bug de cálculo
**Severidade:** **crítica**
**Risco regulatório:** **alto — CDC art. 30, 35, 37**
**Confronto com v1:** **bate com #11 v1** (PASS round 2 — `computeQuota` virou fonte única). **Bruna está reportando que viu de novo — POSSÍVEL REGRESSÃO ou caminho não coberto.**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — função pura coerente (já estava em #11)

- **GIVEN** todos grupos em `groups.json` + administradoras em `rates.json`
- **WHEN** para cada grupo, comparar `searchGroups.monthlyPayment` com `simulateQuota.monthlyPayment` pro mesmo crédito
- **THEN** todos os pares passam tolerância **≤ R$ 1,00**
- **AND** o teste roda explicitamente sobre **as 3 categorias com persona ativa** (imovel, auto, **moto**)

##### Parte B — paridade entre cards (comparativo) e detalhamento (simulação) no fluxo real

- **GIVEN** comparativo de 5 administradoras renderizado, parcela X mostrada para Rodobens
- **WHEN** usuário pede "mais detalhes da Rodobens"
- **THEN** detalhamento mostra mesma parcela X (±R$ 1)
- **AND** caso o usuário ajuste o valor do crédito no detalhamento, comparativo é re-cotado coerentemente (ou avisa "ajustou pra R$ Y, valores atualizados")

##### Parte C — investigação ativa

QA crítico deve fazer:
1. Smoke real (Playwright) reproduzindo o cenário da Bruna: 5 admins → pedir detalhes Rodobens → comparar valores.
2. Se valores divergirem → reproduzir como teste de unit determinístico → corrigir a função/caminho responsável (não o teste).
3. Se valores baterem em E2E mas Bruna viu divergente → investigar histórico (snapshot do print da Bruna se disponível) e se há cache/race condition.

#### Cenários

1. **Happy A:** todos grupos × 3 categorias passam ±R$1.
2. **Edge — moto:** adicionar grupo moto ao loop do `mock-bevi-adapter.test.ts:26` (gap anotado em #11 round 2).
3. **E2E Playwright (novo):** cenário real Rodobens com print.
4. **Edge — usuário ajusta crédito após comparativo:** valores re-cotados, comparativo invalidado ou refresheado.
5. **Anti-regressão:** `monthlyPayment` em `groups.json` NÃO usado em runtime (deve ser computado por `computeQuota`).

#### Risco regulatório

- **CDC art. 30 + 35** — preço divergente entre tela e tela = oferta vinculante violada; cliente pode legalmente exigir o menor.
- **CDC art. 37** — publicidade enganosa.
- **Sanção:** Procon + ação coletiva possível se virar reincidente.

---

### Bv2-09 — "Texto de fechamento sugere: ajustar valor do crédito e fazer novas simulações"

**Descrição literal:** *Frase final dessa parte: Aqui está o detalhamento completo da Rodobens. Com sua reserva pra lance, a chance de contemplar bem antes dos 200 meses é real — esse é um dos pontos fortes de entrar com lance. Se quiser ajustar o valor do crédito ou comparar com outra opção, é só falar. — Sugestão: ajustar valor do crédito, e fazer novas simulações.*
**Categoria:** UX (CTAs)
**Severidade:** média
**Risco regulatório:** não
**Confronto com v1:** **bate com #12 v1** (PASS) — 4 CTAs já existem ("Tenho interesse", "Ajustar valor", "Nova simulação", "Comparar outra adm"). **A Bruna está dizendo que NO TEXTO o agente menciona apenas "ajustar ou comparar" mas falta destacar "nova simulação" explicitamente OU os CTAs não estão aparecendo de fato.**

#### Critério de aceite GIVEN/WHEN/THEN

- **GIVEN** `SimulationResult` renderizado com simulação completa de uma administradora
- **WHEN** consultar DOM
- **THEN** existem 4 botões visíveis: `Tenho interesse`, `Ajustar valor`, `Nova simulação`, `Comparar outra adm`
- **AND** ao clicar em cada CTA, callback recebe intent: `interest`, `adjust_credit_value`, `new_simulation`, `compare_other_admin`
- **AND WHEN** a fala de fechamento do agente menciona próximos passos
- **THEN** menciona explicitamente "ajustar o valor" **E** "nova simulação" **E** "comparar com outra opção" (não omitir nenhum)

#### Cenários

1. **Happy DOM:** 4 botões via `getByRole("button", { name: regex })`.
2. **Happy click:** cada um chama `onAction` com intent correto.
3. **Edge — fala do agente:** assertion textual contra a última fala (`/ajustar (o valor|cr[ée]dito)/i`, `/nova simula[çc][ãa]o/i`, `/comparar (com outra|outra adm)/i`).
4. **Edge — disabled state:** simulação inválida → botões desabilitados (não crashar).
5. **Anti-regressão:** "Tenho interesse" mantém afordância elevada (sticky bottom ou variant primary + shadow), altura ≥ 44px (#13 v1).

---

### Bv2-10 — "Box 'Tenho interesse' — mudar palavra 'card'"

**Descrição literal:** *Onde está o box - Tenho interesse? Mudar a palavra "card"*
**Categoria:** UX (copy) + bug de localização
**Severidade:** média
**Risco regulatório:** não
**Confronto com v1:** **bate com #13 + #14 v1** (PASS). **A Bruna está cobrando: (a) afordância do botão (achar onde está) E (b) tirar a palavra "card" se ainda aparecer.**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — afordância elevada (cobre #13)

- **GIVEN** `SimulationResult` renderizado
- **WHEN** inspecionar o botão "Tenho interesse"
- **THEN** ele tem pelo menos UMA dessas afordâncias:
  - Classe contendo `sticky` E `bottom`
  - OU variant `destaque`/`primary`/`hero` + classe `shadow-(md|lg|xl|2xl)`
  - OU `data-testid="cta-primary"` com `position: fixed` ou similar
- **AND** altura ≥ 44px (WCAG / Apple HIG)

##### Parte B — palavra "card" removida (cobre #14)

- **GIVEN** import de `SYSTEM_PROMPT`, `SHARED_SPECIALIST_EXAMPLES`, tools `description` strings, **e copies de UI** (`simulation-result.tsx`, `scenarios.tsx`, `financing-comparison.tsx`, `topic-picker.tsx`, `message-list.tsx`, `welcome-categories.tsx`)
- **WHEN** grep `/\bcards?\b/i` em strings user-facing
- **THEN** zero matches
- **AND** substituições aceitas: "opção", "proposta", "alternativa", "resumo"

#### Cenários

1. **Happy A:** botão atende afordância + altura.
2. **Happy B:** grep zerado em todas as strings listadas.
3. **Edge B1 — comentários de código:** assertion específica em variáveis exportadas (não conteúdo bruto).
4. **Edge B2 — renderers do simulador admin:** se o admin usar "card" em label de UI interna, não conta (não é user-facing); apenas o que o cliente externo vê.
5. **Anti-regressão UX:** sticky bottom não cobre o 7º campo de Bv2-07 (z-index sano).

---

### Bv2-11 — "Comentários gerais — fechamento combine educação, confiança, simulação clara e acompanhamento consultivo"

**Descrição literal:** *Comentários gerais: fechamento precisa combinar educação, confiança, simulação clara e acompanhamento consultivo. Primeira vez: ter a explicação básica do que é consórcio - infos que estão no "Saiba mais". Quando colocarmos os 3 cenários de acordo com a carta do cliente, conseguimos dar cenários: Cenário conservador - sem lance; Cenário provável - com lance parcial; Cenário acelerado - lance embutido + recursos próprios. Isso ajuda o cliente a visualizar prazo realista. A gente consegue ter algum simulador de comparativo de financiamento e consórcio?*
**Categoria:** UX + regulatório + feature
**Severidade:** alta (composto)
**Risco regulatório:** sim — CMN res. 4.927/2021 (educação básica), CDC art. 37 (comparação financeira)
**Confronto com v1:** **agrupa #15 + #16 + #17 v1** — #16 e #17 PASS, #15 PARTIAL (LLM eval). **Bruna está re-confirmando os 3 itens como pacote.**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — explicação básica primeira vez (fecha #15 PARTIAL)

- **GIVEN** usuário com `experiencePrev="first"` em qualificação
- **WHEN** geram-se 3 amostras temp=0 da próxima fala
- **THEN** ≥ 2/3 amostras contêm **pelo menos 3** termos: `/sem juros/i`, `/grupo de pessoas/i`, `/sorteio/i`, `/lance/i`, `/contempla(ção|cao)/i`, `/assembleia/i`
- **AND** comprimento 80–400 palavras (não muro de texto)
- **AND** usuário `experiencePrev="experienced"` recebe ≤ 1/3 amostras com 3+ termos (não infantiliza)

##### Parte B — 3 cenários (anti-regressão #16)

- **GIVEN** simulação ativa
- **WHEN** agente chama `present_scenarios`
- **THEN** 3 cards: Conservador (`lance=0`), Provável (`lance=20%`), Acelerado (`lance=30% + recursos próprios=10%`); cada um com prazo estimado; disclaimer `/estimativ[ao]|n[ãa]o (é )?garantia|hist[óo]rico/i`
- **AND** `conservador.prazo > provavel.prazo > acelerado.prazo`

##### Parte C — comparador consórcio × financiamento (fecha #17 LLM eval residual)

- **GIVEN** usuário pergunta `/qual a diferen[çc]a (pra|do) financiamento/i`
- **WHEN** geram-se 3 amostras
- **THEN** ≥ 2/3 amostras invocam tool `compare_with_financing` (verificar `toolCalls`)
- **AND** renderer exibe: parcela consórcio, parcela financiamento, diferença mensal, custo total ambos, premissa CET por categoria (imóvel 10%, auto 22%, moto 28%), disclaimer
- **AND** taxa adm consórcio incluída no custo total (apples-to-apples)

#### Cenários

1. **Happy A:** 3 amostras `first` → ≥2/3 com ≥3 termos; tamanho OK.
2. **Anti-regressão A:** `experienced` → ≤1/3 com 3+ termos.
3. **Happy B:** 3 cards renderizados, prazos coerentes, disclaimer.
4. **Happy C:** ≥2/3 amostras invocam tool; renderer DOM correto.
5. **Edge C — categoria moto:** comparador usa taxa 28% (não 22% de auto).
6. **Edge C — comparador omite taxa adm:** **deve falhar** (anti-regressão).
7. **Edge — coesão de fechamento:** após apresentação de 3 cenários, agente menciona próximos passos consultivos (não vira "qual você quer?" seco).

#### Risco regulatório
- **CMN 4.927/2021** — educação básica obrigatória pra novato.
- **CDC art. 37** — comparação financeira só permitida se "objetiva, verdadeira e não enganosa"; premissas têm que estar explícitas.

#### Plug obrigatório
- Suíte LLM eval env-gated para #15 e #17 (a residual). Junto com #04 e #08 da Bv2-03 e Bv2-06, fecha os 3 PARTIAL da v1.

---

### Bv2-12 — "Pós-venda — primeiras 24h: boas-vindas, área cliente, calendário, vídeo 'próximos passos' E stepper visual de 5 passos"

**Descrição literal:** *como será o pós venda? Nas primeiras 24h: mensagem de boas-vindas, acesso à área do cliente, calendário, vídeo "próximos passos". Fluxo em etapas visuais claras (1. escolha o plano; 2. faça sua simulação; 3. entre no grupo; 4. seja contemplado; 5. realize seu objetivo), com ícones simples para cada passo!*
**Categoria:** feature (roadmap) + UX (stepper já existe)
**Severidade:** alta (pós-venda) / baixa (stepper anti-regressão)
**Risco regulatório:** não
**Confronto com v1:** **agrupa #18 v1 (roadmap aberto, não implementado) + #19 v1 (PASS — stepper)**

#### Critério de aceite GIVEN/WHEN/THEN

##### Parte A — stepper de 5 passos na landing (anti-regressão #19)

- **GIVEN** `HowItWorks` renderizado
- **WHEN** consultar DOM
- **THEN** 5 passos em ordem: "Escolha o plano" → "Faça sua simulação" → "Entre no grupo" → "Seja contemplado" → "Realize seu objetivo"
- **AND** cada passo tem ícone SVG `lucide` (não `<img>`) e número visível

##### Parte B — pós-venda 24h (item #18 v1, ainda em aberto)

**Este item NÃO tem critério de aceite implementável agora.** Está fora do MVP atual conforme `docs/specs/2026-05-16-pos-venda-24h-roadmap.md`. Critério é **trabalho de roadmap**:

1. Brainstorm com Bruna sobre cronograma (T+0, T+1h, T+6h, T+24h)
2. ADR para escolha de calendário (Cal.com self-hosted vs Google Calendar API)
3. Template WhatsApp marketing aprovado pela Meta (janela 1-2 semanas)
4. Produção do vídeo (responsabilidade de Bruna/marketing)
5. Spec de implementação por deliverable com TDD

#### Cenários

1. **Happy A:** 5 passos DOM em ordem.
2. **Edge A — mobile-first:** layout não quebra em viewport mobile (mobile-first é constraint).
3. **Edge A — ícones lucide:** todos os 5 são `<svg>` com classe/data-attr lucide.
4. **Parte B:** sem cenário automatizável agora — é trigger para abrir nova rodada de brainstorm + spec.

#### Risco regulatório
- Parte B (pós-venda) toca **LGPD** (gestão de consentimento de marketing pós-conversão) e **Meta Business Policy** (templates marketing). Tratar quando o item entrar.

---

## 3. Confronto com planos anteriores

### 3.1 Plano Bruna v1 (19 itens) — status pós-merge

| ID v1 | Item | Status v1 (round 2) | Re-validação v2 | Fix em |
|---|---|---|---|---|
| #01 | Categoria moto adicionada | ✅ PASS | ✅ confirmado por Bv2-01 + bug #02 fechou call-sites UI/WhatsApp/persona | `1182653`, `835692c` |
| #02 | "Serviços" removido | ✅ PASS | ✅ confirmado por Bv2-01 | `1182653` |
| #03 | "Como funciona" benefícios | ✅ PASS | 🟡 Bv2-02 cobra reforço (verificar veto a "AI/IA" também em hero/features) | `1182653` (re-revisar) |
| #04 | Helena 1ª fala calorosa | 🟡 PARTIAL (LLM eval ausente) | ❌ Bv2-03 cobra implementação do LLM eval | **abrir nesta v2** |
| #05 | Tópicos clicáveis + voltar | ✅ PASS | ✅ confirmado por Bv2-04 | `1182653` |
| #06 | Comando "voltar" funcional | ✅ PASS | ✅ confirmado por Bv2-04 | `1182653` |
| #07 | Sem anglicismos | ✅ PASS | ✅ confirmado por Bv2-05 (estender pra renderers novos) | `1182653` (re-revisar) |
| #08 | Copy financeiro factual | 🟡 PARTIAL (LLM eval) | ❌ Bv2-06 cobra implementação **prioridade regulatória alta** | **abrir nesta v2** |
| #09 | recommend_groups ≥3 | ✅ PASS | ✅ confirmado por Bv2-06 (verificar call-sites alternativos) | `1182653` |
| #10 | Card simulação 7 campos | ✅ PASS | 🟡 Bv2-07 indica possível regressão visual OU artifact não invocado no fluxo | **investigar nesta v2** |
| #11 | Cálculo search × sim | ✅ PASS | ❌ Bv2-08 reporta divergência real — **investigar regressão** | **abrir nesta v2 (CRÍTICO)** |
| #12 | 3 CTAs no fechamento | ✅ PASS | 🟡 Bv2-09 cobra fala mencionar todos os 3 explicitamente | parcial — ajustar copy |
| #13 | "Tenho interesse" afordância | ✅ PASS | 🟡 Bv2-10 reporta "achar o box" — investigar visibilidade | **investigar nesta v2** |
| #14 | Sem "card" no copy | ✅ PASS | 🟡 Bv2-10 ainda menciona — verificar renderers novos | **re-revisar** |
| #15 | Primeira vez = explicação | 🟡 PARTIAL (LLM eval) | ❌ Bv2-11A cobra implementação | **abrir nesta v2** |
| #16 | 3 cenários Cons/Prov/Acel | ✅ PASS | ✅ confirmado por Bv2-11B | `1182653` |
| #17 | Comparador consórcio × financ | ✅ PASS + 🟡 LLM eval residual | 🟡 Bv2-11C cobra LLM eval | **abrir nesta v2** |
| #18 | Pós-venda 24h | 📋 roadmap aberto | 📋 Bv2-12B re-confirma — abrir spec | abrir spec |
| #19 | Stepper 5 passos | ✅ PASS | ✅ anti-regressão por Bv2-12A | `1182653` |
| #20 | Moto cross-canal | ✅ PASS | ✅ confirmado por Bv2-01 + bug #02 | `1182653`, `835692c` |

**Resumo v1:**
- ✅ 11 confirmados / sem ação
- 🟡 6 parciais ou precisam re-revisão pelos pontos da Bv2
- ❌ 5 abrem trabalho novo (LLM eval x3 + investigação #11 + investigação #10)
- 📋 1 roadmap (#18)

### 3.2 Plano Simulador (`docs/test-plans/simulador-completo.md`) — status

- **Implementação:** `7136f36` mergeado, 128 testes novos, 67/120 CAs cobertos automaticamente.
- **Pendência:** 53 CAs dependem de `docker compose up` + Playwright real (smoke E2E ao vivo). Não rodado.
- **Bug colateral:** `crypto.randomUUID` quebrava o simulador admin em `.orb.local` — fechado em bug #01 desta sessão.
- **Re-validar nesta v2:** subir local-dev (`docker compose up`) + rodar smoke dos 3 modos (Web, WhatsApp, Atendente) + handoff em simulação + bus isolation.

### 3.3 Plano Letta (`docs/test-plan-letta-memory-PO.md` + `-QA.md`)

- **Implementação:** `45d7539` mergeado, 173 testes, 93.9% cov.
- **Pendência:** smoke E2E manual no browser (4 testes `skipped`); 5 bugs pequenos em `docs/qa-suggestions.md`; bucket >90 dias no hint; archival cap LRU; deploy AWS dev/prod.
- **Re-validar nesta v2:** smoke manual web→WhatsApp (reconhecimento por telefone) + decisão sobre telefone compartilhado + corrigir 2 bugs do `qa-suggestions.md` (normalizePhoneBR + env vazio).

---

## 4. Features novas desde Bruna v1 (sem plano de teste ainda)

Trabalho em `develop` desde `1182653` que ainda **não** tem critério de aceite documentado na pasta `docs/test-plans/`. Cada feature ganha aqui o seu mini-plano.

---

### F-01 — Letta sidecar memory cross-channel (Phase 12) — `45d7539`

**Critério de aceite proposto:**

- **GIVEN** usuário conversou pelo site, capturou lead (telefone identificado E.164), abandonou
- **WHEN** após 5 dias, manda mensagem no WhatsApp com o mesmo telefone
- **THEN** agente reconhece, retoma de onde parou (`buildReactivationHint` aciona faixa "2-6d"), menciona última categoria/simulação discutida
- **AND** se Letta cair (timeout 2s ou 500) → circuit breaker abre, agente continua respondendo sem memória (NoopAdapter), sem travar

#### Cenários mínimos

1. **Happy cross-channel:** web (cookie `aja_uid`) → captura lead com telefone → WhatsApp mesmo telefone → reconhecido.
2. **Reactivation 0d / 1d / 2-6d / 7+d:** hints diferentes por bucket.
3. **Circuit breaker:** mock Letta retorna 500 duas vezes → próxima chamada vai pro Noop sem latency penalty.
4. **Anti-vazamento:** dois usuários com telefones distintos NÃO compartilham memória (namespace por identidade).
5. **Anti-regressão:** se Letta off → typecheck verde, suite passa, chat responde.

#### Riscos abertos
- Telefone compartilhado (esposo+esposa). Stale memory >90d. Archival cap LRU. Não testado em browser real.

---

### F-02 — Simulador completo Web + WhatsApp + Atendente — `7136f36`

**Critério de aceite proposto:** já existe em `docs/test-plans/simulador-completo.md` (120 CAs). Promover smoke E2E pendente (53 CAs blocked) como **prioridade** desta v2.

#### Cenários mínimos pendentes (smoke)

1. **Web E2E:** abrir `/admin/simulator/web` → escolher Imóvel → percorrer qualificação até `present_simulation_result` → verificar `is_simulated=true` na conversation, lead criado herda flag.
2. **WhatsApp E2E:** abrir `/admin/simulator/whatsapp` → enviar texto "quero comprar uma moto" → receber bolhas + botões nativos do WhatsApp → handoff via "fechado" → atendente recebe badge 🧪.
3. **Atendente E2E:** dois devs simultâneos no `/admin/simulator/attendant` → first-to-reply claima conversa simulada.
4. **Isolation:** kanban `/admin/leads` NÃO mostra lead simulado; dashboard `/admin/dashboard` NÃO contabiliza conversation simulada; eval triggers NÃO disparam (zero custo Claude).
5. **Anti-leak:** mock spy de `fetch("graph.facebook.com")` falha o teste se chamado durante simulação.

---

### F-03 — Bug fix #01 crypto.randomUUID polyfill — `34d6420`

**Critério de aceite proposto:**

- **GIVEN** chat web aberto em URL não secure-context (HTTP `aja-<workspace>.orb.local`)
- **WHEN** `ChatProvider` monta e tenta gerar conversationId
- **THEN** `generateId()` retorna UUID v4 válido sem lançar exceção
- **AND** unicidade ≥ 99.99% em 1000 chamadas

#### Cenários

1. **Happy secure context:** `crypto.randomUUID` disponível → usa nativo.
2. **Fallback `randomUUID` undefined:** usa `Math.random` UUID v4 válido.
3. **Fallback `crypto` undefined:** usa `Math.random` UUID v4 válido.
4. **Unicidade:** 1000 IDs gerados, todos distintos.
5. **Cobertura:** todos os 7 client components migrados de `crypto.randomUUID()` direto pra `generateId()`.

**Status:** ✅ 5 testes cobrindo. Próximo: lint rule pra **proibir** `crypto.randomUUID` em arquivos `"use client"` (preventivo).

---

### F-04 — Bug fix #02 categoria Moto E2E — `835692c`

**Critério de aceite proposto:** já coberto por Bv2-01 (anti-regressão de UI + dados + persona + WhatsApp).

#### Cenários

1. **UI happy:** 4 cards na landing (Imóvel/Carro/Moto/4ª categoria).
2. **Persona:** `Bruno` ativo no DB para `category='moto'` (migration `0012` aplicada).
3. **Rates:** `rates.json` tem entradas para `(admin, moto)` nas 3 administradoras que ofertam moto.
4. **Whatsapp:** `formatter.ts` `RANGES.moto` tem 5 faixas; `categoryLabel.moto = "Moto"`; replace chains incluem `"moto" → "Moto"`.
5. **E2E:** clique em "Moto" no chat web → Bruno responde → gate question correta.

**Status:** ✅ 9 testes novos. Próximo: smoke E2E manual no `/admin/simulator/web`.

---

### F-05 — Local-dev workspaces — `e0a35a4`

**Não é critério de produto** — infra de desenvolvimento. **Fora deste plano.** Coberto por `~/.tb-local/CONVENTIONS.md` + skill `local-dev`.

---

## 5. Bugs recentes desta sessão

### Bug #01 — `crypto.randomUUID` polyfill

- **Sintoma:** clicar em qualquer card de categoria no chat quebrava com `TypeError: crypto.randomUUID is not a function` (DNS `.orb.local` é HTTP — não é secure context).
- **Fix:** helper `generateId()` defensivo em `src/lib/utils/id.ts`; substituição em 7 client components.
- **Testes:** 5 (secure context, fallback `randomUUID=undefined`, fallback `crypto=undefined`, unicidade 1000, todos os 7 componentes usando `generateId`).
- **Cobertura atual:** 404 → 408 passing.
- **Gap restante:** Nenhum bloqueante. Sugestão preventiva: lint rule custom Biome pra proibir `crypto.randomUUID()` em arquivos `"use client"`.

### Bug #02 — Categoria Moto E2E (UI + dados + persona)

- **Sintoma:** card "Moto" não aparecia na landing apesar do domain layer ter sido estendido em `3d53344`. Gaps em 7 lugares (`WELCOME_OPTIONS` x2, `CATEGORY_CONFIG`, grid columns, persona-identity-section admin, `rates.json`, `whatsapp/formatter.ts`, persona DB).
- **Fix:** call-sites preenchidos + migration `0012` idempotente criando persona "Bruno" specialist moto.
- **Testes:** 9 (adapter WELCOME_OPTIONS, rates de moto pras 3 administradoras, formatter moto resolveRange + rótulo).
- **Cobertura atual:** 408 passing.
- **Gap restante:** Nenhum bloqueante. Re-validado por Bv2-01.

---

## 6. Roadmap de execução (priorização)

Ordem proposta de execução pelo Dev + QA crítico, do mais bloqueante pro nice-to-have. Modelo de loop padrão: **TDD strict** (teste falhar primeiro), commit `test+fix:` por unidade.

---

### 🔴 Críticos / blockers regulatórios — DEVEM fechar antes de tudo

| Prioridade | Item | Por quê | Tipo de teste |
|---|---|---|---|
| **P0** | **Bv2-08 — investigar divergência comparativo × detalhamento Rodobens** | CDC art. 30/35/37 — preço divergente é passivo regulatório imediato; Bruna viu de novo após #11 v1 PASS | E2E Playwright + unit determinístico |
| **P0** | **Bv2-06 — implementar LLM eval para copy financeiro factual (#08 v1 residual)** | CDC art. 39 IV — adequação financeira sem dado | LLM eval env-gated 3 amostras temp=0 |
| **P0** | **Bv2-07 — verificar que `SimulationResult` é invocado no fluxo real (não só componente isolado)** | CMN 4.927/2021 — omissão de composição | E2E Playwright via `/admin/simulator/web` |
| **P1** | **Bv2-11A — LLM eval explicação primeira vez (#15 v1 residual)** | CMN 4.927/2021 — venda inadequada a novato | LLM eval env-gated |
| **P1** | **Bv2-02 — verificar veto a "IA/AI" em todas as seções da landing (não só `HowItWorks`)** | CDC art. 37 — overclaim | unit (regex) + visual |

### 🟡 Importantes — próxima onda

| Prioridade | Item | Por quê | Tipo de teste |
|---|---|---|---|
| **P2** | **Bv2-09 — fala de fechamento mencionar explicitamente "ajustar valor" + "nova simulação" + "comparar adm"** | UX direta da Bruna | LLM eval ou unit (template determinístico do prompt) |
| **P2** | **Bv2-10A — afordância "Tenho interesse" (re-validar após mudanças)** | UX — Bruna não está achando | component test + smoke visual |
| **P2** | **Bv2-10B — grep "card" em renderers novos (Letta + simulador admin user-facing)** | UX (regressão por novas surfaces) | unit (regex) |
| **P2** | **Bv2-03 — LLM eval Helena calorosa (#04 v1 residual)** | UX/produto | LLM eval env-gated |
| **P2** | **Bv2-11C — LLM eval invocação do `compare_with_financing` (#17 v1 residual)** | CDC art. 37 — comparação financeira | LLM eval env-gated |
| **P3** | **Bv2-05 — re-grep anglicismos em strings dos renderers novos** | UX (regressão) | unit (regex) |
| **P3** | **Bv2-01 + Bv2-04 — anti-regressão (já PASS, mas Bruna confirmou pedido)** | confirmação | smoke E2E ou unit já existente |
| **P3** | **F-02 smoke E2E simulador (53 CAs blocked)** | confiança | Playwright |
| **P3** | **F-01 smoke E2E Letta manual no browser** | confiança | manual + Playwright skipped tests |

### 🟢 Nice-to-have / backlog

| Prioridade | Item | Por quê |
|---|---|---|
| **P4** | **Bv2-12B — pós-venda 24h (item #18 v1)** — abrir spec de implementação após brainstorm com Bruna | feature roadmap |
| **P4** | **F-01 hardening Letta** — bucket >90d, archival cap LRU, `normalizePhoneBR` strict BR, env vazio handler | hardening produção |
| **P4** | **Lint rule custom Biome — proibir `crypto.randomUUID` em `"use client"`** | preventivo |
| **P4** | **F-02 capability "clonar conversa real → simulação"** | adoção interna |
| **P5** | **Versão em inglês do `.done/`** | clientes internacionais futuros |

---

## 7. Sign-off matrix (QA Crítico preenche)

QA Crítico marca PASS / PARTIAL / FAIL por item com **evidência** (screenshot, log, snippet, query DB). PARTIAL aceitável apenas se justificado e aprovado pelo Kairo. **0 FAIL pra GO.**

| ID | Item | Prioridade | Status | Evidência |
|---|---|---|---|---|
| Bv2-01 | Moto na landing (+ paridade WhatsApp) | P3 | [ ] | |
| Bv2-02 | "Como funciona" foca benefícios (anti-AI/IA) | P1 | [ ] | |
| Bv2-03 | Helena 1ª fala calorosa (LLM eval) | P2 | [ ] | |
| Bv2-04 | Topic picker chips + voltar | P3 | [ ] | |
| Bv2-05 | Sem anglicismos em renderers novos | P3 | [ ] | |
| Bv2-06 | Copy factual + ≥3 opções antes da sugestão | **P0** | [ ] | |
| Bv2-07 | SimulationResult 7 campos invocado no fluxo | **P0** | [ ] | |
| Bv2-08 | Comparativo × detalhamento Rodobens consistentes | **P0** | [ ] | |
| Bv2-09 | Fala fechamento menciona 3 CTAs explicitamente | P2 | [ ] | |
| Bv2-10 | Afordância "Tenho interesse" + sem "card" | P2 | [ ] | |
| Bv2-11 | Educação primeira vez + 3 cenários + comparador | P1 | [ ] | |
| Bv2-12 | Stepper 5 passos (anti-regressão) + pós-venda spec aberta | P4 | [ ] | |
| F-01 | Letta cross-channel smoke E2E | P3 | [ ] | |
| F-02 | Simulador smoke E2E (53 CAs blocked) | P3 | [ ] | |
| F-03 | crypto.randomUUID polyfill | ✅ shipped | [x] | bug #01 commit `34d6420` |
| F-04 | Categoria Moto E2E | ✅ shipped | [x] | bug #02 commit `835692c` |

### Gates globais obrigatórios

- [ ] `npm run test` total verde (sem regressão dos 408)
- [ ] `LLM_TESTS=1 npm run test` rodado ≥ 1 vez (fecha 4 PARTIAL v1: #04, #08, #15, #17)
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run lint` (Biome) sem erros novos (erro pré-existente em `src/db/schema.ts:181` aceito)
- [ ] Cada commit `test+fix:` ou `test+feat:` contém TANTO arquivo de teste QUANTO arquivo de produção
- [ ] Migrations não rodadas direto contra DB (regra global Kairo — aplicadas via container)
- [ ] Disclaimer regulatório verificado manualmente em #08 (Bv2-06), #16 (Bv2-11B), #17 (Bv2-11C)
- [ ] **0 itens com status FAIL** (PARTIAL aceitável apenas se justificado e aprovado pelo Kairo)
- [ ] Bv2-08 (regressão crítica reportada pela Bruna) tem **prova E2E Playwright** que valores batem

---

## 8. Notas finais para o QA Crítico

1. **Bv2-08 é o item mais perigoso desta v2.** Já foi reportado como fechado em v1 (#11 PASS) e a Bruna está dizendo que viu de novo. Trate como **regressão real até prova em contrário** — reproduzir com Playwright contra dados realistas (dump dev AWS já feito na sessão Letta), não confiar no teste unit que está verde.
2. **Bv2-07 é ambíguo.** A Bruna diz "não vi esses campos". Pode ser: (a) componente `SimulationResult` não está sendo invocado (agente verbaliza em texto), (b) está sendo invocado mas com campos vazios, (c) renderizando mas em local visualmente escondido. **Investigar via E2E real, não unit.**
3. **Bv2-06 + Bv2-11 + Bv2-03 fecham os 4 PARTIAL residuais da v1** (todos por LLM eval ausente). Implementar a suíte `LLM_TESTS=1` é trabalho transversal — fazer **uma vez**, plugar nos 4 itens.
4. **Não negociar critérios** pra "fechar". Item que não tiver evidência binária PASS volta como FAIL.
5. **Confronto com plano simulador (`docs/test-plans/simulador-completo.md`)**: rodar Playwright nos 53 CAs blocked — boa parte cobre indiretamente Bv2-07/Bv2-08 (smoke do simulator web reproduz a jornada do cliente).
6. **Modelo:** Opus 4.7. Rigor adversarial > velocidade. Esta v2 tem 3 P0 regulatórios — não fechar com benefício da dúvida.

---

*Documento vivo. Cada PR que fechar item dessa lista atualiza a sign-off matrix com commit hash e evidência.*
