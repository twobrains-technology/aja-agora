# Roteiro de verificação E2E — Rodada 10 (Etapa A), campanha agente-vendas-consorcio

> Planner: Opus (contexto fresco) · 2026-07-13 · loop-de-goal fase ④
> Base sob verificação: **`integ/consorcio-r10`** (onda 1+2+3 integradas — NÃO é o develop).
> Consumidores deste roteiro: **coletor (Haiku)** executa e monta o dossiê factual (sem julgar);
> **juiz (Sonnet → Fable)** pontua por evidência. Regra do loop: *nenhuma rodada declara 10/10 se o
> dossiê não incluir a sonda adversarial contra CADA P1-P10* — dossiê incompleto = rodada inválida.

---

## 0. Ambiente e pré-requisitos (o coletor LÊ isto primeiro)

### 0.1. App sob teste
- **Container:** `aja-app-consorcio-r10` (rodando o branch `integ/consorcio-r10`). Confirmado UP.
- **Base URL:** `http://aja-app-consorcio-r10.orb.local` (HTTP 200 verificado).
- **Contrato:** `POST /api/chat` SSE — eventos `text-delta` (texto do agente) + `data-*` (artifacts:
  `data-artifact`, `data-gate`, `data-transition`, `data-welcome`, `data-handoff`, `data-tool`).
  O histórico é server-side por `conversationId`; o cliente é stateless por turno.
- **Latência do reveal:** a busca real chama a Bevi (third-party, cold-start DigitalOcean) — esperar
  **40-90s** no turno do `identify`/reveal e no `contract-submit`. Timeout dos turnos de reveal = 120s.

### 0.2. Driver determinístico (reusar o do r9 — já existe e é o padrão aprovado)
- `.processo/loop/evidencias-r9/driver/run-scenario.mjs` + `chat-client.mjs` + `send-turn.mjs`.
- Uso: `AJA_BASE_URL=http://aja-app-consorcio-r10.orb.local node .../run-scenario.mjs <roteiro.json> <pasta-saida>`
- Os roteiros JSON desta rodada estão em `./roteiros/` (esta pasta). Saída → `./dossies/<cenario>/`
  (gitignorado — sem PII versionada). Cada dossiê tem `dossie.json` (turnos verbatim + artifactTypes +
  elapsedMs + httpStatus + erros) e `dossie.md` (legível).
- **PII fora do repo:** os roteiros usam placeholders `${E2E_TEST_CPF}` / `${E2E_TEST_CELULAR}`. Exporte
  antes de rodar (a Bevi valida celular×CPF — sem eles o `identify` falha e nada passa do reveal):
  ```
  set -a; source contas-teste.env; set +a        # se existir; senão:
  # secrets.sh decrypt contas-teste  → exporta CONTA1_CPF/CONTA1_CELULAR (SIMULATOR_TEST_CELULAR)
  export E2E_TEST_CPF="$CONTA1_CPF"; export E2E_TEST_CELULAR="$CONTA1_CELULAR"
  ```
- Health-check antes de cada cenário (o engine OrbStack wedga sob carga — se `curl / != 200`, `orb stop && orb start`, **nunca** `orb restart`).

### 0.3. Modelos a exercitar (a rubrica exige DOIS caminhos)
| Rótulo | `AI_MODEL` | Gateway | Como | Onde usar |
|---|---|---|---|---|
| **PROD** | `claude-haiku-4-5` | Anthropic nativo (key direta no `.env.local`, sem VPN) | é o modelo que PROD roda hoje (secret `tb/dev/aja-agora/env`); o container hoje está com `AI_MODEL` vazio → default `claude-sonnet-5`. **Setar `AI_MODEL=claude-haiku-4-5` e reiniciar o app** pra medir o modelo real de prod. | P0-A, P0-B e TODAS as sondas P1-P10 |
| **FRACO** | `qwen3.6-flash` | LiteLLM (OpenAI-compat), `gateway-openai.ts` | precisa do **túnel LiteLLM** (`scripts/tunnel-litellm.sh` no repo `twobrains-aws-platform`, foreground — background trava o SSM) + `LITELLM_API_KEY` (virtual key de dev, `tb/dev/aja-agora/env`, `qwen3.6-flash` na allowlist) + `LITELLM_BASE_URL`/`LITELLM_SRV_NAME` apontando pro túnel. Setar `AI_MODEL=qwen3.6-flash` + as vars e reiniciar. | robustez (§3): 1 fluxo completo + P4/P6/P7/P10 + gap §4 |

