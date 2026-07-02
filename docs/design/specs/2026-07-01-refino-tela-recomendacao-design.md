# Refino da tela de recomendação + simulação + confirmação — DESIGN SPEC

> **Data:** 2026-07-01
> **Autor:** Claude (sessão de refino colaborativa) + Kairo (decisões de produto)
> **Origem:** `docs/design/specs/2026-07-01-refino-tela-recomendacao-BRIEF.md` +
> `_evidencia/2026-07-01-bevi-simulation-130k-auto.json` (retorno REAL da Bevi) +
> `~/.claude/reference/arquitetura-agentes-ia.md` (as 6 leis)
> **Branch:** `feat/refino-tela-recomendacao` · **Status:** SPEC (não implementar aqui — vai via `todo-blocks` depois)
> **Regra-mãe:** nada mockado/fabricado em runtime — todo número exibido vem do retorno REAL da Bevi.

---

## 0. TL;DR — o veredito e as decisões

1. **"Contemplados/mês: 36 por mês" = DEFEITO (número não-ancorado / fabricável).** Provado no
   código: `contempladosMes` chega ao card do hero **cru dos argumentos da LLM, sem coerção
   server-side** (o runner só coage `simulation_result` e `contemplation_dial`, nunca o
   `recommendation_card`). O único campo de contemplação que o retorno REAL traz é
   `taxaContemplacao` (fração 0..1, **semântica TBD**), que **não é** uma contagem mensal. O "36" não
   é derivável de nenhum campo real da resposta atual. → **Prova completa na §2.**
2. **O retorno REAL de 2026-07-01 é ENXUTO (10 campos).** Muita coisa que a tela e a proposta do
   simulador assumiam como real (`monthlyAwardedQuotas`, `adminFee`, INCC/IPCA, próxima assembleia,
   `embeddedBid`, fundo de reserva) **NÃO está nesse retorno**. A tela precisa parar de prometer o
   que a fonte não dá. → **§1.**
3. **Decisões de produto tomadas** (rodada de `AskUserQuestion` dispensada no ClaudeNotch →
   sigo as recomendadas e registro, conforme o brief):
   - **Contemplação:** não exibir nenhum sinal de contemplação até haver dado real ancorado;
     matar a fabricação com coerção server-side. (§3.1)
   - **tipoOferta (SPECIAL_OFFER × FREE_BID):** critério **invisível** de ranking/dedup, sem
     jargão de tipo na UI. (§3.2)
   - **Ranking:** **hero + 5 + "ver todas"** (FIX-96). (§3.5) — **PENDENTE-Bernardo** (aval do FIX-96).
4. **PENDENTE-stakeholder (não resolver no escuro):**
   - **FIX-96** (hero + 5 + ver todas) — aval do **Bernardo**.
   - **T2** — lance embutido **amortiza a dívida** (docx) × **reduz o crédito** (CONTEXT D18/C4 + código). Decisão do **Bernardo**. Afeta a parcela pós-contemplação do simulador.
   - **Semântica de `lanceMedio` e `taxaContemplacao`** — confirmar com a **AGX/Bevi** (o "Lance
     médio do grupo" exibido **varia com a faixa pedida** — ver §3.3; a `taxaContemplacao` pode ou
     não ser exibível como "chance").

---

## 1. O que a Bevi REALMENTE devolve (fonte de verdade da UI)

O `_evidencia/2026-07-01-bevi-simulation-130k-auto.json` (conversa Kairo, categoria auto, faixa
R$130.000) traz **exatamente 10 campos por oferta**:

