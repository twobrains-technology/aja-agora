# Bevi / AGX — API Discovery (engenharia reversa)

> Levantamento técnico dos **endpoints reais** por baixo do simulador Bevi, capturados via
> Playwright (network) em **2026-05-27**, cruzados com a collection oficial "API de Parceiro".
>
> Há **dois trilhos** sobre o mesmo produto Bevi (`productId 6986245b3518ceb00e7844da`):
> - **Trilho A — "API de Parceiro"** (`api.uxvision.tech/.../credithub/services`): documentado na
>   [collection](./collection/bevi-api-parceiro.postman_collection.json). Gateway RPC via header `service_id`.
> - **Trilho B — "Self-Contract"** (`core-...-selfcontract.ondigitalocean.app`): o que o **simulador
>   web** (`proposta.uxvision.tech`) consome de fato. Camada de auto-contratação que orquestra a Bevi.
>
> Ambos terminam na mesma administradora (RODOBENS, ÂNCORA…). Plataforma: **AGX Software / CONEXIA**.

---

## 1. Trilho A — API de Parceiro (collection oficial)

- **Base:** `https://api.uxvision.tech/api/v1/credithub/services`
- **Auth:** `Authorization: Bearer {apiToken}` (token por loja)
- **Roteamento:** header `service_id` por operação. Envelope `{ status, code, success, message, data }`.
- **TTL da oferta:** `ofertaId` vale **30 min**.

| Ordem | `service_id` | Entrada | Saída |
|---|---|---|---|
| 1 | `insert_proposal_bevi_consorcio` | CPF, CELULAR, TERMO_LGPD, CONSULTA_DE_DADOS, ignoreOngoingProposals | `proposalId` (409 se `ongoingProposalIds`) |
| 2 | `list_segments_bevi_consorcio` | proposalId | `segmentos[]` |
| 3 | `calculate_simulation_bevi_consorcio` | propostaId, segmento, tipoSimulacao (`valor_total`\|`valor_parcela`), valor, objetivo (`investimento`\|`contemplacao_rapida`), lanceEmbutido, temLanceParaOfertar, valorDoLance | `simulationSessionId`, `expiresAt`, `offers[]` |
| 4 | `choose_offer_bevi_consorcio` | propostaId, ofertaId | `consortiumProposalLink` (**redirect** edigital), `cotaProposalId` |
| 5 | `get_document_upload_links_bevi_consorcio` | propostaId | `linkDocumentosPessoais`, `linkComprovanteEndereco` (documentado como **501**) |
| 6 | `insert_additional_data_bevi_consorcio` | documentoIdentidade{...}, endereco{...} | `proposalId` |
| 7 | `consult_proposal_status_bevi_consorcio` | propostaId | `statusName`, `situation`, `approvedAt`, `reprovedAt`, `changesHistory[]` |

---

## 2. Trilho B — Self-Contract (o simulador real)

- **Front:** `https://proposta.uxvision.tech/?code=<link>&agx_hash=<storeHash>`
- **Backend:** `https://core-production-selfcontract-atsb7.ondigitalocean.app`
- **Auth:** rotas `/unauth/...` (públicas; identificação por CPF, sem token).
- **Config da loja:** `agx_hash` (= store hash). Flag `isAPIDeParceiro: false`.

### Endpoints observados

| Método | Endpoint | Função |
|---|---|---|
| GET | `/unauth/product-self-contract/{hash}/system` | **Config completa**: todos os steps, campos, termos, branding |
| GET | `/unauth/product-self-contract/{hash}/get-multi-proposal/{cpf}` | Propostas em andamento do CPF (= tratamento do **409**) |
| POST | `/unauth/product-self-contract/create-proposal/{hash}` | Cria proposta (CPF, celular, aceites, **device fingerprint**, geo) |
| PATCH | `/unauth/product-self-contract/update-step/{hash}/step/{slug}` | Avança/grava cada step (inclui a **simulação** e a **escolha da oferta**) |
| GET | `/unauth/product-self-contract/show-step/{hash}/step/{slug}` | Config de um step |
| GET | `/unauth/product-self-contract/{hash}/segment-resource` | Lista de segmentos |

### Autofill por CPF (importante)
O step `consultaConsorcioBevicred` consulta um bureau e **preenche nome completo + data de
nascimento só com o CPF** — por isso o step `preenchimento` é oculto. Pede-se apenas CPF; o resto vem.

### Segmentos disponíveis (resposta real de `segment-resource`)
```json
["AUTOS","IMOVEL","MOTOS","OUTROS BENS","PESADOS","SERVICOS"]
```
> **Imóvel e Moto existem** (a collection só citava AUTOS/SERVICOS como exemplo). 6 segmentos no total.

