# Test Plan — Jornada Bevi Real (descoberta self-contract + gates CPF/lance/simulador)

> **Fonte de verdade do "feito".** Critério não escrito aqui = critério não validado.
> Cada cenário REFERENCIA o passo da jornada canônica (`docs/jornada/jornada-canonica.md`,
> origem `jornada.docx`) — NUNCA critérios derivados da implementação. Divergência
> código×docx é defeito do código (regra inviolável, CONTEXT.md 2026-06-04).
>
> Escopo: a reconstrução que (1) trocou descoberta mock por **Bevi Trilho B
> self-contract** (`BeviSelfContractAdapter` por conversa), (2) inseriu o gate
> **identify** (CPF+celular+LGPD cifrado AES-256-GCM) ao fim do passo 2, (3) o gate
> **lance-value** ("Qual valor aproximado?"), (4) o **reveal na ordem do docx**
> (recomendado primeiro → simulator-offer → outras opções sob demanda → decisão),
> (5) o **LLM-as-judge da jornada** (`src/lib/eval/jornada-rubric.ts`, nightly).
>
> **Pendência externa que bloqueia parte do E2E:** D3 — sem mock, dev/E2E batem na
> Bevi real, e `create-proposal` cria proposta REAL (CPF + consulta bureau, 1 ativa
> por device). Cenários que exigem isso estão marcados **[BLOQUEADO-D3]**. O
> subconjunto executável usa **fixtures (cassettes de respostas reais)** via os seams
> `__setDiscoveryAdapterFactoryForTests` / `__setProposalGatewayForTests` e o gate
> determinístico de identidade — ver "Dados de teste" e "Estratégia de execução".

---

## 0. Referências de código (âncoras de verificação)

| Conceito | Arquivo | Símbolo / âncora |
|---|---|---|
| Ordem dos gates | `src/lib/agent/qualify-state.ts` | `nextGate()` — `experience → consent → credit → timeframe → lance → lance-value → lance-embutido → identify → search → simulator-offer → decision` |
| Decisão de mostrar gate | `src/lib/agent/qualify-state.ts` | `decideShowGate()` |
| Copy âncora dos gates | `src/lib/agent/orchestrator/gate-questions.ts` | `gateQuestion()` |
| Gate identify (web) | `gate-questions.ts` | `case "identify"` — "Com essas informações, a Aja Agora vai analisar várias administradoras…" + pedido de CPF/celular/LGPD |
| Gate identify (WhatsApp) | `src/lib/whatsapp/identify-capture.ts` | `IDENTIFY_WHATSAPP_PROMPT`, `captureIdentifyText()`, `extractCpf()`, `IDENTIFY_INVALID_CPF_REPLY`, `IDENTIFY_CONFIRMED_REPLY` |
| Gate lance-value | `gate-questions.ts` | `case "lance-value"` — "Boa! E qual valor aproximado você pensa em dar de lance?" |
| Gate lance-embutido | `gate-questions.ts` | `case "lance-embutido"` — educação prosa + "Quer considerar esse tipo de lance nas suas simulações?" |
| Gate simulator-offer | `gate-questions.ts` | `case "simulator-offer"` — "…parcelas, caso você seja contemplado em 3, 6 ou 12 meses — que tal?" |
| Identidade cifrada | `src/lib/conversation/identity.ts` | `isValidCpf()`, `encryptIdentity()` (`v1.<iv>.<tag>.<ct>` AES-256-GCM), `storeIdentity()`, `loadIdentity()`, `maskCpf()` |
| Descoberta real (adapter) | `src/lib/adapters/bevi/bevi-self-contract-adapter.ts` | `BeviSelfContractAdapter`, `IdentityNotCollectedError`, `offerCache` por `${segmento}:${valor}` |
| Cliente Trilho B | `src/lib/adapters/bevi/self-contract-client.ts` | `BeviSelfContractClient`, `SIM_RETRY=4`/`retryOn404`, `DuplicatedProposalError`, `simulate()` (offers vazio = piso) |
| Sessão de descoberta | `src/lib/bevi/discovery-session.ts` | `discoverySessionForConversation()`, `prefsFromMeta()` |
| Wiring discovery/gateway | `src/lib/adapters/index.ts` | `getDiscoveryAdapter()`, `getProposalGateway()` (`PROPOSAL_GATEWAY` default `bevi`; `"mock"` lança), seams `__set*ForTests` |
| Orquestrador reveal/decisão | `src/lib/agent/orchestrator/{index,runner,directives}.ts` | `revealCompleted`, `simulatorOfferDispatched`, `decisionDispatched`, guard reveal-loop |
| Fechamento idempotente | `src/lib/bevi/fulfillment.ts` | reuso de `proposalId` por conversa (EC-7, anti duplo-submit) |
| Tipos de artifact | `src/lib/chat/types.ts` | `ArtifactByType` union, `DECISION_PROMPT_OPTIONS`, `DECISION_PROMPT_QUESTION` |
| Metadata da conversa | `src/lib/agent/personas.ts` | `ConversationMetadata` — `identityCollected`, `identityEnc`, `qualifyAnswers.{hasLance,lanceValue,lanceEmbutido,lanceEmbutidoPercent}`, `searchDispatched`, `revealCompleted`, `simulatorOfferDispatched`, `decisionDispatched`, `recommendedAdministradora` |
| Rubric LLM-judge | `src/lib/eval/jornada-rubric.ts` | `JORNADA_RUBRIC_VERSION`, `jornadaJudgeResultSchema` (passo1..passo5 + tom + flags) |

