# Plano de Teste — "A Jornada Aja Agora" (passos 1→5) + fix BUG-REVEAL-LOOP

- **Feature/slug:** `jornada-bevi-reveal-loop`
- **Data:** 2026-06-02
- **Autor:** PO Lead (skill QA sênior)
- **Branch/workspace:** `feat/jornada-bevi-lance-embutido`
- **Ambiente de validação:** `http://aja-feat-jornada-bevi-lance-embutido.orb.local` (`PROPOSAL_GATEWAY=mock` — não cria proposta real na Bevi)
- **Fonte de verdade do "feito":** este documento. Critério não-escrito = critério não-validado. Todo critério é **binário** (PASS/FAIL), não "deveria".

> **Regra de leitura:** quando o critério diz "exatamente 1 vez", contar artifacts emitidos no stream OU linhas em `artifacts` (DB) — repetição = FAIL. Quando diz "tom do docx", validar contra as frases canônicas listadas na seção 8, não contra paráfrase livre.

---

## 0. Mapa do escopo vs docx

| Passo docx | Nome | No escopo? | Artefato-âncora |
|---|---|---|---|
| 1 | Entender a necessidade | Sim (P0) | categoria + `save_contact_name` |
| 2 | Entender o cliente (qualify + educação) | Sim (P0) | gates `experience→consent→credit→timeframe→lance→lance-embutido` |
| 3 | Buscar alternativas | Sim (P0) | `search_groups` → `comparison_table`/`group_card` |
| 4 | Avaliar, simular e definir (reveal + decisão) | Sim (P0) | `recommendation_card` + `simulation_result` + `contemplation_dial` + `decision_prompt` |
| 5 | Contratar (Bevi/AGX) | Sim (P0) | `contract_form` → `real_offer` → `signature_handoff` + `document_upload`; DB `bevi_proposals` |
| 6 | Concluir | **Fora** (mensagem de fechamento já no passo 5) | — |
| 7 | Pós-venda | **Fora** | — |

**Contratar (passo 5) = fim da ficha.** Pós-venda não é validado aqui.

---

## 1. Pré-requisitos e dados de teste

### 1.1 Ambiente (gate de entrada — tudo PASS antes de qualquer cenário)

| # | Pré-requisito | Verificação | Critério binário |
|---|---|---|---|
| PR-1 | Stack do workspace UP | `orb status` + container `aja-app-feat-jornada-bevi-lance-embutido` running | App responde 200 em `http://aja-feat-jornada-bevi-lance-embutido.orb.local` |
| PR-2 | Gateway em mock | env do container | `PROPOSAL_GATEWAY=mock` (NÃO `bevi`) — confirma que nenhuma proposta real é criada |
| PR-3 | DB acessível | `psql -U postgres -d aja_agora -c "select 1"` no container `aja-pg-feat-jornada-bevi-lance-embutido` | Retorna `1` |
| PR-4 | Tabela de fulfillment existe | `\d bevi_proposals` | Tabela presente com colunas `proposal_id`, `consortium_proposal_link`, `proposal_status`; **SEM coluna `cpf`** (LGPD-mínimo) |
| PR-5 | Seeds de persona/grupos | personas `rafael-auto` ativa; grupos auto mockados disponíveis | `search_groups(category=auto)` retorna ≥2 grupos |
| PR-6 | Migrations aplicadas via container | migration 0022 no histórico do app | `proposal_status` aceita `simulacao`/`documentos` |

### 1.2 Persona/dados canônicos do happy path

- **Canal:** web (default). WhatsApp coberto na seção 6.
- **Categoria:** auto → persona `rafael-auto`.
- **Nome:** "Rafael".
- **Experiência:** primeira vez (`experiencePrev="first"`) → dispara a educação completa do docx.
- **Crédito:** ~R$ 100.000 (`creditMax=100000`), parcela ~R$ 1.600 (`monthlyBudget=1600`).
- **Prazo:** "o mais rápido possível" (`prazoMeses=0` → `objetivo="contemplacao_rapida"`).
- **Lance:** "Sim, tenho reserva" (`hasLance="yes"`) → passa pelo gate **lance-embutido** → opt-in `lanceEmbutido=true`.
- **CPF teste (passo 5):** `12345678909` (válido p/ mock; só dígitos).
- **Celular teste:** `11999990000`.