| Campo | Tipo | Exemplo (BB grupo 1797) | Observação |
|---|---|---|---|
| `ofertaId` | UUID | `81b6eca6-…` | expira com a sessão (TTL) |
| `administradora` | string | `BANCO DO BRASIL` | enum aberto (homologação) |
| `tipoOferta` | enum | `SPECIAL_OFFER` \| `FREE_BID` | **não exibido/usado hoje** |
| `grupo` | string | `1797` | |
| `valorCarta` | number | `300000` | **carta cheia; ≠ faixa pedida** (ver §3.6) |
| `parcela` | string BRL | `"5.404,20"` | STRING pt-BR (BUG-PARCELA-STRING) |
| `prazo` | number (meses) | `71` | campo NOVO 2026-06 |
| `lanceMedio` | number (opcional) | `181500` | campo NOVO 2026-06; **semântica TBD** |
| `taxaContemplacao` | number 0..1 | `0.605` | **fração, NÃO contagem**; semântica TBD |
| `quotaId` | string | `6a3e6ceb…` | |

### 1.1. Campos que a tela/simulador assumiam e que o retorno real NÃO traz

Esta é a descoberta estrutural mais importante do refino. O código da **descoberta** (`offer-mapper.ts`,
`bevi-self-contract-adapter.ts`) e a `proposta-simulador.md` foram desenhados sobre a shape **RICA**
do self-contract (~68 campos, confirmada nas fixtures `__fixtures__/ok-selfcontract-simulation.json`:
`finalValue`, `adminFee`, `embeddedBid`, `monthlyAwardedQuotas`, `adjustmentType: IPCA`, …). **O
retorno REAL de 2026-07-01 é a shape ENXUTA** (idêntica ao `PartnerOffer`, `proposal-gateway.ts:32-47`).

| Campo assumido | Onde era usado | No retorno real 2026-07-01? | Consequência |
|---|---|---|---|
| `monthlyAwardedQuotas` | "contemplados/mês" (hero) | ❌ ausente | vira `?? 0` → base do "36" fabricado (§2) |
| `adminFee` | taxa adm, score | ❌ ausente | score `adminFee` sem lastro; **já oculto na UI** (bom) |
| `adjustmentType` (INCC/IPCA) | "correção prevista" (simulação) | ❌ ausente | não pode exibir correção real |
| `proximaAssembleia` | ancorar mês do simulador | ❌ ausente | simulador sem data real de assembleia |
| `embeddedBid` / `minimumBidPercentage` | cenário de lance embutido | ❌ ausente | embutido sem % real da fonte |
| `reserveFundFee`, `insuranceFee` | fluxo de caixa mês a mês | ❌ ausente | fluxo de caixa não tem componentes reais |

> **Ambiguidade honesta (a confirmar com a AGX):** o `_nota` do JSON diz "Trilho B self-contract",
> mas a shape casa 1:1 com o **Trilho A / API de Parceiro** (8 campos + `prazo`/`lanceMedio`). Ou a
> resposta do self-contract mudou pra essa shama enxuta, ou o capture veio do trilho de parceiro. **A
> spec assume o pior caso defensável: o que a tela pode afirmar é APENAS o conjunto de 10 campos
> acima.** Se a descoberta de fato ainda receber a shape rica em runtime, os campos extras entram —
> mas SEMPRE coagidos server-side e nunca fabricados (§6).

### 1.2. Os dois trilhos (não confundir)

- **Descoberta (passos 3-4)** — alimenta `recommendation_card` + `comparison_table` (hero + outras).
  Adapter `bevi-self-contract-adapter.ts`; mapper `offer-mapper.ts` (`beviOfferToGroupSummary`).
- **Fechamento (passo 5)** — alimenta `real_offer` (card de confirmação). Re-simula na faixa-alvo
  (`fulfillment.ts:confirmOffer` → `gateway.simulate({valor: creditValue})` + `pickClosestOffer`);
  mapper `partner-offer-mapper.ts` (`partnerOfferToRealOffer`).

---

## 2. Veredito do item 1 — "36 por mês" com prova no código

**Cadeia completa (file:line):**