**DB (fonte de estado verificável):**
- `conversations.metadata` (jsonb) — guarda TODO o estado do funil (campos acima). **NÃO armazena CPF em claro** — só `identityEnc` (blob AES-256-GCM) e `identityCollected: true`.
- `bevi_proposals` — estado do FECHAMENTO real (passo 5): `proposalId`, `ofertaId`, `offerExpiresAt`, snapshot da oferta (`administradora`, `grupo`, `creditValue`, `monthlyPayment`), links de assinatura/documentos. **Sem CPF.**
- `artifacts` (`type` text + `payload` jsonb) — cada card emitido. Cross-check de `type` contra `ArtifactType`.

---

## 1. Pré-requisitos de ambiente

| Var | Obrigatória pra | Como obter / valor | Falha esperada se ausente |
|---|---|---|---|
| `IDENTITY_ENC_KEY` | Cifrar/decifrar CPF (gate identify, todos os fluxos) | `openssl rand -base64 32` (32 bytes em base64) | `identity.ts` lança `KEY_ERROR` ("IDENTITY_ENC_KEY ausente ou inválida… gere com openssl rand -base64 32") — falha alto, sem fallback |
| `BEVI_SELFCONTRACT_HASH` | Descoberta real (Trilho B) — `create-proposal`/`simulate` | hash público da loja-piloto Bevi (vem na URL da loja). **Homologação = pendência D3.** | `loadSelfContractConfigFromEnv()` lança `BeviConfigError` ("exige BEVI_SELFCONTRACT_HASH… dado mockado é PROIBIDO") |
| `BEVI_SELFCONTRACT_BASE_URL` | Base do Trilho B | opcional; default `https://core-production-selfcontract-atsb7.ondigitalocean.app` | usa default |
| `BEVI_API_TOKEN` | Fechamento real (passo 5, API de Parceiro) | token da loja-piloto (Trilho A) | `BeviApiAdapter` falha alto sem token |
| `PROPOSAL_GATEWAY` | Seleção de gateway de fechamento | default `bevi`; `"mock"` **lança** (removido); `__setProposalGatewayForTests` injeta dublê em teste | `"mock"` → erro explícito; valor desconhecido → erro |
| `AJA_DEBUG_MEMORY` | (opcional) inspeção de hint de memória via SQL em E2E | `1` apenas em E2E | hint não populado |