> **Nota de troca de modelo:** setar `AI_MODEL` no container e `docker restart` (ou `up --force-recreate app`).
> Confirmar no smoke (1 turno "oi" responde 200 com texto) antes de rodar o batch. O provider é escolhido
> por `AI_MODEL` em `builder.ts:314` (`isNativeAnthropicModel` → anthropic; senão → openaiCompat/LiteLLM).

---

## 1. Cenários P0 (golden path) — provam a jornada de NEGÓCIO

Rodar **sob o modelo PROD (`claude-haiku-4-5`)**. Faithful aos arrays `F1`/`F2` do mockup
(`docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html`). Roteiros executáveis:
`./roteiros/madalena-junta.json` e `./roteiros/mario-sem-lance.json` (turno-a-turno, com o gabarito
do mockup em cada `expect`).

### P0-A — Madalena "vai juntando" (rica, lance progressivo → carta 171k, embutido + bolso)
Ordem NOVA r10 esperada (o dossiê tem que bater esta sequência de artifacts/gates):
`welcome → transition(especialista auto) → gate:name → desire(item) → motivo(turno próprio) →
espelho+objetivo → gate:credit("quanto custa esse Corolla?") → gate:identify(moldura "ofertas reais")
→ [reveal] comparison_table (SÓ a lista; hero SUPRIMIDO) → gate:experience → topic_picker(canônico)
→ gate:reco-consent → recommendation_card(HERO, server-forced) → gate:timeframe → gate:lance →
gate:lance-value → embedded_bid + gate:lance-embutido → contemplation_dial → scarcity +
decision_prompt → contract_form → real_offer → fecho (signature_handoff + document_upload + WhatsApp).`

**PASS P0-A (todos obrigatórios):**
1. Fecha ponta-a-ponta: chega ao `real_offer` real da Bevi + fecho, `0 erros` no dossiê.
2. `recommendation_card` (hero) só aparece DEPOIS do `reco-consent` respondido — nunca no turno do reveal.
3. Guardrail netCredit: se o embutido deixaria o crédito < bem (120k), o agente sobe pra carta maior
   (171k) e avisa; **nunca** fecha um plano que não cobre o Corolla.
4. Curva converge a sorteio no fim (não achata em 90%); `contemplation_dial` recalcula.
5. `scarcity` = número 1-6 estável, SEM % de chance; `two_paths` NÃO aparece (fluxo com lance).
6. Compliance: `taxaContemplacao` nunca exibida; nada de "reservado/garantido"/"reduzir prazo";
   terminologia "reserva de cota"; pt-BR com acento.

**FAIL P0-A:** hero antes do consent · funil trava (precisa "vai/continua") · plano que não cobre o
bem · `two_paths` num fluxo de lance · qualquer item de compliance violado · erro/timeout que quebra o fecho.

### P0-B — Mario "sem entrada" (compacto, sem lance/sorteio → Canopus, two_paths)
Sequência esperada: `welcome → desarma objeção "sem grana" (sem tratar como categoria inválida) →
transition(especialista auto) → gate:name → desire(item+valor juntos) → gate:credit CONFIRMA o valor
(não re-pergunta) → gate:identify → comparison_table → [pergunta de lance] → hasLance=so_parcela →
two_paths (SEM % de chance) → decision/proposta co-branded (Canopus) → contract_form → real_offer → fecho.`

**PASS P0-B:**
1. Fecha ponta-a-ponta (real_offer Canopus + fecho), `0 erros`.
2. **P3 condicional:** fluxo sem-hero → `two_paths` aparece; `recommendation_card`/hero e
   `reco-consent` **NÃO** aparecem (pulados por `hasLance=so_parcela`).
3. Objeção "sem grana" desarmada com leveza ("no consórcio não tem entrada").
4. Valor não é perguntado 2x (credit confirma o que veio no desire).
5. Mesma barra de compliance do P0-A.

**FAIL P0-B:** força lance/recomendação num fluxo sorteio · `two_paths` com % de chance · pergunta o
valor 2x · não fecha.
**⚠️ DESVIO P3 a REGISTRAR (não abortar):** o código (`nextGate`) dispara `experience` e
`reco-consent` pós-reveal para TODOS, e só pula `reco-consent` se `hasLance=="so_parcela"` já foi
capturado (oportunístico). Se no dossiê do Mario aparecer `gate:experience`/`gate:reco-consent`/hero
ANTES do `two_paths` (o mockup F2 vai direto lista→lance→two_paths, sem esses beats), o coletor
**registra como possível desvio P3** — o juiz decide se fere o teto (o mockup é soberano por-fluxo).

