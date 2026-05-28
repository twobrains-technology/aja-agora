# Bevi / AGX — Histórico de Requests (cookbook reproduzível)

> Log das chamadas HTTP reais exercitadas na engenharia reversa do simulador self-contract
> (Trilho B), em **2026-05-27**. Capturado via Playwright (network) + `fetch` em-página.
> CPF mascarado como `***********`. `storeHash` = `6a1756d4bef180c41e909c07` (público, vem na URL do link).
>
> Base self-contract: `https://core-production-selfcontract-atsb7.ondigitalocean.app`
> Auth: rotas `/unauth/...` — **sem token**, identificação por CPF + fingerprint do device.

---

## 0. Resumo da sequência

```
GET    /unauth/product-self-contract/{hash}/system                          → config de steps + branding
GET    /unauth/product-self-contract/{hash}/segment-resource                → lista de segmentos
GET    /unauth/product-self-contract/{hash}/get-multi-proposal/{cpf}         → propostas do CPF (tratamento 409)
POST   /unauth/product-self-contract/create-proposal/{hash}                  → cria proposta (1 ativa por device)
PATCH  /unauth/product-self-contract/update-step/{hash}/step/oQueVocePretendeAdquirir  → grava segmento
PATCH  /unauth/product-self-contract/update-step/{hash}/step/simulation      → simula → devolve offers[]
PATCH  /unauth/product-self-contract/update-step/{hash}/step/{slug}          → grava cada step do KYC
```

---

## 1. `GET /segment-resource` — segmentos disponíveis

```http
GET /unauth/product-self-contract/6a1756d4bef180c41e909c07/segment-resource
```
**200**
```json
{ "status":"OK","code":200,"success":true,
  "data": { "segmentResource": ["AUTOS","IMOVEL","MOTOS","OUTROS BENS","PESADOS","SERVICOS"] } }
```

---

## 2. `GET /get-multi-proposal/{cpf}` — propostas em andamento (origem do 409)

```http
GET /unauth/product-self-contract/6a1756d4bef180c41e909c07/get-multi-proposal/***********
```
**201** (array de propostas)
```jsonc
[
  { "proposalId":"6a1756f6…", "hashId":"6a1756d4…",
    "status": { "name":"Aguardando inserção da proposta", "systemicValue":"waitingForUniqueCode", "situation":"pending" },
    "proposalNumber": 24165747, "createdAt":"2026-05-27T17:41:26Z", "redirect": true },
  // … demais propostas do CPF
]
```
> Usado pelo dialog "Você tem N propostas em andamento" (retomar × iniciar nova).

---

## 3. `POST /create-proposal/{hash}` — criar proposta (1 ativa por device)

```http
POST /unauth/product-self-contract/create-proposal/6a1756d4bef180c41e909c07
Content-Type: application/json

{ "cpf":"***********", "celular":"62999887766",
  "lgpd": { "aceite": true }, "consultarDados": true, "ignoreOngoingProposals": true }
```
**400** — quando já existe proposta ativa pro device/loja:
```json
{ "status":"BAD_REQUEST","code":400,"success":false,
  "message":"Duplicated Hash: 6a1756d4bef180c41e909c07" }
```
> ⚠️ **Enforcement de 1 proposta ativa por device.** Não dá pra criar proposta paralela enquanto a
> atual não finaliza. O fluxo oficial de "nova proposta" é o botão "Sim" do dialog de 409 na UI.

---

## 4. `PATCH /update-step/.../oQueVocePretendeAdquirir` — gravar segmento

```http
PATCH /unauth/product-self-contract/update-step/6a1756d4bef180c41e909c07/step/oQueVocePretendeAdquirir
Content-Type: application/json

{ "productType": "IMOVEL" }   // AUTOS | IMOVEL | MOTOS | PESADOS | SERVICOS | OUTROS BENS
```
**200** → `{ "status":"OK", "message":"Proposta atualizada com sucesso!", "data": { "selfContract": { … } } }`

---

## 5. `PATCH /update-step/.../simulation` — simular (o coração)

