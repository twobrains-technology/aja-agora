# Trilho B (self-contract) — Estudo completo de payloads e tipos

> **Captura ao vivo:** 2026-06-28, contra a loja-piloto de **homologação**
> (`BEVI_SELFCONTRACT_HASH=6a1756d4bef180c41e909c07`,
> base `https://core-production-selfcontract-atsb7.ondigitalocean.app`).
> CPF de teste: conta canônica de homologação (valores reais via
> `secrets.sh decrypt contas-teste`; ver `contas-teste-homologacao.md`).
> Sequência exercitada de ponta a ponta; 59 ofertas reais analisadas em 5 segmentos.
> Complementa o cookbook reproduzível `bevi-api-requests.md` (captura de 2026-05-27).

## 0. Visão geral

- **Auth:** nenhuma. Rotas `/unauth/product-self-contract/...`; a loja é identificada
  pelo `storeHash` na URL. Sem token.
- **Estado:** server-side, **1 proposta ativa por loja/device**. O `/system` e os
  `update-step` resolvem a proposta corrente **só pelo hash** (sem CPF nem fingerprint
  no request) — confirmado via curl sem device fingerprint.
- **Envelope padrão** (todas as rotas, exceto `get-multi-proposal`):

```ts
interface SelfContractEnvelope<T> {
  status: "OK" | "CREATED" | "BAD_REQUEST" | string;
  code: number;          // 200 | 201 | 400 | 404 | ...
  success: boolean;      // false → erro tipado
  message?: string;
  data: T;
  errors?: { error: string }; // presente em alguns 400
}
```

- **Sequência canônica:**

```
GET   /{hash}/system                                  → config + steps + estado da proposta
GET   /{hash}/segment-resource                        → segmentos da loja
GET   /{hash}/get-multi-proposal/{cpf}                → propostas do CPF (ARRAY cru, 201)
POST  /create-proposal/{hash}                         → cria proposta (CPF+celular+LGPD)
PATCH /update-step/{hash}/step/oQueVocePretendeAdquirir → grava segmento
PATCH /update-step/{hash}/step/simulation             → simula → offers[]  (o coração)
PATCH /update-step/{hash}/step/{kycSlug}              → KYC (doc, identidade, endereço)
PATCH /update-step/{hash}/step/waitingForUniqueCode   → finaliza (inserção assíncrona)
```

---

## 1. `GET /{hash}/system` — config + estado

Devolve a configuração completa da loja, a lista de steps e o estado da proposta corrente.
`data` (chaves):

```ts
interface SystemData {
  proposal: {
    _id: string;
    corporationId: string;
    currentStep: StepDef;           // o step atual (shape de StepDef abaixo)
    selfContract: SelfContractState; // estado preenchido (§5)
    situation: string;
    status: unknown;
    comesFrom: unknown;
  };
  code: number;
  steps: StepDef[];                 // os 11 steps configurados (§5)
  bank: unknown; metaProduct: unknown; metaProductBank: unknown;
  product: unknown; master: unknown; corporation: unknown; store: unknown;
  directForm: unknown;
  configuration: {                  // chaves observadas:
    useCookies; display; questionLabels; productsUrl;
    documentLink; indicator; appsflyer; disrupture; stepsWithReuseDocument;
  };
  autoFill: boolean;                // true na loja-piloto
  canStartNewProposal: boolean;     // true
  isGroupProposal: boolean;         // false
  isReviewFirst: boolean;           // false
  isAPIDeParceiro: boolean;         // false  ← esta loja é self-contract puro
  waitingFinishFillProposalSelfContract: boolean; // false
  slugLanguage: "pt";
}
```

---

## 2. `GET /{hash}/segment-resource`

```ts
// data:
interface SegmentResource { segmentResource: BeviSegment[]; }
type BeviSegment = "AUTOS" | "IMOVEL" | "MOTOS" | "OUTROS BENS" | "PESADOS" | "SERVICOS";
```

---

## 3. `GET /{hash}/get-multi-proposal/{cpf}` — ARRAY cru (HTTP 201)