---

## 2. Fluxos críticos P0 — passos 1→5 (1 critério binário por passo)

### P0-1 — Passo 1: Entender a necessidade (categoria + nome)

**Setup:** abrir chat anônimo; usuário: "quero comprar um carro".

| ID | Critério de aceite (binário) | Output esperado |
|---|---|---|
| P0-1.a | Transição roteia pra categoria `auto` e persona vira `rafael-auto` | `meta.currentCategory="auto"`, `meta.currentPersona="rafael-auto"` |
| P0-1.b | Agente reage em ≤1 frase + pergunta o nome **antes** de qualquer gate de qualificação | resposta contém pergunta de nome; **nenhum** gate `experience/consent/credit` no mesmo turno |
| P0-1.c | Usuário responde "Rafael" → `save_contact_name` chamado e `conversations.contactName="Rafael"` | DB: `contactName='Rafael'` (não NULL) |
| P0-1.d | Agente NÃO vaza mecânica de UI (proibido "botões", "sistema", "menu", "perguntas rápidas") | resposta sem nenhum termo proibido (seção 8.4) |

### P0-2 — Passo 2: Entender o cliente (qualify + educação de primeira vez)

**Setup:** pós-nome, primeira vez.

| ID | Critério de aceite (binário) | Output esperado |
|---|---|---|
| P0-2.a | Gate `experience` dispara 1 vez; ao escolher "primeira vez", agente entrega explicação educativa | texto cobre: sem juros, sorteio/lance, grupo, **≠ financiamento** (seção 8.1) |
| P0-2.b | Ordem dos gates respeitada: `experience → consent → credit → timeframe → lance → lance-embutido` | nenhum gate fora de ordem; `consent` aparece exatamente 1 vez |
| P0-2.c | `hasLance="yes"` ⇒ gate **lance-embutido** dispara com o texto educativo do docx (própria carta de crédito) | gate `lance-embutido` presente; texto contém "parte da própria carta de crédito" |
| P0-2.d | `hasLance` ∈ {`maybe`,`no`} ⇒ gate lance-embutido é **pulado** | nextGate vai direto pra `search` |
| P0-2.e | Ao fim do qualify, `meta.qualifyAnswers` tem `creditMax`, `prazoMeses`, `objetivo`, `hasLance`, `lanceEmbutido` preenchidos | todos os 5 campos != undefined |

### P0-3 — Passo 3: Buscar alternativas (reveal abre)

**Setup:** qualify completo; usuário confirma avanço ("bora").

| ID | Critério de aceite (binário) | Output esperado |
|---|---|---|
| P0-3.a | Sistema dispara o **search summary directive** (server turn) exatamente 1 vez; `meta.searchDispatched=true` | `searchDispatched=true` após o turno; directive não re-dispara |
| P0-3.b | `search_groups(category=auto, creditMax=100000)` chamado e ≥2 grupos viram `comparison_table` (não texto corrido) | 1 artifact `comparison_table` com ≥2 grupos; **0** descrição de números em texto |
| P0-3.c | Texto introdutório espelha o perfil sem despejar números por grupo | resposta menciona faixa/prazo, sem parcela/taxa específica por grupo em prosa |

### P0-4 — Passo 4: Avaliar, simular e definir (reveal completo + card de decisão)

**Setup:** continuação de P0-3 (mesmo turno do reveal).

| ID | Critério de aceite (binário) | Output esperado |
|---|---|---|
| P0-4.a | Reveal completo: `recommendation_card` (1, destacado) emitido junto da comparação | exatamente 1 `recommendation_card` |
| P0-4.b | `meta.revealCompleted=true` e `meta.recommendedAdministradora` preenchida após o reveal | ambos setados no DB meta |
| P0-4.c | Próximo afirmativo do usuário ("faz sentido") ⇒ sistema dirige `present_decision_prompt` **exatamente 1 vez** | 1 artifact `decision_prompt`; `meta.decisionDispatched=true` |
| P0-4.d | Card de decisão traz a pergunta canônica + 3 opções fixas | "Esse plano faz sentido pra você?" + ["Sim, quero contratar agora","Quero ver outras opções","Quero falar com um especialista"] |
| P0-4.e | (opcional do fluxo) Simulador-agulha: se usuário pede "quando sou contemplado", `contemplation_dial` aparece 1 vez com disclaimer | 1 artifact `contemplation_dial`; rodapé com "Estimativa... não é garantida" |