**Pendência D3 (Bevi) — bloqueia E2E contra real:**
- Falta **loja/hash de homologação** OU **CPF de teste autorizado** pela Bevi pro Trilho B. Sem isso, `create-proposal` cria proposta REAL com consulta de bureau e regra de **1 proposta ativa por device** (`DuplicatedProposalError`).
- O **transporte do fingerprint de device** (FingerprintJS na app oficial) está mascarado nas capturas — validação ao vivo do "Duplicated Hash" como retomada está **pendente** (`self-contract-client.ts` cabeçalho).
- **Até D3 resolvido:** todo cenário que exige uma chamada de rede REAL ao `create-proposal`/`simulate`/`choose-offer` da Bevi é **[BLOQUEADO-D3]**. Validar via fixtures/seams.

**Dívidas de config detectadas (corrigir antes de declarar "feito" — não bloqueiam testes com fixture, mas enganam quem sobe o ambiente):**
- `.env.example` ainda diz `ADMINISTRADORA_ADAPTER=mock` / "Valid values: mock" — **stale**: runtime não usa mais mock (mock dir deletado; `PROPOSAL_GATEWAY="mock"` lança). Deve documentar `IDENTITY_ENC_KEY`, `BEVI_SELFCONTRACT_HASH`, `BEVI_API_TOKEN`, `PROPOSAL_GATEWAY=bevi`.
- `docker-compose.yml` ainda tem `PROPOSAL_GATEWAY: ${PROPOSAL_GATEWAY:-mock}` — default `mock` faria o container **lançar** no primeiro fechamento. Deve ser `:-bevi` + injetar `IDENTITY_ENC_KEY`/`BEVI_SELFCONTRACT_HASH`.

---

## 2. Dados de teste

### 2.1 Identidade sintética (DV-válida) — APENAS fixtures/seam
- **CPF:** `52998224725` (DV módulo-11 válido; passa em `isValidCpf`). **PROIBIDO** usar contra Bevi real sem D3 — geraria proposta real + consulta de bureau de um CPF de terceiro.
- Variantes pra edge cases:
  - CPF DV-inválido: `11111111111` (rejeitado por `/^(\d)\1{10}$/`) e `52998224724` (último DV errado).
  - CPF curto/longo: `5299822472` (10 díg), `529982247250` (12 díg).
- **Celular:** web → coletado no form; WhatsApp → derivado do `waId` via `waIdToCelular` (ex.: `5562999887766` → `62999887766`).

### 2.2 Fixtures (cassettes de respostas reais da Bevi)
- `src/lib/adapters/bevi/__fixtures__/*.json` — capturas reais do Trilho B (~68 campos), mapeadas por `offer-mapper.ts`. **São fixtures de TESTE, nunca runtime** (D2).
- Cassettes de trajetória do agente: `tests/regression/agent-trajectory.test.ts` (`MockLanguageModelV2` + `simulateReadableStream`) — determinístico, zero Anthropic.

### 2.3 Seams de injeção (caminho executável sem D3)
- `__setDiscoveryAdapterFactoryForTests(factory)` — injeta adapter que serve ofertas de fixture em vez de bater na Bevi.
- `__setProposalGatewayForTests(gateway)` — injeta dublê de fechamento (`tests/helpers/mock-proposal-gateway`).
- `storeIdentity(conversationId, {cpf, celular})` — popula `identityCollected: true` + `identityEnc` direto (setup via lib, **nunca via UI**), respeitando a regra E2E "setup via API".

### 2.4 Personas do eval (Camada 3)
- Helena / Rafael / Bruno / Camila × web/WhatsApp (`tests/eval/agent-flow.eval.test.ts`, `jornada-rubric.ts`). Nightly, não bloqueia PR.

---

## 3. Estratégia de execução (mapa de bloqueio)