Não vem envelope; é um array direto. `cpf` só dígitos.

```ts
type GetMultiProposalResponse = SelfContractProposalRef[];

interface SelfContractProposalRef {
  proposalId: string;     // hex-id
  hashId: string;         // hex-id (≠ storeHash da loja; é da proposta)
  status: {
    name: string;                 // "Espera Consulta Corsorcio" (sic) | "Aguardando inserção..."
    systemicValue: string;        // "consultaConsorcioBevicred" | "waitingForUniqueCode" | ...
    situation: "pending" | string;
    sort?: number;
    notification?: { toAcessGroupIds: string[] };
    _id?: string;
  };
  situation?: "pending" | string;
  proposalNumber: number;         // ex 25064653
  createdAt: string;              // ISO
  redirect: boolean;
}
```

> Observado: o CPF de teste tinha **várias** propostas `pending` em
> `consultaConsorcioBevicred` — histórico acumula na loja-piloto.

---

## 4. `POST /create-proposal/{hash}`

Request:

```ts
interface CreateProposalRequest {
  cpf: string;            // só dígitos
  celular: string;        // só dígitos
  lgpd: { aceite: boolean };
  consultarDados: boolean;        // true → puxa nome/nascimento da Receita
  ignoreOngoingProposals: boolean;
}
```

Sucesso (`200`): `data: { selfContract: { hashId: string } }`.

**Erro de proposta ativa (`400`)** — confirmado ao vivo, **mesmo com
`ignoreOngoingProposals:true`**:

```json
{ "status":"BAD_REQUEST","code":400,"success":false,
  "message":"Duplicated Hash: 6a1756d4bef180c41e909c07",
  "errors":{"error":"Duplicated Hash: 6a1756d4bef180c41e909c07"} }
```

---

## 5. Steps (fluxo de fechamento) — `update-step/{hash}/step/{slug}`

Os 11 steps configurados (de `GET /system → data.steps`), em ordem de `order`:

| order | slug | stepTypeCode | state | campos (PATCH body) |
|---|---|---|---|---|
| 0 | `dadosIniciais` | — | init | `cpf*`, `celular*`, `lgpd*`, aceite consulta CPF* |
| 1 | `consultaConsorcioBevicred` | 78 | waiting | (assíncrono, sem input) |
| 2 | `preenchimento` | — | init | `nome*`, `dataNascimento*` |
| 3 | `oQueVocePretendeAdquirir` | 77 | init | `productType` (BeviSegment) |
| 4 | `esperaMelhorOferta` | 79 | waiting | (assíncrono) |
| 5 | `simulation` | 80 | init | ver §6 |
| 6 | `documentoPessoal` | 8 | init | upload (redireciona ao portal CONEXIA) |
| 7 | `dadosDoDocumentoDeIdentidade` | — | init | `rg`, `orgaoEmissor`, `ufEmissor`, `dataEmissao`, `nomeMae`, `genero`(bool), `naturalidadeUf`, `naturalidadeCidade` |
| 8 | `endereco` | 27 | init | `cep`, `estado`, `cidade`, `bairro`, `endereco`, `numero`, `complemento`, `logradouro`, `cepOCR` |
| 9 | `comprovanteDeEndereco` | 8 | init | upload (CONEXIA) |
| 10 | `waitingForUniqueCode` | 92 | waiting | finaliza → inserção assíncrona → `proposalNumber` |

`StepDef` (resumido — vem completo no `/system`):

```ts
interface StepDef {
  _id: string; slug: string; name: string; order: number;
  state: "init" | "waiting" | string;
  initialState: string;
  stepType: { slug: string; label: string; stepTypeCode: number; unique: boolean };
  fields: Array<{ name?: string; slug?: string; type: "string" | "boolean"; required?: boolean; options?: unknown[] }>;
  // flags: showInDetails, requiredReview, autoAdvanceAllowed, antiFraudTrigger,
  // enableProposalRestartAtThisStep, notAllowedToReturnFromHere, hidden, ...
}
```

Estado acumulado da proposta (`selfContract`), uma chave por step:

```ts
interface SelfContractState {
  dadosIniciais: {
    cpf: string; celular: string;
    lgpd: { aceite: boolean; codigoAutenticacao: string; dataAceite: string };
    consultarDados: boolean; deviceIp: string; hashId: string;
    metaProductBankId: string;
    dataNascimento?: string;  // "1993-02-09" (da Receita)
    nomeCompleto?: string;    // nome completo (vem da Receita via consultarDados)
    chosenLetter?: string;
  };
  preenchimento: { nome: string; dataNascimento: string };
  consultaConsorcioBevicred: { finished: boolean; redo: boolean; order: number; ... };
  oQueVocePretendeAdquirir: { productType: BeviSegment };
  esperaMelhorOferta: { finished: boolean; redo: boolean; order: number; ... };
  simulation: { simulationType: string; simulationValue: number; objective: string };
  documentoPessoal: { finished: boolean; order: number; ... };
  dadosDoDocumentoDeIdentidade: { order: number; ... };
  endereco: { hashId: string; order: number; ... };
  comprovanteDeEndereco: { finished: boolean; order: number; ... };
  waitingForUniqueCode: { finished: boolean; redo: boolean; order: number; ... };
}
```

Resposta do `update-step` (ex. `setSegment`):

```ts
interface UpdateStepResponse {
  selfContract: SelfContractState;
  currentStep: StepDef;
  skipEmptyFieldStepToSlug?: string;
  situation: string;
  systemicValue: string;        // slug do step gravado
  skipUpdateProposal?: boolean;
  shouldWaitForFinished?: boolean;
}
```

---

## 6. `PATCH .../step/simulation` — o coração

Request:

```ts
interface SimulationRequest {
  simulationType: "TOTAL_VALUE" | "INSTALLMENT_VALUE"; // default TOTAL_VALUE
  simulationValue: number;
  objective: "FAST_APPROVAL" | "INVESTMENT";           // default FAST_APPROVAL
  embeddedPercentage?: "30" | "50";                    // omitido quando sem lance embutido
}
```

Resposta: `data.selfContract` + **`data.data.offers: BeviSelfContractOffer[]`**.
Piso de crédito = `200` com `offers: []` (não é erro) e
`message: "Nenhuma oferta gerada para a cota selecionada!"`.

> Quirks ao vivo: `404` transitório na 1ª simulação após trocar segmento
> (retry ~400ms) e cold-start do DigitalOcean (timeout 30s p/ a simulação).

### 6.1 `BeviSelfContractOffer` — interface completa (72 campos)

Tipos inferidos de 59 ofertas reais (AUTOS, IMOVEL, MOTOS×2, SERVICOS). `number`
cobre int|float observados. Decimais em vírgula são **string** (parse `,`→`.`).