---

## 2. Sondas adversariais P1-P10 (CADA UMA obrigatória no dossiê)

Onde diz "grep no dossiê", a evidência é o `dossie.json` dos P0 (não precisa roteiro novo). Onde há
roteiro dedicado, está em `./roteiros/`. **P4/P6/P7/P10 rodam sob PROD e sob FRACO** (o ponto da
rodada é que o invariante segura mesmo com modelo fraco).

| P | O que prova | Método / cenário | PASS | FAIL |
|---|---|---|---|---|
| **P1** | identidade NUNCA antes do valor; identidade é o ÚLTIMO gate antes do search; motivo em turno próprio; categoria→divider→nome | grep nos dossiês **P0-A e P0-B**: (a) `gate:credit` aparece ANTES de `gate:identify`; (b) `gate:identify` é o último gate antes do `comparison_table`; (c) o turno do motivo não traz card/CPF junto; (d) `transition(especialista)` vem entre a categoria e `gate:name` | os 4 invariantes batem nos DOIS fluxos | identify antes de credit · motivo colado a CPF/card · sem divider · search sem identify |
| **P2** | valor do bem apresentado com calor, referenciando o bem | grep no dossiê P0-A no turno do `credit`: texto contém o bem ("**Corolla**", "quanto custa esse Corolla") — não a fria "qual valor do bem" | copy referencia o bem citado | copy genérica "valor do bem" quando o bem é específico |
| **P3** | coreografia adaptativa por-fluxo | comparar P0-A (leva a hero: lista→experience→explicação/chips→**reco-consent**→hero) × P0-B (sem hero: lista→two_paths) — ver PASS de cada P0 acima | cada fluxo segue sua cadeia; hero SEMPRE precedido de consent | hero sem consent · reco-consent/hero num fluxo sorteio |
| **P4** | ZERO balões com 2+ perguntas, em QUALQUER modelo | `./roteiros/probe-p4-perguntas-compostas.json` **+ grep em TODOS os dossiês** (P0 e probes, Claude E Qwen): contar sentenças terminadas em `?` por balão do agente | nenhum balão do agente com 2+ sentenças `?`; a composta válida do mockup ("que carro… e quanto custa?", 1 `?`) chega inteira | qualquer balão com 2 `?` · composta válida cortada |
| **P5** | WhatsApp opt-in só no FECHO | grep nos dossiês P0: o artifact `whatsapp_optin` só aparece em/depois do `contract_form` (contractFormDispatched), nunca no turno pós-reveal solto | posição = fecho (pós-proposta) | opt-in órfão logo após o reveal/recomendação |
| **P6** | ZERO cards com labels não-ancorados (topic_picker só catálogo) | `./roteiros/probe-p6-topicpicker-hallucination.json` **sob FRACO (Qwen)** — tenta induzir chips "a"/"b" no gate decision | nenhum `topic_picker` em decision/closing; se aparecer em qualquer ponto, os chips são EXATAMENTE do catálogo canônico | topic_picker no decision · qualquer chip fora do catálogo ("a"/"b"/"1"/texto livre) |
| **P7** | confuso ("não entendi") → reancora simples, nunca menu nem dissertação | `./roteiros/probe-p7-confused-reancora.json` (PROD e FRACO) | cada "não entendi" reconhece + re-apresenta o MESMO gate; "por que essa e não outra?" NÃO vira reancora (responde critério) | abre menu genérico · disserta fora de escopo · trata pergunta de critério como confusão |
| **P8** | inativo no web → reengajamento proativo | §2.1 abaixo (integração determinística + probe live opcional) | reengajamento web persistido na escada (mesma régua do WhatsApp) | web fica mudo · mensagem fabrica estado |
| **P9** | modelo candidato só "admitido" se bakeoff bate a régua | §3.2 abaixo — re-rodar `scripts/bakeoff.sh`/eval sob Qwen | log mostra `fluxoScore` vs 0.85 e a lista de falhas; decisão de admissão registrada | declarar Qwen admitido sem log · não medir |
| **P10** | sem frases coladas/emoji/caps errada em NENHUM gateway | grep nos dossiês PROD (Anthropic) **e** FRACO (OpenAI-compat): (a) zero emoji no texto do agente; (b) sem sentenças coladas ("…valor?Fico…"); (c) nome do contato capitalizado certo | limpo nos dois gateways | emoji · frase colada · "kairo"/"MADALENA" mal capitalizado |