### Entrada da simulação (`update-step/.../simulation`)
```json
{ "simulationType": "TOTAL_VALUE", "simulationValue": 50000,
  "objective": "FAST_APPROVAL", "embeddedPercentage": "30" }
```
Mapa de enums (front → API de parceiro):
| Front (self-contract) | API de Parceiro |
|---|---|
| `TOTAL_VALUE` / `INSTALLMENT_VALUE` | `valor_total` / `valor_parcela` |
| `INVESTMENT` / `FAST_APPROVAL` | `investimento` / `contemplacao_rapida` |
| `embeddedPercentage: "30"` | `lanceEmbutido: "30"` |

---

## 3. Shape REAL da oferta (o achado central)

A simulação retorna **um array `offers[]` com múltiplas administradoras e grupos** — não uma
oferta única. Cada oferta é **muito mais rica** que a collection sugeria. Campos observados
(imóvel, R$ 50k pedido → carta R$ 80k com lance embutido 30%):

```jsonc
{
  "bank": "RODOBENS", "group": "2119", "bidType": "FREE",
  "term": 216,                       // PRAZO (meses) ✅
  "finalValue": 80000,               // valor da carta
  "receivedCredit": 56000,           // crédito líquido (carta − lance embutido)
  "installmentValue": 396.52, "importedInstallmentValue": 366.51,
  "totalPaid": 110333.18,            // CUSTO TOTAL ✅
  "adminFee": 0.29,                  // TAXA DE ADMINISTRAÇÃO ✅
  "reserveFundFee": 0,               // FUNDO DE RESERVA ✅ (Âncora: 0.02)
  "insuranceFee": 0.00032, "seguroPrestamista": 0.00032,  // SEGURO ✅
  "adjustmentType": "INCC",          // ÍNDICE DE CORREÇÃO ✅ (imóvel=INCC)
  "proximaAssembleia": "2026-05-13", // ASSEMBLEIA ✅
  "probContemplacaoMeses": "6",      // prob. de contemplação
  "lowestContemplationRate": 0.7315, // % de lance p/ contemplar
  "monthlyAwardedQuotas": 2,         // cotas contempladas/mês
  // --- lance (núcleo do diferencial) ---
  "bidPaymentMode": "EMBEDDED", "embeddedBid": 24000, "bidPercentage": 0.3,
  "averageBid": 58520, "necessaryBidToContemplate": 34520,
  "offeredBid": 0, "bidDifference": -34520,
  // --- comissão do PARCEIRO (modelo de receita) ✅ ---
  "commission": { "totalRatePercent": "3,50", "totalCommission": 2800,
    "deferred": { "d30": {...}, "d60": {...}, "d90": {...} } },
  "quotaId": "6a0ca9ca...", "validityStart": "...", "validityEnd": "...",
  "type": "SPECIAL_OFFER" /* | "EMBEDDED_BID" */, "productType": "IMOVEL"
}
```

### Exemplo do leque retornado (imóvel, R$ 50k, contemplação rápida, embutido 30%)
| Admin | Grupo | Carta | Parcela | Prazo | Taxa adm | Fundo | Correção | Comissão |
|---|---|---|---|---|---|---|---|---|
| RODOBENS | 2119 | R$ 80k | R$ 366,51 | 216m | 29% | 0% | INCC | 3,5% (R$ 2.800) |
| ÂNCORA | 704 | R$ 80k | R$ 547,89 | 198m | 26% | 2% | INCC | 5,0% (R$ 4.000) |
| RODOBENS | 2117 | R$ 80k | R$ 424,71 | 180m | 26% | 0% | INCC | 3,5% (R$ 2.800) |

> **Conclusão de discovery:** a oferta real entrega **todos os campos** que o Aja precisa (taxa,
> prazo, fundo, seguro, correção, assembleia, contemplação) **e a comissão do parceiro**. A
> collection era um exemplo minimalista — a API real é completa.

---

## 4. Escolha da oferta & fechamento

- **Escolher oferta:** no self-contract NÃO há endpoint separado — a oferta escolhida é gravada no
  próprio `update-step/.../simulation` com `finished: true` + o objeto da oferta. (Na API de
  Parceiro = `choose_offer`, que devolve `consortiumProposalLink`/redirect.)
- **KYC inline:** documento pessoal → dados de identidade → endereço (conta de luz) → comprovante.
  **Todos opcionais**, não bloqueiam. Upload abre portal `conexia.agxsoftware.com/proposals?documentsToken=...`.
- **Final (`waitingForUniqueCode`):** inserção **assíncrona** na administradora → gera nº da proposta
  (ex.: `24164206`, status "Pendente em fluxo"). Pode levar minutos.

> **Insight:** o self-contract faz **KYC inline sem redirect** — prova que o "sem redirect" do Aja é
> tecnicamente viável na plataforma AGX (o redirect da API de Parceiro não é limitação absoluta).

---

*Captura: Playwright MCP, 2026-05-27. Artefatos brutos com PII (CPF/nome/IP) ficam fora do repo (`/tmp/bevi-capture`).*