```ts
interface BeviSelfContractOffer {
  // — Identificação —
  quotaId: string;                  // hex-id(24) — id estável da cota
  group: string;                    // nº do grupo ("540")
  bank: string;                     // ITAU | ANCORA | "BANCO DO BRASIL" | RODOBENS | CANOPUS | TRADICAO
  bankLabel: string;                // rótulo com acento ("ÂNCORA", "ITAÚ", "TRADIÇÃO")
  productType: BeviSegment;         // AUTOS | IMOVEL | MOTOS | SERVICOS (entre os simulados)
  productTypeLabel: string;         // "AUTOS" | "IMÓVEL" | "MOTOS" | "SERVIÇOS"
  quotaTipo: BeviSegment;           // = productType
  type: "SPECIAL_OFFER" | "FREE_BID" | "EMBEDDED_BID";
  bidType: "FREE" | string;         // só "FREE" observado
  highlight: boolean;

  // — Valores da carta —
  finalValue: number;               // valor da carta
  individualQuotaValue: number;     // valor da cota individual
  receivedCredit: number;           // crédito líquido recebido
  creditNetAfterContemplation: number;
  lookupCeiling: number;            // teto de consulta
  quotaLookupValue: number;

  // — Parcela / prazo —
  installmentValue: number;         // parcela "técnica"
  importedInstallmentValue: number; // parcela "limpa" exibida na UI
  term: number;                     // prazo total (meses) — range 12..222
  remainingInstallmentsAfterContemplation: number;
  paidInstallmentsBeforeContemplation: number;
  paidInstallmentsAmountBeforeContemplation: number;
  prazoPagamentoBoleto: "MENSAL" | "QUINZENAL" | "SEMANAL";

  // — Taxas / custos —
  adminFee: number;                 // fração (0.27 = 27%) — range 0.14..0.35
  reserveFundFee: number;           // fração
  reserveFundAmount: number;        // R$
  insuranceFee: number;             // fração
  insuranceTotalAmount: number;     // R$
  seguroPrestamista: number;        // fração (= insuranceFee observado)
  totalPaid: number;                // custo total
  totalDue: number;                 // = totalPaid observado

  // — Lance —
  bidPaymentMode: "EMBEDDED" | "PAY_IN_FULL";
  bidPercentBase: "CREDIT" | "INSTALLMENT";
  bidPercentage: number;            // fração — lance TOTAL necessário (NÃO o % embutido)
  embeddedBid: number;              // R$ do lance embutido (0 quando PAY_IN_FULL)
  embeddedBidAcceptancePercentage: "0,00" | "10,00" | "20,00" | "30,00" | "50,00"; // teto REAL embutido (string vírgula)
  totalBidAmount: number;
  ownBidAmount: number;             // sempre 0 observado
  offeredBid: number;               // sempre 0 observado
  offeredBidPercentage: number;     // sempre 0 observado
  bidAmount: number;
  averageBid: number;
  averageBidFromTotalPercentage: number; // fração
  averageBidPercentage: number;          // fração (= acima)
  bidDifference: number;            // negativo observado
  bidDifferencePercentage: number;
  necessaryBidToContemplate: number;       // R$
  necessaryBidToContemplatePercentage: number; // fração
  minimumBidPercentage: number;     // fração
  minimumValueToBeContemplatedBrl: number; // R$
  minContemplationPaymentBrl: number;      // R$ (= acima)
  lowestContemplationRate: number;  // fração

  // — Contemplação / liquidez do grupo —
  monthlyAwardedQuotas: number;     // contemplados/mês (0..143)
  contemplacaoTotal: number;        // ⚠️ NOVO — total de contemplados (2..144)
  contemplacaoFaturamento: string;  // "" | "1,00%" | ... (string vírgula, pode ser vazio)
  probContemplacaoMeses: string;    // "6" (string numérica)
  isLanceFixo: boolean;
  qtdLanceFixo: number;
  qtdLanceLivre: number;
  qtdLanceLimitado: number;
  qtdLanceSorteio: number;          // ⚠️ NOVO — só 1 observado

  // — Índice / datas —
  adjustmentType: string;           // FIPE | IGPM | INCC | INPC | IPCA | "PRÉ-FIXADO 5%" | "PRÉ-FIXADO 3%" ...
  proximaAssembleia: string;        // ISO
  proximoVencimento: string;        // ISO
  validityStart: string;            // ISO
  validityEnd: string;              // ISO ("2099-12-31...")

  // — Composição / elegibilidade —
  quantityOfQuotas: number;         // 1..6 — nº de cotas que compõem a oferta
  quotaComposition: QuotaComposition[]; // ⚠️ NOVO — detalhe por cota (oferta pode ser multi-cota)
  quotaEligiblePurchasesText: string;   // ⚠️ NOVO — texto livre do que a carta permite comprar

  // — Comissão / misc —
  commissionInstallmentsQty: number; // 3..14
  temEstorno: boolean;
  commission: BeviCommission;
}

interface QuotaComposition {        // ⚠️ NOVO — itens que somam a oferta
  quotaId: string;
  group: string;
  unitLetterValueBrl: number;       // valor da carta da cota
  unitInstallmentBrl: number;       // parcela da cota
  quantity: number;
  term: number;
  adminFee: number;                 // fração
}

interface BeviCommission {
  totalRatePercent: string;         // "3,50" (string vírgula)
  totalCommission: number;          // R$
  commissionInstallmentsQty: number;
  deferred: Record<DeferredBucket, { ratePercent: string; installmentCommission: number }>;
}
type DeferredBucket =               // buckets observados (d30..d420)
  | "d30" | "d60" | "d90" | "d120" | "d150" | "d180" | "d210"
  | "d240" | "d270" | "d300" | "d330" | "d360" | "d390" | "d420";
```