### P0-5 — Passo 5: Contratar (fechamento Bevi via mock)

**Setup:** clicar "Sim, quero contratar agora" no card de decisão.

| ID | Critério de aceite (binário) | Output esperado |
|---|---|---|
| P0-5.a | Agente chama `present_contract_form` 1 vez; CPF **nunca** é pedido por texto livre | 1 artifact `contract_form`; nenhuma frase pedindo CPF na prosa (web) |
| P0-5.b | Submeter CPF `12345678909` + celular + LGPD ⇒ `startContract` cria proposta e emite `real_offer` 1 vez | 1 artifact `real_offer` com `administradora/grupo/creditValue/monthlyPayment`; texto "Confirmei com a {admin}" |
| P0-5.c | DB: 1 linha em `bevi_proposals` com `proposal_status='simulacao'`, `conversation_id` correto, **sem CPF persistido** | `select count(*)`=1; coluna cpf inexistente; `administradora`/`grupo` preenchidos |
| P0-5.d | Confirmar oferta (`offer-confirm`) ⇒ `signature_handoff` + `document_upload` emitidos (1 cada) | 2 artifacts; `signature_handoff.consortiumProposalLink` não-vazio |
| P0-5.e | DB pós-confirm: `proposal_status='documentos'`, `consortium_proposal_link` e `documents_link_personal` preenchidos | linha atualizada; ambos os links != NULL |
| P0-5.f | Reforço de marca do docx presente no `signature_handoff` | texto contém "escolhida pela Aja Agora" **e** "até a contemplação" |
| P0-5.g | Upload de documento (`document-upload`) ⇒ resposta "ficha está completa"; "pular" também encerra sem erro | upload OK fecha a ficha; skip mostra "documentos são opcionais" |

---

## 3. Regressão BUG-REVEAL-LOOP (P0 — bloqueia merge)

**Bug original:** pós-reveal, cada afirmativo curto re-disparava o reveal inteiro e nunca cruzava pro card de decisão.

**Setup comum:** conversa em estado `revealCompleted=true, searchDispatched=true` (qualify + reveal já feitos), persona `rafael-auto`.

| ID | Cenário | Critério de aceite (binário — "sem loop") |
|---|---|---|
| BRL-1 | Usuário diz "ta otimo" (afirmativo neutro) | **0** artifacts `comparison_table`/`recommendation_card`/`group_card` novos neste turno; **1** `decision_prompt` aparece (via sistema) |
| BRL-2 | Usuário diz "bora" (ready_to_proceed) | idem BRL-1: nenhum card de descoberta re-emitido; `decision_prompt` aparece 1 vez |
| BRL-3 | Usuário diz "faz sentido" depois do decision já ter sido disparado | `decisionDispatched=true` ⇒ **0** novos `decision_prompt`; agente reage curto e PARA (sem reveal) |
| BRL-4 | Spam de 3 afirmativos seguidos ("show", "perfeito", "legal") | ao longo dos 3 turnos: `decision_prompt` total = 1; cards de descoberta total = 0; nenhum loop |
| BRL-5 | Guard estrutural: runner suprime re-emissão | log `[reveal-loop] guard: suprimindo <tipo>` aparece se o modelo tentar re-emitir comparison/recommendation/group pós-reveal |
| BRL-6 | Sem regressão no 1º reveal | no PRIMEIRO reveal (`revealCompleted` ainda false), os cards de descoberta **aparecem** normalmente (guard NÃO atua) |

**Definição binária de "sem loop":** num turno de afirmativo pós-reveal, `count(comparison_table)+count(recommendation_card)+count(group_card)` emitidos = **0**, e `count(decision_prompt)` cumulativo na conversa ≤ 1. Qualquer valor diferente = FAIL.