1. `src/lib/adapters/bevi/offer-mapper.ts:107-108`
   ```ts
   availableSlots: offer.monthlyAwardedQuotas ?? 0,
   contemplationRate: offer.monthlyAwardedQuotas ?? 0,
   ```
   → sem o campo real, `availableSlots = 0`.
2. `src/lib/agent/tools/ai-sdk.ts:142-148` — `contempladosMes` é um parâmetro de tool
   `z.number().int().optional()` que a **LLM preenche**, descrito como *"use o availableSlots
   retornado… omita se não veio da busca"*. **Não há coerção — é confiança no prompt.**
3. `src/lib/agent/orchestrator/directives.ts:236` — instrui a LLM: *"present_recommendation_card …
   E contempladosMes (copie de availableSlots do grupo)"*.
4. `src/lib/agent/orchestrator/runner.ts:328-350` — o runner **só** coage `simulation_result`
   (`coerceSimulationPayload`, FIX-C3) e `contemplation_dial` (`coerceDialPayload`). O
   `recommendation_card` é empurrado **as-is** (`artifacts.push({ type, payload })`), payload =
   argumentos da LLM. **Nenhum campo do hero é reescrito contra a oferta real.**
5. `src/components/chat/artifacts/recommendation-card.tsx:130-144` — renderiza
   `{payload.contempladosMes} por mês` quando presente.