### 2.1. P8 — reengajamento proativo no web (detalhe)
O worker (`scripts/proposal-worker.ts`) **não está rodando** no container dev, e o timeout é 90s
(`GATE_REENGAGE_TIMEOUT_MS`). Dois métodos:
- **PRIMÁRIO (determinístico, obrigatório):** o teste `src/lib/workers/gate-reengage-poll.integration.test.ts`
  (cobertura web adicionada na onda 1) tem que estar **verde** em `test:integration`. Ele prova que o
  worker varre conversas **web** (filtro `channel==="whatsapp"` removido) e **persiste** a mensagem de
  reengajamento via `saveMessage` (entregue no próximo `/api/chat/resume`), reusando a escada FIX-211.
- **SECUNDÁRIO (live, opcional — reforço):** driblar o 90s manualmente:
  1. Dirigir uma conversa **web** até um gate que fica pendente por supressão — mandar uma
     PERGUNTA num gate de coleta (ex.: no gate desire/experience o `decideShowGate` suprime e marca
     `pendingGateSince`). Capturar o `conversationId` (o driver imprime).
  2. Invocar UM ciclo do worker com o relógio adiantado > 90s — rodar
     `gate-reengage-poll.integration.test.ts` apontado ao **DB do workspace r10** (ou um script node
     que importe `runReengageCycle` injetando `now = Date.now() + 120_000`).
  3. Verificar na tabela `messages` daquele `conversationId` que uma mensagem `assistant` de
     reengajamento foi anexada, com copy da escada (não fabricação de estado, Lei 5).
- **PASS P8:** integração verde **e** (se rodar o live) a mensagem web aparece. **FAIL:** integração
  vermelha, ou o web não recebe nada, ou a mensagem afirma estado falso ("já busquei", "documentos recebidos").

---

## 3. Sonda de robustez sob modelo FRACO (Qwen `qwen3.6-flash`)

Objetivo: provar (ou refutar com evidência) que os invariantes seguram sob tool-calling fraco — o
motivo da rodada. Exige o **túnel LiteLLM** (§0.3).

### 3.1. Fluxo completo + probes sob Qwen
- Rodar **pelo menos 1 fluxo P0 completo sob Qwen** — recomendo **P0-B (Mario)** por ser mais curto e
  por ser onde o gap §4 (fechamento/two_paths) morde; se sobrar orçamento, rodar P0-A também.
- Rodar sob Qwen: `probe-p4`, `probe-p6`, `probe-p7`. Guardar os dossiês em `./dossies/qwen-<cenario>/`.
- **Pontos de fragilidade que o estudo previu (o coletor mede explicitamente):**
  - **P4/P10:** frases coladas e emoji vazando pelo `gateway-openai.ts` (chunking diferente do
    Anthropic). Pista concreta já registrada: `normalizeGluedSentences` só dispara quando a frase
    seguinte começa com MAIÚSCULA — a copy do produto é minúscula ("boa, kairo!"), então o guard não
    cobre; o coletor deve procurar coladas de frase minúscula especificamente.
  - **Gate preso (FIX-305):** sob Qwen o `timeframe`/`lance*` podia ficar preso pra sempre; agora tem
    escape por default após 3 tentativas. Se o Qwen ficar vago, o dossiê deve mostrar o agente
    ASSUMINDO o default e AVISANDO ("Vou considerar 12 meses por enquanto — pode ajustar depois"),
    nunca travando mudo. (Registrar se `gateDefaultsAssumed` foi exercitado ou não — n=1 é honesto.)

### 3.2. P9 — régua de admissão (bakeoff)
Re-rodar a eval sob Qwen com o túnel de pé (foreground), do worktree do r10:
```
AI_MODEL=qwen3.6-flash AI_MODEL_EVAL=claude-haiku-4-5 \
  pnpm vitest run --config vitest.eval.config.ts tests/eval/jornada-aja-agora.eval.test.ts
```
Registrar no dossiê: `fluxoScore` (alvo ≥ 0.85), testes verdes/vermelhos, e se o `simulator-offer`
disparou. Histórico: baseline 0.774 → pós-onda-1 **0.68** → pós-onda-3 **0.734** (Qwen **reprovado**).
**PASS P9 = a decisão de admissão está registrada com o log** (não que o Qwen passe — a decisão D5 é
que, se reprovar mesmo pós-fixes, o piso barato é o Haiku 4.5; nenhuma troca de modelo é justificada
sem a régua verde). **FAIL P9 = declarar admissão sem o log.**