---

## 4. Edge cases (P0/P1)

| ID | Cenário | Critério de aceite (binário) |
|---|---|---|
| EC-1 | **What-if após simulação** — pós-reveal, usuário pede "e se for 80 mil?" (intent `providing_info`) | `simulation_result` re-emitido **é permitido** (não suprimido); **NÃO** trava no decision; `decision_prompt` NÃO dispara neste turno |
| EC-2 | **"Ver outras opções" no card de decisão** | agente traz comparativo/simulação de OUTRO grupo sem recomeçar qualify; **não** re-coleta nome/crédito; sem `present_contract_form` |
| EC-3 | **"Falar com especialista" no card de decisão** | `suggest_handoff` chamado; `meta.handoffSuggested=true`; gates/search pausam até user confirmar/declinar |
| EC-4 | **Texto livre "quero contratar agora"** (sem clicar o card) | agente vai direto pro passo 5: `present_contract_form` 1 vez; **não** re-dispara reveal nem decision |
| EC-5 | **Afirmativo durante qualify** (antes do reveal) | gate `decision` NÃO dispara (revealCompleted=false); fluxo segue qualify normal |
| EC-6 | **`noOffer` no startContract** (valor abaixo do mínimo Bevi mock) | resposta "não encontrei carta pra esse valor... quer ajustar?"; **0** `real_offer`; **0** linha incompleta órfã em `bevi_proposals` com link |
| EC-7 | **Re-submit do contract_form** (clica enviar 2x) | apenas 1 fluxo efetivo; não cria 2 propostas duplicadas no mesmo turno (idempotência observável: ≤1 `real_offer` por submit) |
| EC-8 | **Confirm sem proposta** (offer-confirm sem startContract antes) | erro tratado: "Tive um problema ao gerar sua proposta..."; **não** quebra o chat |

---

## 5. Integração Bevi — passo 5 detalhado (mock gateway)

| ID | Verificação | Critério binário |
|---|---|---|
| BV-1 | `contract-submit` chama `startContract(conversationId, {cpf, celular, lgpd, segmento, valor, objetivo, lanceEmbutido})` | `segmento` derivado da categoria (`auto`→AUTOS); `valor` = `creditMax`; `objetivo` do prazo |
| BV-2 | `bevi_proposals` após startContract | 1 linha: `proposal_id` not-null, `simulation_session_id` not-null, `oferta_id` set, `proposal_status='simulacao'` |
| BV-3 | **LGPD-mínimo** — nenhum PII sensível persistido | tabela NÃO tem coluna `cpf`/`celular`; só IDs Bevi + snapshot da oferta (admin/grupo/valores) + links |
| BV-4 | `confirmOffer` re-simula se `oferta_id` expirou (TTL) | se `offer_expires_at` no passado, novo `simulation_session_id` é gerado antes do `chooseOffer` (sem erro pro usuário) |
| BV-5 | `confirmOffer` grava links de assinatura + documento | `consortium_proposal_link`, `documents_link_personal`, `documents_link_address` not-null; `proposal_status='documentos'` |
| BV-6 | `uploadContractDocument` sucesso vs fallback | sucesso ⇒ `{ok:true}` e msg "ficha completa"; falha ⇒ `{ok:false, fallbackLink}` e msg com link (não quebra) |
| BV-7 | `document-skip` | resposta "documentos são opcionais"; proposta permanece em `documentos` (não regride) |

---

## 6. Multicanal — paridade web vs WhatsApp