**Veredito:** o "36 por mês" é um número **não-ancorado / fabricável**. O único campo de
contemplação do retorno real (`taxaContemplacao`, fração 0..1) **não é** uma contagem mensal, e o
campo que o código espera (`monthlyAwardedQuotas`) **não vem** no retorno atual (→ `?? 0`). O "36" não
é derivável de nenhum dado real da resposta; ele existe porque a arquitetura **permite** a LLM digitar
qualquer inteiro no card sem coerção — violação direta da **Lei 3** (nunca aja/apresente sobre
entidade não-ancorada; *parameter fabrication*) e da **Lei 5** (sem coerção/observabilidade, "a IA
inventou ou pegou do real?" fica indeterminável). Também fere a regra-mãe "nada fabricado em runtime".

> **Ressalva epistêmica:** não capturei o `recommend_groups` bruto exato do turno que gerou o "36",
> então não afirmo *como fato* que a LLM "inventou o 36 do nada" (ela poderia, em tese, ter copiado um
> `availableSlots` alto de uma resposta rica). Mas isso **não muda o veredito**: um número apresentado
> sem coerção nem observabilidade **é um defeito por construção**, independentemente de ter, por
> acaso, batido com um valor real. O fix é o mesmo.

**O que a comparação com dados reais mostra:** as fixtures reais do self-contract têm
`monthlyAwardedQuotas` = **1, 2, 3** (não 36); o retorno enxuto real **não tem o campo**. "36" não
casa com nenhuma das duas realidades.

---

## 3. Diagnóstico + decisão por item do brief

### 3.1. Item 1 & 4 — contemplação honesta  ✅ decidido (recomendada)

- **Fix de integridade (não-negociável, independe de produto):** o `recommendation_card` passa a ser
  **coagido server-side** no runner, igual ao `simulation_result` — cada campo numérico (incluindo
  `contempladosMes`/liquidez) é reescrito a partir do `GroupSummary` real ancorado; a LLM deixa de
  poder digitar números no hero.
- **UX decidida:** enquanto o retorno real **não** trouxer a contagem real de contemplados
  (`monthlyAwardedQuotas` coagido), o card **não exibe nenhum sinal de contemplação** — nem
  "contemplados/mês", nem `taxaContemplacao` como % (semântica TBD com a AGX). Zero risco de promessa
  (CDC art. 30/37). Quando/se a Bevi devolver a contagem real, o card volta a exibir "N/mês" **coagido**.
- **Divergência consciente do docx:** a jornada canônica lista "contemplados/mês" como benefício do
  passo 4. Mantemos o SLOT no design, mas **condicionado a dado real ancorado** — a jornada valida
  contra a fonte, e a fonte hoje não dá o número. É honestidade, não regressão. (Registrar no
  gap-analysis da jornada.)

### 3.2. Item 2 — `tipoOferta` (SPECIAL_OFFER × FREE_BID)  ✅ decidido (recomendada)

- Significado (docs/integracoes): `SPECIAL_OFFER` = oferta especial; `FREE_BID` = lance livre
  (existe também `EMBEDDED_BID` na shape rica, ausente no retorno enxuto). O **mesmo grupo** aparece
  em mais de uma modalidade (ex.: CANOPUS 8120 como SPECIAL_OFFER **e** FREE_BID).
- **Decisão:** usar `tipoOferta` como **critério invisível** de ranking/seleção — **sem** poluir a UI
  com jargão de tipo:
  - **Dedup por (administradora + grupo):** nunca mostrar o mesmo grupo duas vezes só porque veio em
    duas modalidades. (Complementa o FIX-56 que dedup por administradora.)
  - **Afinidade ao perfil de lance:** o usuário respondeu "sim" ao lance no passo 2 → priorizar a
    modalidade coerente com lance (FREE_BID / embutido) na escolha do hero, quando empatar em score.
- **Propagação técnica:** hoje `tipoOferta` nem chega aos payloads de UI da descoberta (só existe no
  `RealOffer` do fechamento). Precisa ser carregado no `GroupSummary`/ranking pra virar critério.

### 3.3. Item 3 — `lanceMedio` na confirmação (79.281 × 181.500)  ⚠️ PENDENTE-AGX + design

- **Prova:** o card `real_offer` mostra `avgBidValue = parseMoney(offer.lanceMedio)` **literal**
  (`partner-offer-mapper.ts:70,84`), rótulo "Lance médio do grupo" (FIX-40, `real-offer.tsx:46-48`).
  O card é alimentado por **re-simulação na faixa-alvo** (`fulfillment.ts:156-169`, `valor: creditValue`
  ≈ 131k). O grupo 1797 tem `lanceMedio` **181.500 na faixa 300k** (evidência) e **≈79.281 na faixa
  ~131k** (tela). Razão ≈ `131.042 / 300.000 = 0,4368` — o `lanceMedio` **escala com a faixa pedida**.
- **Defeito de comunicação:** um "**lance médio do GRUPO**" não deveria mudar conforme o quanto de
  crédito EU pedi — é uma propriedade do grupo, não da minha carta. O rótulo atual induz a erro.
- **Decisão de design (a validar semântica com a AGX):**
  1. **Confirmar com a AGX** o que `lanceMedio` significa (lance médio do grupo em R$ absoluto? %
     do crédito? escalado por carta?). **PENDENTE-AGX.**
  2. Enquanto TBD, **re-rotular** pra não afirmar o que não se sabe: em vez de "Lance médio do grupo",
     usar rótulo factual e proporcional à carta escolhida (ex.: **"Lance de referência (na sua
     faixa)"**) + micro-ressalva "valor estimado; varia por assembleia". Nunca prometer contemplação.
  3. Só exibir quando `> 0` e finito (o mapper já faz — `real-offer.tsx` só renderiza com
     `Number.isFinite`).

### 3.4. Item 7 — `taxaContemplacao: 0` em algumas ofertas  ✅ tratado no ranking

- Ex.: RODOBENS grupo 10801 vem `taxaContemplacao: 0`. O ranking já trata: `contemplationScore`
  (`recommendation.ts:40-43`) mapeia **0 → 0.5 (neutro)** — não pune oferta real sem histórico, não
  a promove. Mantém. Como a UI **não exibe** contemplação (§3.1), não há "0%" enganoso na tela.

### 3.5. Item 5 — ranking hero + secundários (FIX-96)  ⚠️ decidido (recomendada) · PENDENTE-Bernardo

- **Estado real do código:**
  - `recommendation.ts` **não tem teto** por default (`topN = Infinity`; comentário linha 92-94:
    Kairo "não pode limitar"). Dedup FIX-56 = **1 grupo por administradora**.
  - `comparison_table` (carrossel) renderiza **todas** as outras, recomendada em `highlightBestIndex=0`.
  - `other-options.ts` (fluxo "ver outras opções") tem o único teto real: **=2** (docx "as outras 2").
  - `system-prompt.ts:484` afirma "o sistema corta pra um número apresentável" — **stale**: nenhum
    código faz esse corte. (Corrigir a frase.)
- **Decisão:** **hero + 5 secundários visíveis + "ver todas" expansível** (FIX-96). Com ~6
  administradoras após dedup, 5 secundários cobrem quase tudo sem esconder; "ver todas" expande o
  resto sem violar o "não pode limitar" (é corte de **exibição**, não de dados). O `topN` do ranking
  continua Infinity; o corte de 5 é **só na apresentação** (o payload carrega todas; a UI colapsa).
- **PENDENTE-Bernardo:** este é o FIX-96 segurado aguardando aval dele. Fechar a UX aqui.

### 3.6. Item 6 — `valorCarta` 300k → faixa ~131k  ✅ mapeado

- O usuário pede 130k; a Bevi devolve cartas de 300k (denominação do grupo). A tela mostra ~131.042.
- **Mecanismo real:** a descoberta busca por `simulationValue` = valor do bem do passo 2
  (`bevi-self-contract-adapter.ts:167,256-260`); o fechamento **re-simula** na faixa-alvo
  (`fulfillment.ts:160`, `valor: creditValue`). A parcela/lance exibidos são os da faixa, não da carta
  de 300k. **A coerência existe**, mas hoje é **implícita** — o usuário não é avisado de que a carta
  foi ajustada à faixa dele.
- **Decisão de design:** exibir um **aviso discreto de ajuste de crédito** (o "creditAdjustmentNotice"
  / Bv2-08 do brief) quando `valorCarta` bruto ≠ faixa pedida — ex.: *"ajustamos essa carta pra sua
  faixa de ~R$ 131 mil"*. Transparência do que aconteceu, ancorada nos dois números reais.

### 3.7. Item 8 — copy de transição colada ("…simular com os dados corretos.Show…")  🔎 reconfirmar

- Fora do escopo estrito da tela (é comportamento do agente/streaming, FIX-182/183). **Ação:**
  reconfirmar numa conversa nova pós-deploy dos fixes de hoje; se persistir, abre card no inbox
  `anota-bug` (não é design de card).

### 3.8. Item 9 — simulador-agulha (passo 4)  ⚠️ decidido (recomendada) · PENDENTE-Bernardo (T2)

- **Estado:** o `contemplation_dial` existe e É coagido server-side (`coerceDialPayload`,
  `runner.ts:334-346`), ancorado no snapshot da oferta. Bom.
- **Tensão T2 (não resolver cego):** `contemplation-dial.ts:116` abate **só `ownCashValue`** (dinheiro
  do bolso) do saldo — o **embutido NÃO amortiza** a dívida (segue CONTEXT D18/C4: "embutido reduz o
  crédito líquido, não a dívida"). O **docx/jornada (P5)** quer o oposto: embutido amortiza → parcela
  pós-contemplação CAI mais. Ex. BB: código mostra ~R$ 9.828,92 onde a jornada quer ~R$ 5.238.
  **Decisão do Bernardo (T2).** — **PENDENTE-Bernardo.**
- **Decisão de escopo do refino (dado o retorno enxuto):** o simulador só pode ancorar no que é REAL
  hoje: `parcela`, `prazo`, `valorCarta` (faixa), `lanceMedio` (com a ressalva §3.3). **Não exibir**
  correção INCC/IPCA, data de assembleia real, nem "contemplados/mês" no modo sorteio (campos
  ausentes) — tudo que for projeção vai **rotulado como estimativa** com a premissa em 1 linha
  (conforme `proposta-simulador.md §5`). Os 3 cenários (3/6/12) + agulha ficam, mas honestos sobre a
  fonte. Fluxo de caixa mês a mês fica **fora** deste refino (depende de taxas/correção que a fonte
  não dá) — reabrir quando a AGX expuser os campos.

---

## 4. Arquitetura da tela refinada (mockups conceituais)

### 4.1. Hero — card de recomendação

```
┌──────────────────────────────────────────────┐
│ ☀ Recomendação · Boa compatibilidade         │  ← rótulo qualitativo (score→texto), NUNCA % cru
│                                                │
│  BANCO DO BRASIL                               │  ← administradora (real)
│  R$ 2.365,57 /mês          [faixa ~R$131 mil]  │  ← parcela (coagida) + aviso de ajuste (§3.6)
│                                                │
│  Valor do bem   R$ 131.042    Prazo   72 meses │  ← valorCarta (faixa) + prazo (reais, coagidos)
│  Tipo de grupo  Automóvel                      │  ← category
│  · (sem linha de contemplação — sem dado real) │  ← §3.1: slot condicionado a monthlyAwardedQuotas
│                                                │
│  ▸ Por que esta recomendação?                  │  ← score breakdown (orçamento/prazo; adminFee oculto)
│                                                │
│           [  Tenho interesse  ]                │  ← CTA → interest
└──────────────────────────────────────────────┘
```

Mudanças vs. hoje: (a) remove "Contemplados/mês: 36" (defeito); (b) todos os números coagidos
server-side; (c) aviso de ajuste de faixa quando `valorCarta` bruto ≠ faixa.

### 4.2. Secundários — hero + 5 + "ver todas" (FIX-96, PENDENTE-Bernardo)

```
Outras opções (deduplicadas por administradora, tipoOferta invisível)
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ RODOBENS │ │ CANOPUS  │ │ ÂNCORA   │ │ ITAÚ     │ │ TRADIÇÃO │   ▸ ver todas (N)
│ R$1.756  │ │ R$2.197  │ │ R$2.084  │ │ R$…      │ │ R$…      │
│ 96 meses │ │ 76 meses │ │ 79 meses │ │ …        │ │ …        │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Carrossel/grid mostra **5**; "ver todas" expande o resto. Payload carrega todas (sem teto de dados).

### 4.3. Card de simulação + agulha (passo 4)

```
┌──────────────────────────────────────────────┐
│ Simulação · BANCO DO BRASIL                    │
│ Parcela hoje  R$ 2.365,57      Prazo 72 meses  │  ← coagido do simulate_quota real
│                                                │
│ Contemplação em:  [3] [6] [12] meses  ⟵●⟶      │  ← 3 atalhos + agulha fina
│                                                │
│ Lance de referência (na sua faixa): R$ 79.281  │  ← §3.3 rótulo factual + ressalva, NÃO "do grupo"
│   da carta (embutido)  R$ …   do bolso  R$ …   │  ← só se houver % real; senão premissa rotulada
│ Parcela após contemplação:  R$ …               │  ← ⚠ T2 (embutido amortiza×reduz) PENDENTE-Bernardo
│                                                │
│ ⓘ estimativa — varia por assembleia            │  ← disclaimer CDC
└──────────────────────────────────────────────┘
```

### 4.4. Card de confirmação (RealOffer, passo 5)

```
┌──────────────────────────────────────────────┐
│ ✓ Confirmado com o BANCO DO BRASIL             │
│ Valor do bem   R$ 131.042                      │
│ Parcela        R$ 2.365,57                     │
│ Prazo          72 meses                        │
│ Grupo          1797                            │
│ Lance de referência (na sua faixa)  R$ 79.281  │  ← §3.3 (era "Lance médio do grupo")
│ Administradora BANCO DO BRASIL                  │
│  [ Confirmar e contratar ]  [ Ver outras ]     │
└──────────────────────────────────────────────┘
```

Cada linha só renderiza com `Number.isFinite` (já implementado — BUG-PARCELA-STRING). Campos ausentes
= omitidos, nunca chutados.

---

## 5. Mapeamento dado-real → UI (tabela definitiva)

| Elemento de UI | Campo real da Bevi | Coerção | Se ausente |
|---|---|---|---|
| Administradora | `administradora` | server | — (sempre presente) |
| Parcela | `parcela` (string BRL) → `parseMoney` | server (`coerceSimulationPayload`/novo do hero) | omite (nunca NaN) |
| Valor do bem | `valorCarta` (faixa, re-simulada) | server | omite |
| Aviso de ajuste de faixa | `valorCarta` bruto vs faixa pedida | server | não exibe se iguais |
| Prazo | `prazo` (meses) | server | omite (§FIX-13/39) |
| Tipo de grupo | `category` (derivado do segmento) | server | — |
| Contemplação (contagem) | `monthlyAwardedQuotas` | server | **não exibe** (§3.1) |
| Contemplação (%/faixa) | `taxaContemplacao` | — | **não exibe** (semântica TBD) |
| Lance de referência | `lanceMedio` (escala com faixa) | server, literal | omite se ≤0 |
| tipoOferta | `tipoOferta` | ranking interno | invisível na UI |
| Score/compatibilidade | calculado (`recommendation.ts`) | server | rótulo qualitativo |

---

## 6. Integridade de dados — as 6 leis aplicadas a esta tela

- **Lei 1 (LLM não dirige):** ordem do reveal e seleção são determinísticas (`directives.ts`,
  `recommendation.ts`, `other-options.ts`). Mantém.
- **Lei 3 (nunca sobre entidade não-ancorada):** **o fix central deste refino** — `recommendation_card`
  passa a ser **coagido server-side** (como `simulation_result`); a LLM não fornece mais número algum
  do hero. `contempladosMes`/liquidez/parcela/carta/prazo/lanceMedio vêm do `GroupSummary` real.
- **Lei 4 (não governar por regra-no-prompt):** hoje `contempladosMes` depende de uma **instrução no
  prompt** ("copie de availableSlots") — exatamente o anti-padrão. Vira **código** (coerção), não
  parágrafo.
- **Lei 5 (observabilidade de tool I/O):** logar (estruturado) o `GroupSummary` real vs. o payload
  final do card — pra que "a IA inventou ou pegou do real?" seja sempre respondível.

---

## 7. Cenários de aceite (binários — o que "feito" significa)

1. **Sem fabricação:** dado um `recommend_groups` cujo(s) grupo(s) têm `availableSlots = 0` (retorno
   real sem `monthlyAwardedQuotas`), o hero **NÃO exibe** nenhuma linha de contemplação e **nenhum
   número** de contemplação aparece na tela. (Regressão: cassette + structural.)
2. **Coerção do hero:** se a LLM emitir `present_recommendation_card` com `contempladosMes: 36` (ou
   qualquer número), o card renderizado **ignora** o valor da LLM e usa o `availableSlots` real
   coagido (0 → oculto). (Structural no runner + integration.)
3. **Contemplação real quando existe:** se o retorno trouxer `monthlyAwardedQuotas: 2`, o hero exibe
   "2/mês" (coagido). Nunca um valor diferente do real.
4. **Ranking hero+5:** com ≥6 administradoras deduplicadas, a UI mostra hero + 5 secundários + "ver
   todas"; o payload contém **todas** (sem teto de dados). (UI + snapshot.)
5. **tipoOferta invisível:** o mesmo grupo em SPECIAL_OFFER e FREE_BID aparece **uma única vez**; a UI
   não mostra rótulo de tipo. (Dedup test.)
6. **Lance coerente:** o "Lance de referência" exibido é o `lanceMedio` da faixa re-simulada
   (`Number.isFinite`, `>0`), com ressalva de estimativa; nunca "do grupo" cravado.
7. **Aviso de ajuste:** quando `valorCarta` bruto (300k) ≠ faixa pedida (~131k), a tela exibe o aviso
   de ajuste; quando iguais, não exibe.
8. **Simulador honesto:** o card de simulação/agulha não exibe INCC/IPCA, assembleia real nem
   "contemplados/mês no sorteio" (campos ausentes); projeções vêm rotuladas como estimativa.
9. **T2 não regride cego:** a parcela pós-contemplação mantém o modelo atual (só bolso amortiza) até
   decisão do Bernardo; nenhum "fix" unilateral reabre a tensão.

---

## 8. O que muda — backlog para `todo-blocks` (implementação futura)

> Não implementar nesta sessão. Blocos sugeridos (paralelizáveis):

- **B1 — Coerção server-side do `recommendation_card`** (Lei 3/4/5): estender o runner
  (`runner.ts:328-350`) pra coagir o hero contra o `GroupSummary` real; remover `contempladosMes` como
  input livre da LLM (`ai-sdk.ts:142`), ajustar `directives.ts:236`. + regressão (structural +
  cassette do "36").
- **B2 — Contemplação condicionada a dado real** (`recommendation-card.tsx:130-144`): ocultar o slot
  quando `monthlyAwardedQuotas`/`availableSlots` ausente/0; nunca `taxaContemplacao` como %.
- **B3 — Aviso de ajuste de faixa** (creditAdjustmentNotice, §3.6): componente + regra `valorCarta`
  bruto vs faixa.
- **B4 — Re-rótulo do lance** (§3.3): "Lance de referência (na sua faixa)" no `real-offer.tsx` e no
  simulador; + pergunta à AGX sobre semântica de `lanceMedio`. **PENDENTE-AGX.**
- **B5 — hero + 5 + "ver todas"** (FIX-96): corte de exibição na `comparison-table.tsx` (payload
  intacto); corrigir frase stale `system-prompt.ts:484`. **PENDENTE-Bernardo.**
- **B6 — tipoOferta no ranking** (§3.2): propagar `tipoOferta` ao `GroupSummary`; dedup por
  administradora+grupo; afinidade de lance no desempate.
- **B7 — Simulador honesto vs. retorno enxuto** (§3.8): remover exibição de campos ausentes; rótulos
  de estimativa. **T2 (embutido amortiza×reduz) PENDENTE-Bernardo.**

Cada bloco de comportamento de agente exige as **3 camadas** de regressão (CLAUDE.md do projeto).

---

## 9. Decisões & pendências (registro)

| # | Decisão | Quem | Status |
|---|---|---|---|
| D1 | Contemplação: nada exibido até dado real ancorado + coerção server-side | Recomendada (operador dispensou a rodada) | ✅ |
| D2 | tipoOferta: critério invisível de ranking/dedup, sem jargão na UI | Recomendada (idem) | ✅ |
| D3 | Ranking: hero + 5 + "ver todas" | Recomendada (idem) | ⚠️ **PENDENTE-Bernardo** (FIX-96) |
| D4 | Lance: re-rótulo "de referência (na sua faixa)" | Design | ⚠️ **PENDENTE-AGX** (semântica `lanceMedio`) |
| D5 | Simulador ancorado só no retorno enxuto; projeções rotuladas | Design | ✅ (parcial) |
| D6 | Modelo do lance embutido (amortiza dívida × reduz crédito) | — | ⚠️ **PENDENTE-Bernardo** (T2) |
| D7 | Aviso de ajuste de faixa (300k→~131k) | Design | ✅ |

**Veredito do "36 por mês":** DEFEITO — número não-ancorado/fabricável (prova §2). Não vem da Bevi.