---

## 7. Enums canônicos (consolidados das 59 ofertas)

| Enum | Valores observados |
|---|---|
| `BeviSegment` | AUTOS, IMOVEL, MOTOS, OUTROS BENS, PESADOS, SERVICOS |
| `bank` | ITAU, ANCORA, BANCO DO BRASIL, RODOBENS, CANOPUS, TRADICAO |
| `type` | SPECIAL_OFFER, FREE_BID, EMBEDDED_BID |
| `bidPaymentMode` | EMBEDDED, PAY_IN_FULL |
| `bidPercentBase` | CREDIT, INSTALLMENT |
| `prazoPagamentoBoleto` | MENSAL, QUINZENAL, SEMANAL |
| `embeddedBidAcceptancePercentage` | "0,00", "10,00", "20,00", "30,00", "50,00" |
| `adjustmentType` | FIPE, IGPM, INCC, INPC, IPCA, "PRÉ-FIXADO 5%" (+ "PRÉ-FIXADO 3%" no cookbook) |

> ⚠️ Enums são **abertos** (homologação, 1 loja). Modelar como union **+ fallback string**;
> nunca lançar por valor desconhecido em runtime.

---

## 8. Gaps vs implementação atual (`offer-mapper.ts`)

1. **Cobertura de campos:** o `BeviOffer` atual modela **26** campos; o payload real
   traz **72**. 46 campos ignorados — incluindo `quotaComposition`, `type`,
   `bidPaymentMode`, `contemplacaoTotal`, `quotaEligiblePurchasesText`, toda a
   `commission`.
2. **`adjustmentType` colapsado:** o mapper reduz tudo a `INCC | IPCA`. O real tem
   6+ índices (FIPE, INPC, PRÉ-FIXADO ...). Hoje FIPE/INPC/PRÉ caem em IPCA com
   `annualPercent` chutado — número exibido ao usuário pode estar errado.
3. **Decimais string:** `embeddedBidAcceptancePercentage`, `commission.*RatePercent`,
   `contemplacaoFaturamento` vêm como `"30,00"` — exigem parse `,`→`.`. O mapper já
   trata o primeiro; os de `commission` não são lidos.
4. **Multi-cota:** `quotaComposition`/`quantityOfQuotas` (até 6 cotas numa oferta)
   não têm representação no domínio — o card assume 1 cota.
5. **Fechamento via Trilho B inexistente:** os steps 6-10 (KYC + `waitingForUniqueCode`)
   não têm cliente nem mapeamento — é o que falta para o Trilho B fechar (objetivo da
   feature "as duas camadas").

---

## 9. Achados operacionais

- **Estado por hash, não por device:** `/system` e `update-step` resolvem a proposta
  corrente só pelo `storeHash` (curl sem fingerprint funcionou). Implica que a
  loja-piloto opera sobre **uma** proposta corrente — concorrência real precisa de
  proposta/identidade isolada (a discovery-session do app já mira isso por conversa).
- **`Duplicated Hash` é inescapável** por flag: `ignoreOngoingProposals:true` não cria
  nova. Para nova jornada: retomar a ativa ou finalizar a anterior.
- **Piso de crédito** varia por segmento e mudou desde 27/05 (MOTOS @ 15k agora
  devolve 2 ofertas; antes era 0). Não hardcodar piso.
- **`consultarDados:true`** preenche nome/nascimento reais (Receita) — fonte do
  `nomeCompleto` no `/system`.

---

*Capturas brutas: `scratchpad/bevi-trilho-b/` (01-system … 10-setsegment).*