| ID | Verificação | Critério binário |
|---|---|---|
| MC-1 | Formatter cobre TODOS os novos artifacts | `decision_prompt`, `contract_form`, `real_offer`, `signature_handoff`, `document_upload`, `contemplation_dial` têm `case` no `artifactToWhatsApp` (sem cair no `default: null`) |
| MC-2 | `decision_prompt` no WhatsApp | 3 botões com `waTitle` ≤20 chars ("Contratar agora"/"Ver outras opções"/"Falar c/ consultor") |
| MC-3 | `real_offer` no WhatsApp ⇒ botão `offer_confirm` funciona | `handleOfferConfirm` chama `confirmOffer` e envia `signature_handoff` + `document_upload` como texto; salva message |
| MC-4 | `offer_reject` no WhatsApp | encaminha "Quero ver outras opções" pro fluxo de texto (não quebra) |
| MC-5 | **GAP conhecido a validar — CPF no WhatsApp** | `contractFormToWhatsApp` pede CPF por **texto** ("me manda seu CPF"). **Critério:** existe handler que parseia o CPF de texto livre e chama `startContract`? Se SIM, validar `real_offer` chega no WhatsApp. Se NÃO ⇒ documentar como **limitação P1 do passo 5 no WhatsApp** (fechamento Bevi web-only por ora) — não pode passar silenciosamente como "feito" |
| MC-6 | Anti-loop pós-reveal vale no WhatsApp | mesma conversa via WhatsApp: afirmativo pós-reveal NÃO re-emite cards; `decision_prompt` 1 vez (mesma máquina de gate, canal-agnóstica) |

> **MC-5 é o ponto de falha mais provável de "feito incompleto".** O fix do reveal-loop é canal-agnóstico (gate machine), mas o fechamento Bevi no WhatsApp depende de captura de CPF por texto que pode não existir. QA crítico DEVE provar paridade ou reportar a limitação explicitamente.

---

## 7. Tom / fidelidade ao docx (P1 — copy é load-bearing aqui)

| ID | Verificação | Critério binário (frase/conteúdo presente) |
|---|---|---|
| TOM-1 | Educação 1ª vez cobre os 4 pilares | "sem juros" **E** ("sorteio" ou "lance") **E** "grupo" **E** "(diferente de) financiamento" no texto da explicação |
| TOM-2 | Lance embutido educa com a própria carta | gate lance-embutido contém "parte da própria carta de crédito" e o exemplo "R$ 100 mil" |
| TOM-3 | Reforço de marca no handoff (passo 5) | "escolhida pela Aja Agora" **E** "segue com você até a contemplação" |
| TOM-4 | "sem trocar de empresa" | usuário NÃO é informado que mudou de plataforma; copy do `signature_handoff` mantém a Aja Agora como conduto |
| TOM-5 | Jargão técnico proibido na educação | texto da 1ª vez NÃO usa "cota", "lance livre", "fundo reserva" |
| TOM-6 | Acentuação correta PT-BR nos artifacts/UI | strings de UI dos novos cards com acentos corretos (regressão do commit 6458e02) |

---

## 8. Referência de frases canônicas (para asserts de copy)

### 8.1 Educação primeira vez (combinação obrigatória, parafraseável no tom)
- sem juros ·  sorteio/lance · grupo de pessoas · diferente de financiamento

### 8.2 Card de decisão (literal)
- Pergunta: **"Esse plano faz sentido pra você?"**
- Opções: **"Sim, quero contratar agora"** / **"Quero ver outras opções"** / **"Quero falar com um especialista"**

### 8.3 Handoff de assinatura (literal, fragmentos)
- "escolhida pela Aja Agora pro seu perfil"
- "segue com você até a contemplação"

### 8.4 Termos PROIBIDOS na fala do agente (vazamento de mecânica)
- "sistema", "botões"/"botões", "menu", "próximas perguntas", "perguntas rápidas", "mecânica"

---

## 9. Pontos de falha conhecidos do domínio (atenção do QA crítico)

1. **Idempotência do gate decision** — `decisionDispatched` deve impedir 2º `present_decision_prompt`. Testar duplo afirmativo rápido (race de 2 turnos antes do persistMeta). FAIL se 2 cards.
2. **Idempotência do search** — `searchDispatched` setado tanto pelo dispatch do orquestrador quanto pelo runner (free-run de `search_groups`). Verificar que free-run do modelo não gera reveal duplo.
3. **Estado intermediário do funil** — afirmativo ANTES do reveal (revealCompleted=false) não pode disparar decision (EC-5). E what-if (providing_info) não pode travar no decision (EC-1).
4. **TTL da oferta Bevi** — `isOfferFresh` + re-simulação transparente no `confirmOffer`. Se TTL expira entre `startContract` e `offer-confirm`, fluxo NÃO pode mostrar erro ao usuário (BV-4).
5. **Race multicanal web↔WhatsApp** — mesma conversa tocada nos 2 canais: meta de gate é compartilhada via DB; não pode haver decision_prompt em ambos.
6. **Persistência LGPD** — CPF transita no payload da action mas **não** pode ser gravado em `bevi_proposals`. Auditar schema + qualquer log.
7. **Anchor do revealCompleted** — qualquer um de {comparison_table, group_card, recommendation_card, simulation_result} liga a flag. Verificar que um reveal que abre só com `group_card` (1 grupo) ainda habilita o gate decision.
8. **`noOffer` não deixa lixo** — proposta sem oferta não pode gerar `bevi_proposals` com link de assinatura órfão (EC-6).