| Camada | Roda em | Bloqueado por D3? | Cobre |
|---|---|---|---|
| **C1 Structural** (`src/**/*.test.ts`) | todo PR (<1s) | **Não** | gate order, copy âncora, schema, validação CPF, cifragem, env-guards |
| **C2 Trajectory** (`tests/regression/agent-trajectory.test.ts`) | todo PR (<30s) | **Não** | comportamento exato do agente via cassette + seams (reveal-loop, simulator-offer, outras-opções, meta-narrativa) |
| **C2 Integration** (`*.integration.test.ts` + seams) | todo PR | **Não** (usa fixture) | adapter discovery, fulfillment idempotente, offers-vazio, 404-race |
| **E2E web (Playwright)** com seam de discovery | sob demanda | **Parcial** — só com `__setDiscoveryAdapterFactoryForTests` (fixture) | jornada 1→4 UI completa, gates renderizados, artifacts no DOM |
| **E2E contra Bevi REAL** | — | **SIM — [BLOQUEADO-D3]** | `create-proposal`/`simulate`/`choose-offer` ao vivo (passo 5 fechando proposta real) |
| **C3 LLM-judge** (`tests/eval/`) | nightly cron | usa fixture/seam | fidelidade por passo + tom |

> Regra: **E2E pedido = E2E que passa.** O subconjunto executável (web com seam de discovery + fixtures) DEVE rodar e passar no Playwright. Só o passo-5-contra-Bevi-real é legitimamente impossível até D3 — explicar a impossibilidade técnica concreta (cria proposta real + consulta bureau), nunca "valida manual".

---

## P0 — Happy path (docx completo, web)

### P0.1 — Jornada completa COM lance e lance embutido (web) — passos 1→4
**Refs jornada:** P1 (entender necessidade), P2 (entender cliente: experiência → valor → prazo → lance → **lance-value** → **lance-embutido** → **identify**), P3 (buscar alternativas), P4 (recomendado em destaque → simulador 3/6/12 → decisão).
**Setup:** conversa web nova; discovery via seam com fixture que retorna ≥3 ofertas; `IDENTITY_ENC_KEY` setada. CPF DV-válido injetado no gate identify (form web).

**Passos & copy âncora esperada (binário — a frase do docx DEVE aparecer):**
1. P1: agente acolhe + botões Imóvel/carro/moto + pergunta o nome. **PASS** se artifact `quick_reply`/`topic_picker` com as 3 categorias E pergunta de nome.
2. P2 experiência: "Você já fez consórcio antes?" (`gateQuestion("experience")`).
3. P2 valor: seletor de crédito (`value_picker`) renderizado. `qualifyAnswers.creditMax` setado no meta.
4. P2 prazo: pergunta de timeframe da categoria (`TIMEFRAME_QUESTIONS`). `qualifyAnswers.prazoMeses` setado.
5. P2 lance: "Você teria uma reserva pra dar um lance…" Usuário responde **Sim** → `qualifyAnswers.hasLance="yes"`.
6. P2 **lance-value**: **"Boa! E qual valor aproximado você pensa em dar de lance?"** Usuário responde valor → `qualifyAnswers.lanceValue` setado (NUNCA derivado silencioso).
7. P2 **lance-embutido**: educação em prosa contendo "lance embutido" + "carta de R$ 100 mil" + termina com "Quer considerar esse tipo de lance nas suas simulações?". Opt-in → `qualifyAnswers.lanceEmbutido=true` (+ `lanceEmbutidoPercent` se aplicável).
8. P2→P3 **identify**: copy "Com essas informações, a Aja Agora vai analisar várias administradoras…" + pedido de CPF/celular/LGPD. Usuário envia CPF DV-válido + celular. `conversations.metadata.identityCollected=true` E `identityEnc` presente E **CPF em claro NÃO está no metadata**.
9. P3: "Encontramos boas opções para o seu perfil." Descoberta dispara `searchGroups` no adapter com `embeddedPercentage` derivado do opt-in (`prefsFromMeta`).
10. P4 reveal: **PRIMEIRO** `recommendation_card` (maior score, destaque) + `simulation_result` (detalhamento). `comparison_table` **NÃO** aparece neste turno. `metadata.revealCompleted=true`, `recommendedAdministradora` setada.
11. P4 simulator-offer: "…contemplado em 3, 6 ou 12 meses — que tal?" emitida. `metadata.simulatorOfferDispatched=true`. Aceite → `contemplation_dial` (simulador do Bernardo) com marcos 3/6/12.
12. P4 decisão: card `decision_prompt` "Esse plano faz sentido pra você?" com as 3 opções fixas de `DECISION_PROMPT_OPTIONS`. `metadata.decisionDispatched=true`.