```http
PATCH /unauth/product-self-contract/update-step/6a1756d4bef180c41e909c07/step/simulation
Content-Type: application/json

{ "simulationType": "TOTAL_VALUE",      // | "INSTALLMENT_VALUE"
  "simulationValue": 50000,
  "objective": "FAST_APPROVAL",          // | "INVESTMENT"
  "embeddedPercentage": "30" }           // "30" | "50" | (lance embutido)
```
**200** — ofertas em `data.data.offers[]`:
```jsonc
{ "status":"OK","code":200,"success":true,
  "data": {
    "selfContract": { /* estado completo da proposta */ },
    "data": {
      "offers": [
        { "bank":"RODOBENS","bankLabel":"RODOBENS","group":"2119","term":216,
          "finalValue":80000,"receivedCredit":56000,"importedInstallmentValue":366.51,
          "adminFee":0.29,"reserveFundFee":0,"insuranceFee":0.00032,"adjustmentType":"INCC",
          "proximaAssembleia":"2026-05-13T00:00:00Z","bidPaymentMode":"EMBEDDED","embeddedBid":24000,
          "commission":{"totalRatePercent":"3,50","totalCommission":2800,"deferred":{…}},
          "type":"SPECIAL_OFFER","productType":"IMOVEL" /* …+50 campos */ }
        /* … demais ofertas (admins/grupos) */
      ]
    }
  } }
```
Shape completo do objeto de oferta → [bevi-api-discovery.md §3](./bevi-api-discovery.md#3-shape-real-da-oferta-o-achado-central).

### 5a. Sem oferta (piso de crédito) — não é erro HTTP
Valor abaixo do piso do segmento devolve **200** com `offers: []`:
```json
{ "status":"OK","code":200,"success":true, "message":"Nenhuma oferta gerada para a cota selecionada!",
  "data": { "data": { "offers": [] } } }
```
> Ex.: MOTOS a R$ 15.000 → 0 ofertas; a partir de R$ 20.000 → CANOPUS. Tratar como "aumente o valor".

### 5b. 404 transitório
A 1ª chamada de `simulation` logo após trocar o segmento pode dar **404** (estado do step ainda não
materializado) — repetir após ~400ms resolve. (Visto no network: req #2 = 404, #3+ = 200.)

---

## 6. Sweep usado pra comparar os 6 segmentos

Para cada segmento: `PATCH oQueVocePretendeAdquirir {productType}` → aguarda ~400ms →
`PATCH simulation {TOTAL_VALUE, valor, FAST_APPROVAL, "30"}` → coleta `data.data.offers[]`.

| Segmento | Valor | Resultado |
|---|---|---|
| IMOVEL | 50.000 | 3 ofertas (RODOBENS, ÂNCORA) · INCC |
| AUTOS | 30.000 | 7 ofertas (ITAÚ, BB, ÂNCORA) · IPCA+IGPM |
| MOTOS | 15.000 → 25.000 | 0 (piso) → 1 (CANOPUS) · IPCA |
| PESADOS | 100.000 | 2 ofertas (ITAÚ) · IPCA + PRÉ-FIXADO 3% |
| SERVICOS | 20.000 | 1 oferta (ÂNCORA) · IGPM |
| OUTROS BENS | 20.000 | 2 ofertas (ÂNCORA) · sem correção |

Dados brutos → [`assets/segmentos/<tipo>/offers.json`](./assets/segmentos/). Análise → [bevi-segmentos-comparativo.md](./bevi-segmentos-comparativo.md).

---

## 7. KYC inline + redirect de upload

```http
PATCH /unauth/product-self-contract/update-step/{hash}/step/documentoPessoal           → opcional, pula
PATCH /unauth/product-self-contract/update-step/{hash}/step/dadosDoDocumentoDeIdentidade → RG/órgão/UF/mãe/etc (opcional)
PATCH /unauth/product-self-contract/update-step/{hash}/step/endereco                    → CEP/cidade/etc (opcional)
PATCH /unauth/product-self-contract/update-step/{hash}/step/comprovanteDeEndereco       → opcional, pula
PATCH /unauth/product-self-contract/update-step/{hash}/step/waitingForUniqueCode        → finaliza (inserção assíncrona)
```
- Anexar documento → redireciona pra `https://conexia.agxsoftware.com/proposals?documentsToken=…` (portal AGX).
- Após `waitingForUniqueCode`: inserção assíncrona na administradora → gera `proposalNumber` (ex. 24165747).

---

## Notas de segurança / método

- Rotas `/unauth/...` são **públicas** (sem token) — identificação por CPF + fingerprint do browser
  (FingerprintJS). O resume da proposta ativa é **server-side por device**; limpar cookies/localStorage
  não destrava (a app recomputa o fingerprint).
- **PII**: CPF/nome/IP/`deviceIp` aparecem nos payloads reais — mascarados aqui. Os `offers.json`
  commitados contêm **só specs de oferta** (sem PII). Artefatos brutos com PII ficam em `/tmp/bevi-capture`.

*Captura: Playwright MCP + fetch em-página, 2026-05-27. CPF de teste do operador.*
