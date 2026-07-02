---
data: 2026-06-22
bloco: bloco-e-sweep-multifaixa
escopo: FIX-69 (spike de validação), FIX-70 — sweep sequencial multi-faixa na descoberta
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do Bloco E (sweep multi-faixa na descoberta)

Contexto: a investigação dos logs do agent na develop (2026-06-22) mostrou que a
descoberta busca **uma faixa de valor só** por simulação Bevi → a recomendação
fica pobre e, quando o usuário quer ver alternativas, não há material no índice.
A feature varre 3-5 faixas ao redor do alvo, acumulando ofertas reais no
`offerIndex` (que já é cumulativo e sobrevive a conversa inteira — LRU por
conversa em `adapters/index.ts`). Decisões tomadas com o raciocínio da skill
`brainstorming` (explorar contexto, 2-3 abordagens, trade-offs, YAGNI), mas o
executor é o decisor — sem perguntas, best practice + padrões do repo.

**Limites de escopo (inviolável):** NÃO tocar `recommendation.ts` (bloco-b parado)
nem `tool-policy.ts` (bloco-d). O sweep só ENRIQUECE o índice que a recomendação
consome.

---

## Decisão 1 — Onde vive o sweep: método do adapter vs loop na tool

**O que decidir:** a varredura sequencial de N valores na Bevi (re-PATCH do step
`simulation` na MESMA proposta — a API é stateful, 1 proposta ativa por device,
cookbook §3) deve viver no adapter ou na orquestração (`ai-sdk.ts`)?

**Opções:**
- (a) `loop na tool` — `executeSearchGroups` chama `adapter.searchGroups(value)` N vezes.
- (b) **`sweepOffers(segment, target, opts)` no `BeviSelfContractAdapter`** — o
  adapter já é o dono da sessão Bevi (proposta + segmento), do `offerCache` e do
  `offerIndex`. Reusa `ensureOffers` (que já cacheia/indexa por valor).

**Escolhida: (b).** O invariante "1 proposta ativa, sequencial, re-PATCH" e o
estado (cache/índice) já vivem no adapter; espalhar o laço sequencial na tool
duplicaria a lógica de cache e vazaria a mecânica stateful da Bevi pra camada de
agente. Mantém a tool fina e a integração Bevi num lugar só (padrão do repo:
adapter = integração, tool = cola do agente). `sweepOffers` reusa `ensureOffers`
(cache-aware) → faixa já buscada vira lookup instantâneo.

---

## Decisão 2 — Gatilho do sweep: flag explícita vs implícito

**O que decidir:** quando varrer várias faixas em vez de uma? Constraint dura do
produto: chat responde **< 3s** e a 1ª oferta (faixa-alvo) tem que sair rápida.
Varrer N faixas = N simulações sequenciais = N× latência.

**Opções:**
- (a) `sweep sempre na 1ª busca` — multi-faixa logo de cara. Mata o < 3s da
  primeira impressão (cada `simulate` é a chamada pesada; latência real **não
  documentada**, é o que o FIX-69 mede) e quebra o teste de cache existente
  ("2ª busca igual não re-chama a Bevi").
- (b) `enriquecer na 2ª chamada / por cache-hit` — implícito. Surpreende: uma 2ª
  busca idêntica passaria a disparar simulações novas, quebrando o invariante de
  cache instantâneo num repeat.
- (c) `fire-and-forget em background` — UX rápida, mas Next.js mata trabalho
  pós-resposta e há race (o índice pode não estar pronto quando o modelo formata a
  comparison_table no MESMO turno).
- (d) **Flag explícita `sweep` no `search_groups`, default OFF.** O modelo opta
  por varrer quando o usuário quer comparar / ver alternativas; a busca simples
  (default) preserva 100% o comportamento atual e o < 3s da primeira impressão.

**Escolhida: (d) — flag `sweep` opt-in, default off.** É a única que:
1. **Preserva o < 3s da 1ª impressão** (default = 1 faixa, igual hoje).
2. **Preserva todos os testes existentes** (sem a flag, comportamento idêntico —
   inclusive "2ª busca igual não re-chama").
3. É **determinística e previsível** (sem background/race, sem efeito-colateral
   surpresa de "2ª busca varre").
4. Enriquece o `offerIndex` cumulativo → `simulate_quota`, `get_rates` e a
   `comparison_table` ganham espectro real, e como o índice sobrevive a conversa,
   o custo da varredura é pago **uma vez**, no momento em que o usuário pediu
   comparação (tolerância a latência maior aí).