---

## 4. Gap conhecido (tool_error em `present_decision_prompt`) — DECISÃO: **sondar, sob os dois modelos**

**Contexto:** 12/31 testes do eval seguem vermelhos sob Qwen — `tool_error` em
`present_decision_prompt` chamado fora de fase (BUG-REVEAL-LOOP, provável `tool-policy.ts`) + desvio
pro "especialista em cadastros" no fechamento em vez de self-service. Não confirmado se ocorre sob o
modelo de prod (Claude).

**Decisão (argumentada, não no escuro):** **PRECISA de sonda dedicada NESTA verificação**, por três razões:
1. É o único gap com sintoma de **quebrar a jornada** (o fechamento), não um polish — ignorá-lo
   arriscaria selar 10/10 com um beco no fecho sob modelo fraco.
2. A causa provável (`present_decision_prompt` fora de fase) é da MESMA família que a rodada inteira
   ataca (invariante de fase em código) — é diretamente relevante à tese.
3. O custo é ~zero: as sondas P6 (§2, decision phase) e o fluxo P0 sob Qwen (§3) **já passam pelo
   fechamento** — basta o coletor **instrumentar**: registrar, no turno da decisão/fechamento,
   se aparece `tool_error`/`data-tool` com erro em `present_decision_prompt`, e se o fecho vira
   "especialista em cadastros" em vez do self-service.

**Como discriminar (o ponto que resolve "sob qual modelo"):**
- Rodar o trecho de fechamento **sob PROD (Haiku)** e **sob FRACO (Qwen)** e comparar:
  - Reproduz sob **Qwen mas NÃO sob Haiku** → é gap weak-model-only. **Não bloqueia** o selo Claude
    10/10 (P9 já mantém o Qwen fora de prod), mas **TEM que estar no dossiê** com essa conclusão
    (a rubrica proíbe pass por omissão).
  - Reproduz também sob **Haiku (modelo de prod)** → é **P0 BLOQUEANTE** — vira item de nova onda
    (crítico → correção → re-verificação), o selo não fecha.
- **PASS:** o dossiê contém a medição do fechamento nos dois modelos e a classificação (weak-only vs
  prod-afetado). **FAIL:** o gap não foi medido / foi assumido sem evidência.

---

## 5. Divisão por método de coleta

### 5.1. Determinístico (preferido — prova invariante sem olho humano)
- **Driver `run-scenario.mjs`** contra `POST /api/chat` (turnos pré-scriptados, respostas verbatim) —
  todos os cenários §1, §2 (P1-P7, P10), §3, §4. É a espinha do dossiê. Sem Playwright.
- **Suítes de teste** (rodar no container/worktree r10, são o chão de fábrica dos invariantes):
  - `test:integration` **inteiro verde** — em especial:
    `gate-reengage-poll.integration.test.ts` (P8), `index.fix-303-whatsapp-optin-fecho.integration.test.ts`
    (P5), `index.fix-301-clarify-usuario-confuso.integration.test.ts` (P7),
    `runner.fix-290-comparison-forced.integration.test.ts` (P3/lista), e os **2 testes da onda 5 do r9
    que NÃO podem regredir**: `present_whatsapp_optin` re-exposta ao specialist + `contract_form`
    pré-reveal re-emitindo identify (FIX-294/295).
  - `test:unit` verde — em especial `sanitizer.test.ts` (P4/P10, FIX-298/299),
    `ai-sdk.fix-300-topicpicker-enum.test.ts` (P6), `qualify-state.fix-296/297/301/305.test.ts` (P1/P3/P7).
- **Bakeoff/eval sob Qwen** (§3.2) — P9.

### 5.2. Visual (Claude in Chrome — SÓ o que precisa de olho, não duplicar o determinístico)
O driver prova sequência/copy/artifact-types; ele **não** prova RENDER. Marcar visual só onde o
pixel importa. O coletor pilota `aja-app-consorcio-r10.orb.local` no Chrome (Haiku, `claude-in-chrome`,
nunca Playwright) e tira print:
1. **Divider de especialista (P1/D2):** o `transition` renderiza como divisória com nome+papel do
   especialista ("Rafael · Especialista em automóveis"), estilo do mockup — confirmar que aparece
   visualmente entre a categoria e o nome (o driver só vê `data-transition`, não o render).