**Critérios de aceite (binários):**
- [ ] AC-P0.1-a: gates emitidos NA ORDEM do `nextGate` (passo 5→6→7→8 acima) — nenhum pulado, nenhum repetido.
- [ ] AC-P0.1-b: `lance-value` apareceu (frase exata) e `qualifyAnswers.lanceValue` é o valor do USUÁRIO. **FAIL** se o valor foi derivado (ex.: 30% silencioso).
- [ ] AC-P0.1-c: gate `lance-embutido` apareceu ANTES de `identify`, e `identify` ANTES de `search` (nenhuma descoberta antes de `identityCollected`).
- [ ] AC-P0.1-d: pós-identify, `metadata.identityCollected=true` e `identityEnc` decifra (via `loadIdentity`) pro CPF/celular corretos; **`JSON.stringify(metadata)` NÃO contém os 11 dígitos do CPF em claro**.
- [ ] AC-P0.1-e: reveal = `recommendation_card` em destaque PRIMEIRO; `comparison_table` ausente no turno do reveal.
- [ ] AC-P0.1-f: `simulator-offer` emitido depois do reveal e ANTES do `decision_prompt`; aceite produz `contemplation_dial`.
- [ ] AC-P0.1-g: `decision_prompt` traz exatamente as 3 opções de `DECISION_PROMPT_OPTIONS` (labels exatas).
- [ ] AC-P0.1-h: chat respondeu cada turno em **< 3s** (artifact ofertas vem do cache `offerCache` após 1ª simulação).
- **Output esperado:** artifacts em ordem `value_picker → … → recommendation_card → simulation_result → contemplation_dial → decision_prompt`; `metadata` final com todos os guards (`searchDispatched, revealCompleted, simulatorOfferDispatched, decisionDispatched = true`).
- **Execução:** C2 cassette + integration com seam de discovery (fixture ≥3 ofertas). E2E web com seam. **Passo 5 (fechar proposta) = [BLOQUEADO-D3].**

### P0.2 — Jornada completa SEM lance (web) — pula lance-value e lance-embutido
**Refs jornada:** mesma P1→P4, mas P2 lance = **Não** (ou Talvez).
**Setup:** igual P0.1; usuário responde lance="no" (ou "maybe").
**Critérios:**
- [ ] AC-P0.2-a: com `hasLance="no"`/`"maybe"`, `nextGate` **PULA** `lance-value` e `lance-embutido` e vai direto pra `identify` (ref `qualify-state.ts` linhas 48-51). **FAIL** se pedir valor de lance.
- [ ] AC-P0.2-b: `prefsFromMeta` produz `embeddedPercentage: undefined` → `simulate` chamado **sem** `embeddedPercentage`. Verificar no body da chamada (seam/spy).
- [ ] AC-P0.2-c: reveal, simulator-offer e decision idênticos ao P0.1 (mesmos artifacts/copy).
- **Output:** sem artifacts/copy de lance-value nem lance-embutido; restante igual P0.1.
- **Execução:** C1 (gate-skip) + C2 cassette + E2E web com seam.

### P0.3 — Identidade já coletada não re-pergunta (continuidade web↔WhatsApp)
**Refs jornada:** P2/P3 — uma vez dada a identidade, a jornada segue sem re-pedir CPF.
**Setup:** `storeIdentity` já populou `identityCollected=true`; usuário avança.
**Critérios:**
- [ ] AC-P0.3-a: `nextGate` retorna `search` (não `identify`) quando `identityCollected=true` + qualify completo. Gate identify NÃO re-emite.
- [ ] AC-P0.3-b: WhatsApp — `captureIdentifyText` retorna `{handled:false}` quando `meta.identityCollected` já true (não re-captura).
- **Execução:** C1 + C2.

---

## P1 — Edge cases