A flag é puramente de **faixa de valor** (respeita "escopo SÓ FAIXAS DE VALOR, sem
objetivo×lance"): entra como `sweep?: boolean` opcional em `SearchGroupsParams`
(retrocompatível — o `BeviApiAdapter` de fechamento ignora) e no `searchGroupsInput`
(model-facing, descrito na tool). Dentro de `sweepOffers` a faixa-alvo é sempre
buscada **primeiro** → se o budget/breaker cortar, o usuário ainda recebe o alvo +
o que completou.

**Gap honesto:** `recommend_groups` (→ `recommendWithFallback` em
`recommendation.ts`, bloco-b parado) NÃO passa a flag — não posso tocar aquele
arquivo. A varredura entra pelo `search_groups` (entrada explícita de
busca/comparação, de onde a `comparison_table` é montada). Costurar o sweep no
`recommend_groups` fica pra quando o bloco-b destravar. Documentado como gap.

---

## Decisão 3 — Política de faixas derivadas do alvo

**O que decidir:** como derivar os 3-5 valores a partir do alvo (sem varrer o range
inteiro)?

**Opções:**
- (a) `range absoluto fixo` (ex. ±50k) — não escala: ±50k é tudo pra uma moto e
  pouco pra um imóvel.
- (b) **`spread multiplicativo` `[0.7, 1.0, 1.3]`** (alvo ±30%), arredondado a passo
  redondo, deduplicado, alvo-primeiro, descartando faixa abaixo do piso.

**Escolhida: (b) — spread multiplicativo, 3 faixas default.** Proporcional ao alvo
(escala de moto a imóvel), redondo pra cair em grupos reais e deduplicar
near-equals. Helper **puro** `deriveSweepValues(target, opts)`:
- `spread` default `[0.7, 1.0, 1.3]` → alvo + 2 vizinhas. Parametrizável
  (`[0.6,0.8,1,1.2,1.4]` = 5 faixas) — default conservador **3** informado pela
  latência incógnita (FIX-69 calibra; menos faixas = menos risco de UX).
- Arredondamento por magnitude: < 50k → 5k; 50k–200k → 10k; ≥ 200k → 25k. O
  **alvo NÃO é arredondado** (é o valor exato do usuário).
- `floor` (piso de crédito, cookbook §5a / `MinCreditError` min) default **15.000**
  — faixa abaixo do piso é descartada (não varrer no vácuo).
- Retorna **alvo primeiro**, depois vizinhas; dedup após arredondar.

---

## Decisão 4 — Circuit breaker e detecção de throttle

**O que decidir:** a Bevi pode rate-limitar a rajada de PATCHs `simulation` (limite
**não documentado** — FIX-69 sonda). Como o sweep se protege?

**Opções:**
- (a) `sem proteção` — uma 429/erro numa vizinha derruba a busca inteira (inclusive
  a faixa-alvo que já tinha dado certo).
- (b) **`circuit breaker simples`** — a faixa-alvo mantém o comportamento atual (se
  ela falha, é erro real de descoberta → propaga, como hoje). Na fase de
  **vizinhas**, QUALQUER erro (throttle, timeout, transitório) **para o sweep** e
  retorna o que já acumulou — nunca relança (a UX já tem o alvo).

**Escolhida: (b).** Mais o cuidado de **detectar throttle distintamente**. Também
um **budget de tempo** (`maxSweepMs`, default conservador 10.000ms) e o **gap**
entre chamadas (`gapMs`, default 400ms — provado no cookbook §6): o sweep não lança
nova faixa se o orçamento de tempo estourou. Defaults parametrizáveis no construtor
do adapter (testes injetam `gapMs: 0`).

> **Refinamento na implementação (honestidade > consistência com o rascunho):**
> a detecção de throttle ficou **no próprio circuit breaker do adapter** — lê
> `(err).code === 429` (+ regex na mensagem) e loga `event: "throttle_breaker"`
> vs `"neighbor_error_breaker"`. **NÃO** adicionei `BeviThrottleError` ao client:
> o `toBeviError` do client já carrega `code` no erro tipado, então uma classe
> nova seria YAGNI e mexeria no hot path do `call()` sem ganho. Resultado:
> `self-contract-client.ts` **não foi tocado** (escopo ainda menor). O breaker
> para em QUALQUER erro de vizinha; o log só distingue throttle de transitório.

---

## Decisão 5 — Re-simulação antes do fechamento (estado da proposta stateful)

**O que decidir:** cada `simulate` sobrescreve o "valor que o cliente quer" na
proposta Bevi. Depois de varrer N valores, a proposta termina com o valor da
**última vizinha**, não o da oferta escolhida. Precisa re-simular o valor escolhido
antes do passo 5 (Contratar)?

**Investigação (provado no código):**
- A descoberta é **Trilho B self-contract** (`BeviSelfContractAdapter`). O
  fechamento (passo 5) é **Trilho A / API de Parceiro** (`BeviApiAdapter` via
  `startContract`), que **cria uma proposta SEPARADA** e recebe o `valor` escolhido
  **explicitamente** (`StartContractInput.valor`) → re-simula sozinho no seu próprio
  trilho. Não lê a proposta self-contract.
- `simulate_quota` / `get_group_details` leem do `offerIndex` por `quotaId` (a
  oferta **capturada**), **independente** do último valor PATCHado na proposta
  Trilho B. Varrer múltiplos valores não corrompe esses lookups.

**Escolhida: NÃO mexer no fluxo de fechamento.** Não há acoplamento: o "valor atual"
da proposta Trilho B após o sweep é benigno porque (1) o fechamento é outro trilho
com valor explícito e (2) toda leitura da descoberta é por `quotaId` na oferta
capturada, não pelo estado vivo da proposta. Documentado aqui e no `.done/` como
cuidado verificado — implementar `resyncToValue` seria YAGNI (nada lê o valor vivo
da proposta Trilho B).

---

## Camadas de regressão (decisão de teste)

- **Camada 1 (structural)** — `bevi-self-contract-adapter.test.ts` (incluído no
  `test:unit`): `deriveSweepValues` (puro) + `searchGroups({sweep:true})` acumulando
  N faixas no índice (client fake com fixtures de captura real), faixa vazia (piso)
  pulada sem quebrar, circuit breaker parando em erro de vizinha sem relançar.
- **Camada 2 (cassette)** — **NÃO adicionada.** O sweep é mudança puramente de
  **backend** (o adapter enriquece o índice; o agent chama as MESMAS tools —
  `search_groups` ganha um arg opcional, sem nova tool no stream). Pela regra do
  projeto ("cassette só se o sweep mudar comportamento OBSERVÁVEL do agent"),
  integration/adapter test basta. Escolha documentada.