2. **Reveal em dois tempos (P3):** confirmar VISUALMENTE que no turno da busca aparece só a lista
   (comparison_table) e o **hero (recommendation_card) NÃO está na tela** até o "Pode mostrar" — é o
   coração da coreografia nova; vale um print antes e depois do consent.
3. **topic_picker canônico (P6):** print dos chips renderizados — devem ler "o que é lance?" etc.,
   nunca "a"/"b". Confirma que o payload canônico chega intacto ao componente.
4. **Card de proposta co-branded + fecho WhatsApp (P5):** print do `real_offer` (logo AJA+administradora,
   "0% juros") e dos 3 balões verdes do fecho WhatsApp com a 2ª persona — confirma o layout do mockup.
5. **Compliance visual:** print confirmando que `taxaContemplacao` não aparece em card nenhum e a
   escassez é barra 1-6 sem %.

> Tudo mais (ordem de gates, contagem de `?`, posição do opt-in, emoji/coladas, gate preso) é
> **determinístico** — não duplicar no visual.

---

## 6. Matriz PASS/FAIL consolidada (o que o dossiê TEM que conter pro juiz pontuar)

O dossiê da rodada 10 é **inválido** (não "pass por omissão") se faltar QUALQUER linha:

| Item | Evidência exigida no dossiê | Verde quando |
|---|---|---|
| P0-A Madalena | `dossies/madalena-junta/` (PROD) | fecha ponta-a-ponta, hero pós-consent, guardrail, compliance |
| P0-B Mario | `dossies/mario-sem-lance/` (PROD) | fecha, two_paths sem hero, valor 1x, compliance |
| P1 | grep dos P0 | credit<identify, identify último pré-search, motivo turno próprio, divider |
| P2 | grep P0-A | copy do credit referencia o bem |
| P3 | comparação P0-A×P0-B (+ nota de desvio se experience/reco no Mario) | cada fluxo na sua cadeia |
| P4 | `dossies/probe-p4/` + grep TODOS os dossiês (PROD+Qwen) | 0 balões com 2+ `?` |
| P5 | grep P0 (+ integração fix-303) | opt-in só no fecho |
| P6 | `dossies/qwen-probe-p6/` | 0 topic_picker no decision; chips canônicos |
| P7 | `dossies/probe-p7/` (PROD+Qwen) + integração fix-301 | reancora simples; critério ≠ confusão |
| P8 | integração gate-reengage web verde (+ live opcional) | web reengaja na escada |
| P9 | log do bakeoff Qwen + decisão de admissão | `fluxoScore` medido, decisão registrada |
| P10 | grep PROD + Qwen | sem emoji/coladas/caps errada nos dois gateways |
| Gap §4 | medição do fechamento sob Haiku E Qwen | classificado (weak-only vs prod-afetado) |
| Suítes | `test:unit` + `test:integration` verdes (inclui FIX-294/295 anti-regressão r9) | 0 falha |

**Regra de nota (rubrica r10):** nota final = MÍNIMO das dimensões; o juiz Fable é instruído a ser
**supercrítico contra a lista P1-P10** — qualquer P vivo = não pode fechar 10/10, mesmo que o resto
esteja ótimo. O selo só é do Fable lendo o dossiê factual (nunca self-report do coletor nem desta sessão).

---

## Apêndice — mapa dos roteiros executáveis

| Arquivo | Cobre | Modelo(s) |
|---|---|---|
| `roteiros/madalena-junta.json` | P0-A + P1/P2/P3/P5/P10 (grep) | PROD (e Qwen se sobrar) |
| `roteiros/mario-sem-lance.json` | P0-B + P1/P3/P5/P10 (grep) | PROD **e** Qwen (§3, gap §4) |
| `roteiros/probe-p4-perguntas-compostas.json` | P4 | PROD **e** Qwen |
| `roteiros/probe-p6-topicpicker-hallucination.json` | P6 (+ gap §4 no decision) | **Qwen** (reproduz o bug) |
| `roteiros/probe-p7-confused-reancora.json` | P7 | PROD **e** Qwen |
| P8 | procedimento §2.1 (integração + live opcional) | — |
| P9 | comando §3.2 (bakeoff eval) | Qwen |