### P1.1 — CPF inválido no gate identify (web) — [parcial: validação local, sem D3]
**Refs jornada:** P2 fim (identify, D1).
**Setup:** gate identify ativo; usuário envia CPF DV-inválido (`52998224724` / `11111111111` / 10-díg).
**Critérios:**
- [ ] AC-P1.1-a: `isValidCpf` retorna `false` para todos os inválidos; `metadata.identityCollected` permanece `false`; **`identityEnc` NÃO gravado**.
- [ ] AC-P1.1-b: a descoberta NÃO dispara (gate continua `identify`); nenhuma chamada `create-proposal` é feita.
- [ ] AC-P1.1-c: usuário recebe pedido pra reenviar (não trava, não avança). **FAIL** se aceitar CPF inválido e seguir pra search.
- **Output:** `metadata.identityCollected=false`, sem `identityEnc`, gate ainda `identify`.
- **Execução:** C1 (`isValidCpf`) + C2 cassette + E2E web com seam. (Não toca Bevi → executável.)

### P1.2 — Valor abaixo do piso da Bevi → offers vazio (sem inventar dado)
**Refs jornada:** P3 (buscar alternativas) — quando NÃO há opção real, não pode mockar.
**Setup:** seam/fixture que faz `simulate()` retornar `offers: []` (piso de crédito = 200, doc do cliente).
**Critérios:**
- [ ] AC-P1.2-a: `searchGroups` retorna `[]` (sem grupos fictícios). **FAIL** se aparecer qualquer card de grupo inventado.
- [ ] AC-P1.2-b: o agente comunica ausência de opção / pede ajuste de valor — NÃO emite `recommendation_card`/`comparison_table` com dado fabricado. `metadata.revealCompleted` permanece `false`.
- [ ] AC-P1.2-c: nenhum artifact de oferta persistido em `artifacts` neste turno.
- **Output:** zero artifacts de grupo; copy de "não encontrei na faixa, quer ajustar?".
- **Execução:** C2 cassette + integration com seam (offers vazio). Executável sem D3.

### P1.3 — Recusa do simulador (simulator-offer "não")
**Refs jornada:** P4 — simulador é OFERECIDO, não imposto.
**Setup:** pós-reveal; `simulator-offer` emitido; usuário recusa.
**Critérios:**
- [ ] AC-P1.3-a: `metadata.simulatorOfferDispatched=true` (oferta feita 1×), mas **nenhum** `contemplation_dial` emitido.
- [ ] AC-P1.3-b: fluxo avança pro `decision_prompt` ("Esse plano faz sentido?") sem re-oferecer simulador.
- [ ] AC-P1.3-c: nenhum re-reveal (guard reveal-loop ativo).
- **Execução:** C2 cassette.

### P1.4 — "Quero ver outras opções" → surfacing determinístico das outras 2 ofertas REAIS
**Refs jornada:** P4 — "Permitir ver outras opções (as outras 2) pra comparação simples."
**Setup:** pós-decision; usuário clica "Quero ver outras opções" (`DECISION_PROMPT_OPTIONS[1]`).
**Critérios:**
- [ ] AC-P1.4-a: aparece `comparison_table` com as **outras 2 ofertas reais** (do `offerCache` da mesma conversa) — NÃO recomeça a coleta, NÃO re-simula do zero.
- [ ] AC-P1.4-b: as ofertas são as REAIS já carregadas (mesmos `quotaId`/administradoras da descoberta), não dados novos inventados.
- [ ] AC-P1.4-c: NÃO re-dispara `recommendation_card`/`search_groups` (guard reveal-loop) — só o comparativo sob demanda.
- **Output:** 1 artifact `comparison_table` com ≥2 grupos; sem novo `recommendation_card`.
- **Execução:** C2 cassette + E2E web com seam (fixture ≥3 ofertas).