---

## 10. Cobertura de teste automatizado esperada (3 camadas obrigatórias do projeto)

| Camada | Arquivo | O que prova | Roda em |
|---|---|---|---|
| 1 — Structural | `src/lib/agent/qualify-state.decision-gate.test.ts` | `nextGate` retorna "decision" pós-reveal; `decideShowGate` dispara em ready/neutral, NÃO em providing_info/asking/doubt | todo PR (<1s) |
| 1 — Structural | `src/lib/agent/orchestrator/decision-advancement.test.ts` | wiring index.ts dirige present_decision_prompt 1 vez (guard decisionDispatched) | todo PR |
| 1 — Structural | `src/lib/agent/orchestrator/jornada-docx-copy.test.ts` | copy canônica dos directives/cards bate com o docx | todo PR |
| 1 — Structural | `src/lib/agent/decision-prompt.structural.test.ts` / `bevi-fulfillment.structural.test.ts` | tools registradas, prompt contém regra anti-loop, fulfillment costurado | todo PR |
| 2 — Cassette | `tests/regression/agent-trajectory.test.ts` › `BUG-REVEAL-LOOP` | stream determinístico do loop dispara o detector; guard suprime re-reveal; prova que cruzou pro decision | todo PR (<30s) |
| 3 — Eval | `tests/eval/jornada-aja-agora.eval.test.ts` | jornada 1→5 com LLM real (sonnet agent + haiku user-bot) | nightly |
| Bevi unit | `src/lib/bevi/fulfillment.test.ts` + `.integration.test.ts` | startContract/confirmOffer/upload + persistência | todo PR |

---

## 11. Critérios de aceite GLOBAIS (gate de "FEITO")

A feature só é declarada concluída quando **TODOS** abaixo estão verdes:

- [ ] **G-1** Passos 1→5 (P0-1…P0-5) todos PASS no fluxo web happy path (Playwright na UI real).
- [ ] **G-2** BUG-REVEAL-LOOP: BRL-1…BRL-6 todos PASS. Definição binária de "sem loop" satisfeita em todos.
- [ ] **G-3** Edge cases EC-1…EC-8 todos PASS (what-if não trava, spam não loopa, ver-outras não recomeça, handoff pausa, noOffer sem lixo).
- [ ] **G-4** Bevi BV-1…BV-7 PASS; `bevi_proposals` com status correto em cada fase e **sem CPF** persistido.
- [ ] **G-5** Multicanal MC-1…MC-4 + MC-6 PASS; **MC-5 resolvido**: ou paridade WhatsApp do passo 5 provada, OU limitação documentada explicitamente (não silenciosa).
- [ ] **G-6** Tom TOM-1…TOM-6 PASS (educação, lance embutido, reforço de marca, sem jargão, acentuação).
- [ ] **G-7** Camadas 1+2 verdes localmente e no CI (pre-commit + GHA). Camada 3 roda nightly (não bloqueia, mas resultado reportado).
- [ ] **G-8** Nenhum vazamento de mecânica de UI em nenhum turno dos cenários executados (termos da seção 8.4).
- [ ] **G-9** Cleanup: conversas/propostas de teste descartadas; nenhuma proposta real na Bevi (confirmado por `PROPOSAL_GATEWAY=mock`).

> Critérios não se negociam pra "fechar". Qualquer FAIL → corrigir produto ou teste → re-rodar QA crítico → repetir até verde.