### P1.5 — WhatsApp: captura textual de CPF
**Refs jornada:** P2 fim (identify) — no WhatsApp celular = waId, falta só CPF textual.
**Setup:** conversa WhatsApp no gate identify; usuário envia texto contendo CPF.
**Critérios:**
- [ ] AC-P1.5-a: `IDENTIFY_WHATSAPP_PROMPT` enviada (contém "me envia seu *CPF*" + LGPD + "Seu celular eu já tenho daqui do WhatsApp").
- [ ] AC-P1.5-b: CPF DV-válido em texto livre (com pontuação ou só dígitos) → `extractCpf` extrai; `storeIdentity` grava com `celular = waIdToCelular(waId)` (sem DDI `55`); resposta = `IDENTIFY_CONFIRMED_REPLY`.
- [ ] AC-P1.5-c: número longo mas DV-inválido (`looksLikeCpfAttempt` true) → `outcome:"invalid"`, resposta `IDENTIFY_INVALID_CPF_REPLY`, `identityCollected` permanece false.
- [ ] AC-P1.5-d: texto sem cara de CPF → `{handled:false}` (deixa o turno seguir pro agente).
- [ ] AC-P1.5-e: `metadata` resultante não contém CPF em claro (só `identityEnc`).
- **Execução:** C1 (`extractCpf`/`waIdToCelular`/`looksLikeCpfAttempt`) + integration `identify-capture`.

### P1.6 — Lance "Talvez" / valor de lance ausente
**Refs jornada:** P2 — opções de lance "Sim / Não / Talvez".
**Critérios:**
- [ ] AC-P1.6-a: `hasLance="maybe"` NÃO dispara `lance-value` nem `lance-embutido` (só `"yes"` dispara — `qualify-state.ts` 48,51). Vai pra `identify`.
- **Execução:** C1.

---

## P2 — Regressões prováveis

### P2.1 — Reveal-loop (BUG-REVEAL-LOOP 2026-06-02) NÃO volta
**Refs jornada:** P4 — recomendação aparece UMA vez; afirmativo curto não re-renderiza cards.
**Contexto:** `docs/test-plans/2026-06-02-jornada-bevi-reveal-loop.md`. Após reveal, "ta otimo"/"show"/"bora" re-disparava `comparison_table`/`recommendation_card` em loop.
**Setup:** `metadata.revealCompleted=true`; usuário envia afirmativo curto neutro.
**Critérios:**
- [ ] AC-P2.1-a: nenhum re-emit de `search_groups`, `recommend_groups`, `simulate_quota`, `present_comparison_table`, `present_recommendation_card`, `present_simulation_result` (guard `runner.ts` suprime `isRereveal`).
- [ ] AC-P2.1-b: fluxo cruza pro `simulator-offer`/`decision` (não fica preso).
- [ ] AC-P2.1-c: log `[reveal-loop] guard: suprimindo …` quando supressão ocorre.
- **Execução:** **C2 cassette obrigatório** (cassette do bug real) + C1 (assert do guard em `runner.ts`).

### P2.2 — Duplo-submit do contrato NÃO cria 2 propostas (EC-7)
**Refs jornada:** P5 (contratar) — uma proposta por conversa.
**Setup:** dublê de gateway via `__setProposalGatewayForTests`; chamar fechamento 2× na mesma conversa.
**Critérios:**
- [ ] AC-P2.2-a: 2ª chamada REUSA `existing.proposalId` (não chama `createProposal` de novo); só re-simula/atualiza (`fulfillment.ts` EC-7).
- [ ] AC-P2.2-b: `bevi_proposals` tem **1 linha** por conversa (não 2). `proposalId` estável.
- **Execução:** C2 integration (`fulfillment.integration.test.ts`) com dublê. **Contra Bevi real = [BLOQUEADO-D3].**

### P2.3 — Meta-narrativa do mecanismo (proibido vazar engine ao usuário)
**Refs jornada:** tom da escritora — usuário não percebe "mudou de empresa"/"chamei a tool X".
**Critérios:**
- [ ] AC-P2.3-a: nenhuma resposta menciona nomes de tool (`search_groups`, `present_*`, `choose_offer`), "gate", "metadata", "adapter", "self-contract", "fingerprint".
- [ ] AC-P2.3-b: educação de lance embutido vem em prosa (sem jargão de engine) — `lance-embutido` copy.
- **Execução:** **C2 cassette** (detector regex de termos proibidos no texto do agente) + C1 (assert que copy âncora não contém termos de engine).

### P2.4 — `PROPOSAL_GATEWAY="mock"` e descoberta sem hash falham ALTO (mock não ressuscita)
**Refs jornada:** regra D2 — mock de runtime morto.
**Critérios:**
- [ ] AC-P2.4-a: `getProposalGateway()` com `PROPOSAL_GATEWAY="mock"` **lança** (mensagem "foi REMOVIDO").
- [ ] AC-P2.4-b: `BeviSelfContractClient` sem `BEVI_SELFCONTRACT_HASH` lança `BeviConfigError` (sem fallback fictício).
- [ ] AC-P2.4-c: `searchGroups` sem identidade lança `IdentityNotCollectedError` (tripwire) — NÃO cai em dado inventado.
- [ ] AC-P2.4-d: `loadKey()` sem `IDENTITY_ENC_KEY` lança `KEY_ERROR`.
- **Execução:** C1 (todos executáveis sem D3).

---

## 4. Pontos de falha conhecidos do domínio (vigiar em cada cenário)

| Falha | Onde | Mitigação no código | Validação no teste |
|---|---|---|---|
| **404 transitório da simulação** | `self-contract-client.simulate()` | `retryOn404` + `SIM_RETRY=4` × `SIM_RETRY_DELAY_MS=400` | Fixture/seam que devolve 404 nas N-1 primeiras tentativas e offers na N-ésima → asserta que retorna offers (não erro). **FAIL** se 1 único 404 já propaga erro ao usuário. |
| **1 proposta ativa por device** (fingerprint TBD) | `simulate`/`createProposal` (Trilho B) + fulfillment EC-7 | `DuplicatedProposalError` tratado como **retomada** (não fatal) no adapter; transporte do fingerprint pendente (D3) | C2: seam que lança `DuplicatedProposalError` → adapter segue (proposalReady=true). Validação ao vivo = **[BLOQUEADO-D3]**. |
| **Latência > 3s do chat** | reveal/simulação | `offerCache` por `${segmento}:${valor}` (1ª simulação cacheia) | Medir tempo por turno no E2E; reveal repetido (mesmo valor) deve vir do cache. |
| **Cache de ofertas por (segmento, valor)** desatualizado | `offerCache`/`offerIndex` | índice `quotaId→oferta` pra `simulateQuota`/`getGroupDetails` O(1) | Mudar valor/segmento → nova chave de cache → nova simulação; `simulateQuota` de `quotaId` expirado lança "refaça a busca". |
| **Oferta expirada (30min)** | `bevi_proposals.offerExpiresAt` (passo 5) | re-simular antes do `choose_offer` | C2 fulfillment: `offerExpiresAt` no passado → re-simula antes de `chooseOffer`. |
| **CPF vazando em claro** | `conversations.metadata` | só `identityEnc` (AES-256-GCM) + `identityCollected` | Em TODO cenário com identify: assert `metadata` jsonb não contém os 11 dígitos. |

---

## 5. Definição de "FEITO" (gate de saída)

Feature está **feita** quando:
1. **Todos** os AC de P0.1, P0.2, P0.3 verdes (subconjunto executável: C2 + integration com seam + E2E web com seam de discovery).
2. **Todos** os AC de P1 e P2 verdes nas camadas executáveis (C1/C2/integration/E2E-web-seam).
3. Cassettes de regressão (P2.1, P2.3) commitados em `tests/regression/agent-trajectory.test.ts`.
4. Cenários **[BLOQUEADO-D3]** explicitamente listados como pendentes com a razão técnica (não como "passou manual"):
   - **P0.1 passo 12 / passo 5 fechamento contra Bevi real** (cria proposta real + bureau).
   - **P2.2 contra Bevi real** (1-ativa-por-device ao vivo).
   - **404-race e Duplicated-Hash ao vivo** (validação do fingerprint).
5. C3 (LLM-judge `jornada-rubric`) rodando nightly com `fechouEmLeadEmVezDeContrato=false` e `pulouPasso=false` nos cenários canônicos (relatório, não gate de PR).

**Não negociar critério pra "fechar".** D3 não vira "ok manual" — quando a Bevi liberar hash/CPF de homologação, os cenários [BLOQUEADO-D3] viram E2E real obrigatório e ESTE plano é a fonte do que eles validam.
