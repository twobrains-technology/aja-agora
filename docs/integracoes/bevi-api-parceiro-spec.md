# Bevi / AGX — API de Parceiro: SPEC de implementação do adapter real

> **Para:** quem vai implementar a integração real dentro de `src/lib/adapters/bevi/`.
> **Status:** ✅ Token **liberado e validado end-to-end em 2026-06-02** contra produção
> (`api.uxvision.tech`). Todos os 7 endpoints + edge cases exercitados com dados reais
> (loja-piloto de teste, CPF de teste `12345678909`). Os payloads/respostas abaixo são
> **capturas reais**, não exemplos da doc.
> **Fonte primária:** esta spec + a doc oficial Postman
> (`https://documenter.getpostman.com/view/21482937/2sBXwmQsof`) + a collection em
> `docs/integracoes/collection/bevi-api-parceiro.postman_collection.json`.

---

## 0. TL;DR para o implementador

1. A API de parceiro é um **gateway RPC**: tudo é `POST` (e um `GET`) para **uma única URL**
   (`/api/v1/credithub/services`), e a operação é escolhida pelo header **`service_id`**.
2. A API é **proposta-first e stateful**: você **não consegue simular sem antes criar uma
   proposta** (que exige CPF + celular + aceite LGPD). Tudo gira em torno de um `proposalId`.
3. A **oferta retornada tem só 8 campos** — bem mais pobre que o shape de 68 campos do
   self-contract de onde saíram as fixtures atuais. **O `offer-mapper.ts` atual NÃO bate com
   este shape e precisa ser reescrito.** (Detalhe em §7 e §11.)
4. A interface de domínio atual (`AdministradoraAdapter`: `searchGroups`/`simulateQuota`/…) é
   **grupo-cêntrica e stateless** e **não modela** o fluxo de proposta. É preciso decidir a
   arquitetura (§12) antes de codar — recomendação: **split Discovery / Fulfillment**.
5. Cuidados de produção: **1 proposta ativa por CPF** (409), **ofertaId expira em 30 min**,
   **crédito mínimo R$ 15.000**, e **criar proposta = dado real** (LGPD). Ver §15.

---

## 1. Visão geral da API

| Item | Valor |
|---|---|
| Padrão | Gateway RPC — 1 endpoint, operação via header `service_id` |
| Base URL | `https://api.uxvision.tech/api/v1/credithub/services` |
| Endpoint único | `POST {baseUrl}` (exceto "listar segmentos", que é `GET {baseUrl}/segments`) |
| Autenticação | `Authorization: Bearer <apiToken>` (obrigatório em todas) |
| Content-Type | `application/json` (nos POST) |
| `productId` | `6986245b3518ceb00e7844da` (produto Bevi Consórcio) |
| Envelope | `{ status, code, success, message, data }` em **toda** resposta (sucesso e erro) |
| Suporte | suporte@agxsoftware.com |

> ⚠️ **Sobre a URL:** a collection oficial concatena `baseUrl` (que já contém o path) com um
> path repetido, gerando uma URL com `/api/v1/credithub/services` duplicado. **Tanto a forma
> duplicada quanto a canônica funcionam** (a auth/roteamento vive sob o prefixo `/api/`).
> Use a **forma canônica** (`{baseUrl}` direto, sem repetir o path). Validado: as duas
> retornam idêntico.

### Envelope de resposta (invariante)

Toda resposta — 2xx, 4xx — vem neste formato:

```jsonc
{
  "status": "OK",          // string: CREATED | OK | BAD_REQUEST | CONFLICT | NOT_FOUND | FORBIDDEN
  "code": 200,             // int — espelha o HTTP status
  "success": true,         // bool
  "message": "…",          // string PT-BR, human-readable
  "data": { /* payload */ } // objeto; em erros, costuma trazer data.errors[] ou data.ongoingProposalIds[]
}
```

O implementador deve ter **um único parser de envelope** que: (a) lê `success`/`code`,
(b) em erro, extrai `message` + `data.errors[]`, (c) em sucesso, devolve `data`.

---

## 2. Autenticação e configuração

Auth é `Authorization: Bearer <token>` — **sem o prefixo `Bearer ` a API responde
"não foi enviada uma autorização"**. O token é uma string opaca (base64, 32 bytes) gerada/
liberada pela AGX quando o **master habilita "configuração do API" para a loja (Sub)** em
`https://conexia.agxsoftware.com/`. Token de uma loja não-liberada retorna
`403 "não foi encontrado usuário para esta token"`.

Config via env (já lida por `loadBeviConfigFromEnv()` em `bevi-api-adapter.ts`):

```bash
ADMINISTRADORA_ADAPTER=bevi
BEVI_API_TOKEN=<token entregue pela AGX>     # obrigatório; sem ele o adapter falha alto
BEVI_BASE_URL=https://api.uxvision.tech/api/v1/credithub/services   # default já correto
BEVI_PRODUCT_ID=6986245b3518ceb00e7844da     # default já correto
```

> O token **nunca** vai no repo. Em prod, vem do secrets manager. Os exemplos desta spec
> usam o token da loja-piloto de teste — **não reusar em prod**.

---

## 3. Modelo mental: o fluxo é stateful e proposta-first

```
[1] insert_proposal            → cria proposalId   (exige CPF, CELULAR, LGPD)
        │
        ▼
[2] list_segments (GET)        → segmentos válidos pra essa proposta
        │
        ▼
[3] calculate_simulation       → offers[] + simulationSessionId + expiresAt(30min)
        │                         (repetir mudando segmento/valor/lance)
        ▼
[4] choose_offer               → consortiumProposalLink (link Bevi p/ o cliente)
        │
        ▼
[5] get_document_upload_links  → links de upload de docs (uselink.me)  [opcional]
[6] insert_additional_data     → documento de identidade + endereço     [opcional]
[7] consult_proposal_status    → statusName + changesHistory             [polling]
```

**Consequências de design (importantes):**

- **Não existe "buscar grupos/ofertas anônimo" neste trilho.** Toda simulação exige um
  `proposalId`, que exige CPF real. Ou seja: a API de parceiro é o canal de **fechamento**,
  não de **descoberta anônima**. (Para descoberta sem CPF, ver o Trilho B self-contract em
  `bevi-api-requests.md` e a decisão em §12.)
- **A simulação acontece DENTRO da proposta** e muda o estado dela (o status anda pra
  `simulation`, ver §9). Re-simular sobrescreve.
- **1 proposta ativa por CPF**: criar uma segunda com `ignoreOngoingProposals:false` →
  **409** com a lista de propostas em andamento. Com `true`, cria mais uma.

---

## 4. Referência dos endpoints

> Headers comuns em **todos**: `Authorization: Bearer <token>`. Nos POST, também
> `Content-Type: application/json`. O `service_id` define a operação.

### 4.1 — Inserir proposta

```
POST {baseUrl}
service_id: insert_proposal_bevi_consorcio
```

Request:

```jsonc
{
  "productId": "6986245b3518ceb00e7844da", // obrigatório
  "CPF": "12345678909",                    // obrigatório — UPPERCASE (igual à Auto-Contratação)
  "CELULAR": "11999998888",                // obrigatório — UPPERCASE
  "TERMO_LGPD": true,                      // obrigatório — exibir termos antes (pasta "Termos legais")
  "CONSULTA_DE_DADOS": true,               // obrigatório
  "ignoreOngoingProposals": false          // false = falha 409 se já houver proposta ativa pro CPF
}
```

> ⚠️ Estes 5 campos de negócio são **UPPERCASE** (`CPF`, `CELULAR`, `TERMO_LGPD`,
> `CONSULTA_DE_DADOS`) — herança da Auto-Contratação. Todos os **demais** endpoints usam
> camelCase (`propostaId`, `segmento`, …). Atenção redobrada no client.

Response **201**:

```json
{ "status":"CREATED","code":201,"success":true,"message":"Proposta criada com sucesso!",
  "data": { "proposalId":"6a1f346110ffff8984ace724", "productId":"6986245b3518ceb00e7844da" } }
```

### 4.2 — Listar segmentos

```
GET {baseUrl}/segments?proposalId={proposalId}
service_id: list_segments_bevi_consorcio   (opcional em GET — inferido pelo path)
```

Response **200**:

```json
{ "status":"OK","code":200,"success":true,"message":"Segmentos disponíveis.",
  "data": { "segmentos": [
    {"segmento":"AUTOS","segmentoLabel":"AUTOS"},
    {"segmento":"IMOVEL","segmentoLabel":"IMÓVEL"},
    {"segmento":"MOTOS","segmentoLabel":"MOTOS"},
    {"segmento":"OUTROS BENS","segmentoLabel":"OUTROS BENS"},
    {"segmento":"PESADOS","segmentoLabel":"PESADOS"},
    {"segmento":"SERVICOS","segmentoLabel":"SERVIÇOS"}
  ] } }
```

> `proposalId` inexistente → **404** `{ data.errors:[{field:"proposalId", message:"Proposta não encontrada."}] }`.

### 4.3 — Simular (o coração)

```
POST {baseUrl}
service_id: calculate_simulation_bevi_consorcio
```

Request:

```jsonc
{
  "propostaId": "6a1f346110ffff8984ace724",  // camelCase! (note: "proposta", não "proposal")
  "segmento": "AUTOS",                        // um dos §4.2
  "tipoSimulacao": "valor_total",             // "valor_total" | "valor_parcela"  (ver §8)
  "valor": 50000,                             // crédito desejado (R$) ou parcela desejada (R$)
  "objetivo": "contemplacao_rapida",          // "contemplacao_rapida" | "investimento" (ver §8)
  "lanceEmbutido": "nenhum",                  // "nenhum" | "25" | "30" | "50" … (% como string)
  "temLanceParaOfertar": false,               // bool — usuário tem lance próprio pra ofertar?
  "valorDoLance": 10000                       // R$ do lance próprio (só quando temLanceParaOfertar:true)
}
```

Response **200**:

```jsonc
{ "status":"OK","code":200,"success":true,"message":"Simulação realizada com sucesso.",
  "data": {
    "simulationSessionId": "9bd8d045-4ebe-42c6-8bce-41962a1c2445",
    "expiresAt": "2026-06-02T20:22:05.006Z",   // ⏱ TTL ~30 min — ofertaId só vale até aqui
    "errors": [],
    "offers": [ /* §7 — shape de 8 campos */ ]
  } }
```

> **404 transitório:** a 1ª chamada de `simulation` logo após criar a proposta / trocar
> segmento pode dar **404** (estado do step ainda materializando). **Repetir após ~400–500ms
> resolve** (visto no discovery e reproduzido agora). Implemente retry (3–4 tentativas, backoff
> curto) **só para o 404 nesta operação**.

### 4.4 — Escolher oferta

```
POST {baseUrl}
service_id: choose_offer_bevi_consorcio
```

Request: `{ "propostaId": "...", "ofertaId": "<offer.ofertaId>" }`

Response **200**:

```json
{ "status":"OK","code":200,"success":true,"message":"Oferta selecionada com sucesso.",
  "data": { "proposalId":"6a1f346110ffff8984ace724",
            "consortiumProposalLink":"https://www.uselink.me/eG6HvJ8UB" } }
```

> `consortiumProposalLink` é o link Bevi (encurtado `uselink.me`) que conclui a jornada do
> lado do cliente. **É o artefato de saída do fechamento.** O `ofertaId` precisa pertencer à
> última simulação e estar dentro do TTL (senão erro — confirmar mensagem em prod).

### 4.5 — Links de documentos (opcional)

```
POST {baseUrl}
service_id: get_document_upload_links_bevi_consorcio
```

Request: `{ "propostaId": "..." }`

Response **200** (⚠️ a doc marcava como `501 TBD`, mas **já está implementado** — 200):

```json
{ "status":"OK","code":200,"success":true,"message":"Links de envio de documentos obtidos.",
  "data": { "proposalId":"6a1f346110ffff8984ace724",
            "linkDocumentosPessoais":"https://www.uselink.me/LthFB9jQe",
            "linkComprovanteEndereco":"https://www.uselink.me/L8rIMe$Sfw" } }
```

### 4.6 — Dados complementares (opcional)

```
POST {baseUrl}
service_id: insert_additional_data_bevi_consorcio
```

Request:

```jsonc
{
  "propostaId": "...",
  "documentoIdentidade": {
    "tipoDocumento": "RG", "numeroDaIdentidade": "123456789",
    "ufEmissor": "SP", "dataEmissao": "2010-01-15", "orgaoEmissor": "SSP"
  },
  "endereco": {
    "cep": "01310100", "estado": "SP", "cidade": "São Paulo",
    "bairro": "Bela Vista", "logradouro": "Avenida Paulista", "numero": "1000"
  }
}
```

Response **200**: `{ … "message":"Dados complementares salvos com sucesso.",
"data": { "proposalId":"..." } }`. Avança o status da proposta (ver §9).

### 4.7 — Consultar status (polling)

```
POST {baseUrl}
service_id: consult_proposal_status_bevi_consorcio
```

Request: `{ "propostaId": "..." }`

Response **200** (ver máquina de estados em §9):

```jsonc
{ "status":"OK","code":200,"success":true,"message":"Status da proposta consultado com sucesso.",
  "data": {
    "proposalId":"6a1f346110ffff8984ace724",
    "statusName":"Endereço", "situation":"pending",
    "statusDescription":null, "integrationCode":null,
    "createdAt":"…","updatedAt":"…","approvedAt":null,"reprovedAt":null,
    "changesHistory":[ /* transições — §9 */ ]
  } }
```

---

## 5. Quick reference — tabela de `service_id`

| # | Operação | Método | `service_id` | Cria/muta? |
|---|---|---|---|---|
| 1 | Inserir proposta | POST | `insert_proposal_bevi_consorcio` | cria proposta |
| 2 | Listar segmentos | GET | `list_segments_bevi_consorcio` | não (read) |
| 3 | Simular | POST | `calculate_simulation_bevi_consorcio` | muta (status→simulation) |
| 4 | Escolher oferta | POST | `choose_offer_bevi_consorcio` | muta |
| 5 | Links de documentos | POST | `get_document_upload_links_bevi_consorcio` | não (read) |
| 6 | Dados complementares | POST | `insert_additional_data_bevi_consorcio` | muta |
| 7 | Consultar status | POST | `consult_proposal_status_bevi_consorcio` | não (read) |

## 6. Template de chamada (canônico)

```bash
# POST genérico (troque service_id e o body)
curl -sS -X POST 'https://api.uxvision.tech/api/v1/credithub/services' \
  -H "Authorization: Bearer $BEVI_API_TOKEN" \
  -H 'service_id: <service_id>' \
  -H 'Content-Type: application/json' \
  -d '{ ... }'

# GET (listar segmentos)
curl -sS 'https://api.uxvision.tech/api/v1/credithub/services/segments?proposalId=<id>' \
  -H "Authorization: Bearer $BEVI_API_TOKEN" \
  -H 'service_id: list_segments_bevi_consorcio'
```

Esqueleto do client (TS, `fetch` nativo — sem axios):

```ts
async function callService<T>(serviceId: string, body?: unknown, opts?: { method?: string; qs?: string }) {
  const res = await fetch(config.baseUrl + (opts?.qs ?? ""), {
    method: opts?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      service_id: serviceId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const env = await res.json(); // { status, code, success, message, data }
  if (!env.success) throw new BeviApiError(env.code, env.message, env.data?.errors, env.data);
  return env.data as T;
}
```

## 7. Shape REAL da oferta (o ponto crítico do mapper)

A simulação devolve `data.offers[]`. **Cada oferta tem exatamente estes 8 campos:**

```jsonc
{
  "ofertaId": "f4c76aee-2b7b-4ce5-89b4-f4c197e7c364", // ID p/ choose_offer (UUID; expira c/ a sessão)
  "administradora": "ANCORA",       // ANCORA | BANCO DO BRASIL | CANOPUS | ITAU | RODOBENS | TRADICAO …
  "tipoOferta": "SPECIAL_OFFER",    // "SPECIAL_OFFER" | "FREE_BID"
  "grupo": "540",                   // nº do grupo (string)
  "valorCarta": 36000,              // R$ — valor da carta de crédito
  "parcela": 426.06732203389834,    // R$ — parcela mensal (NÃO arredondada)
  "taxaContemplacao": 0.6776,       // fração — "taxa de contemplação" (semântica a confirmar*)
  "quotaId": "6a1993f30e110071d518de03" // ID da cota
}
```

\* **`taxaContemplacao`**: valor entre ~0.40 e ~0.74 nas capturas. **Semântica não documentada
oficialmente** — provavelmente um score/probabilidade histórica de contemplação do grupo, NÃO
uma taxa de administração. **Confirmar com a AGX antes de exibir como número pro usuário.**
Não confundir com `adminFee`.

### 7.1 — Contraste com o self-contract (de onde vieram as fixtures)

| | API de Parceiro (Trilho A, este doc) | Self-contract (Trilho B, fixtures atuais) |
|---|---|---|
| Campos por oferta | **8** | **68** |
| Tem `term` (prazo)? | ❌ **não** | ✅ `term` |
| Tem taxa adm? | ❌ não (só `taxaContemplacao`, outra coisa) | ✅ `adminFee`, `reserveFundFee`, `insuranceFee` |
| Tem correção (INCC/IPCA)? | ❌ não | ✅ `adjustmentType` |
| Tem lance embutido detalhado? | ❌ não (é só **input** da simulação) | ✅ `embeddedBid`, `receivedCredit`, `necessaryBidToContemplate`, `bidPercentage` |
| Tem custo total? | ❌ não | ✅ `totalPaid`, `totalDue` |
| Tem liquidez do grupo? | ❌ não | ✅ `monthlyAwardedQuotas`, `quantityOfQuotas` |
| Tem próxima assembleia? | ❌ não | ✅ `proximaAssembleia` |

> **Isto é o cerne da tarefa:** `offer-mapper.ts` foi escrito pro shape de 68 campos
> (interface `BeviOffer`). Ele **não funciona** com a oferta de parceiro — quase todos os
> campos que ele lê (`finalValue`, `term`, `adminFee`, `importedInstallmentValue`,
> `adjustmentType`, `embeddedBid`, …) **não existem** aqui. Ver gap completo em §11 e plano
> em §13.

---

## 8. Parâmetros de simulação — efeitos observados

Capturado variando os campos (AUTOS, R$50.000, salvo onde indicado):

| Parâmetro | Valores | Efeito observado |
|---|---|---|
| `tipoSimulacao` | `valor_total` | `valor` = crédito desejado; offers com `valorCarta` próximo (35k–63k p/ 50k) |
| | `valor_parcela` | `valor` = parcela desejada (ex. 800); offers com `parcela` ≤ alvo (~710), 21 ofertas |
| `objetivo` | `contemplacao_rapida` | 24 ofertas; parcela amostra 426,07 |
| | `investimento` | 24 ofertas (mesmas cartas); **parcela difere** (414,23) e ordenação muda |
| `lanceEmbutido` | `nenhum` | 24 ofertas |
| | `"25"` | **4 ofertas**; `valorCarta` sobe (56k–84k), parcela bem maior (~1.513) |
| `temLanceParaOfertar` + `valorDoLance` | `true`, 10000 | 24 ofertas; parcela amostra 1.860 (lance próprio entra no cálculo) |
| `segmento` | `IMOVEL`, valor 200k | 24 ofertas, `valorCarta` 140k–250k |

**Observações para o mapper/cards:**
- O `valor` solicitado **não** é o `valorCarta` da oferta — o sistema casa com **cartas
  disponíveis próximas**. Mostre `valorCarta` real, não o pedido.
- `lanceEmbutido` é **input** que muda as ofertas retornadas (crédito líquido vs bruto). O
  detalhamento "com/sem lance embutido" que o domínio `embeddedBid` espera **não vem pronto**
  na oferta — tem que ser derivado do par de simulações (com e sem lance) ou do próprio input.

---

## 9. Máquina de estados da proposta

`consult_proposal_status` devolve `statusName` + `situation` + `changesHistory[]`. Cada
transição tem `previousState`/`newState` com `{title, situation, systemicValue, sort}`.
Sequência observada (CPF de teste, fluxo completo):

```
dadosIniciais
  → consultaConsorcioBevicred  (sort 1)  "Espera Consulta Consórcio"
  → simulation                 (sort 5)  "Simulação Consórcio"        [após calculate_simulation]
  → documentoPessoal           (sort 6)  "Documento pessoal"
  → endereco                   (sort 8)  "Endereço"                   [após insert_additional_data]
  → (comprovanteDeEndereco / waitingForUniqueCode — finalização assíncrona; ver bevi-api-requests.md)
```

`situation`: `pending` durante o fluxo. `approvedAt`/`reprovedAt`/`integrationCode` ficam
`null` até a administradora processar (inserção assíncrona → gera nº de proposta). Para
acompanhar o desfecho, **fazer polling** de `consult_proposal_status` (não há webhook
documentado).

---

## 10. Catálogo de erros (todos no envelope padrão)

| HTTP | `status` | Quando | `data` relevante |
|---|---|---|---|
| 400 | BAD_REQUEST | Campo obrigatório faltando | `errors:[{field:"CPF",message:"CPF é obrigatório."}]` |
| 400 | BAD_REQUEST | Valor < mínimo | `message:"Simulação inválida."`, `errors:[{field:"valor",message:"Valor abaixo do mínimo permitido (R$ 15.000,00)."}]`, `offers:[]` |
| 404 | NOT_FOUND | `proposalId` inexistente | `errors:[{field:"proposalId",message:"Proposta não encontrada."}]` |
| 404 | NOT_FOUND | Simulação transitória | **transitório** — retry resolve (§4.3) |
| 409 | CONFLICT | CPF já tem proposta ativa | `ongoingProposalIds:["...","..."]` |
| 403 | FORBIDDEN | Token não liberado / inexistente | `message:"…não foi encontrado usuário para esta token."` |
| 403 | FORBIDDEN | Sem header Authorization | `message:"…não foi enviada uma autorização."` |

O client deve mapear: **409 → fluxo de "retomar ou iniciar nova"** (usar `ongoingProposalIds`);
**400 valor → "aumente o valor (mín. R$ 15.000)"**; **404 simulação → retry**; **403 →
erro de config/credencial (não mostrar ao usuário, alertar ops)**.

---

## 11. Gap analysis — domínio (`QuotaSimulation`) ↔ oferta de parceiro

`beviOfferToQuotaSimulation()` precisa produzir um `QuotaSimulation` (ver `types.ts`). Eis a
origem de cada campo a partir da oferta REAL de 8 campos:

| Campo do domínio | Origem na API de parceiro | Ação |
|---|---|---|
| `groupId` | `offer.quotaId` | ✅ direto |
| `category` | `segmento` da request → `beviSegmentToCategory()` | ✅ (segmento vem do input, não da oferta — passar adiante) |
| `creditValue` | `offer.valorCarta` | ✅ direto |
| `monthlyPayment` | `offer.parcela` (arredondar 2 casas) | ✅ direto |
| `termMonths` | ❌ **não existe na oferta** | ⚠️ **GAP** — derivar (`valorCarta/parcela` ≈ prazo? impreciso) ou buscar outra fonte ou confirmar c/ AGX |
| `adminFee` (R$) | ❌ não existe | ⚠️ **GAP** — indisponível neste trilho |
| `reserveFund` (R$) | ❌ não existe | ⚠️ **GAP** |
| `insurance` (R$) | ❌ não existe | ⚠️ **GAP** |
| `totalCost` | ❌ não existe | ⚠️ **GAP** — `parcela × termMonths` SE tivermos prazo |
| `effectiveRate` | ❌ não existe | ⚠️ **GAP** |
| `lanceScenario.lancePercent` | input `lanceEmbutido`/`valorDoLance` | ⚠️ derivar do input |
| `lanceScenario.expectedTermMonths` | ❌ não existe (`taxaContemplacao`?) | ⚠️ estimar; rotular "estimativa, não garantia" (CDC art. 30/37) |
| `embeddedBid.*` | input `lanceEmbutido` + diferença de 2 simulações | ⚠️ derivar (comparar simulação com/sem lance) |
| `expectedAdjustment.index/annualPercent` | ❌ não existe | ⚠️ **GAP** — premissa por categoria (INCC imóvel / IPCA demais), rotulada estimativa |
| `taxaContemplacao` (novo) | `offer.taxaContemplacao` | ❓ confirmar semântica antes de usar |

**Conclusão:** o trilho de parceiro, sozinho, **não alimenta um `QuotaSimulation` completo**.
Faltam prazo, taxas, correção e custo total — exatamente o que os cards do Aja exibem. Isso
força a decisão de §12.

---

## 12. Decisão arquitetural (LER ANTES DE CODAR)

A interface `AdministradoraAdapter` é **stateless e grupo-cêntrica**
(`searchGroups`/`simulateQuota`/`getRates`/`getGroupDetails`). A API de parceiro é
**stateful e proposta-cêntrica** e **não tem descoberta anônima** nem dados ricos de oferta.
Não dá pra "encaixar" os 7 endpoints nos 4 métodos atuais. Duas estratégias:

### Opção A — **Split Discovery / Fulfillment** (recomendada)

- **Discovery** (buscar/simular/comparar, anônimo, cards ricos): continua via **mock** OU via
  **self-contract (Trilho B)**, que devolve ofertas de 68 campos (prazo, taxas, correção,
  lance embutido, próxima assembleia) **sem token**. Mantém a UX rica do Aja.
- **Fulfillment** (criar proposta real → escolher → docs → status): **API de parceiro**
  (este doc). É o canal oficial de fechamento com a administradora.
- **Implementação:** manter `AdministradoraAdapter` para Discovery; criar uma **interface nova**
  (ex. `ProposalGateway`) para o fechamento, com métodos que espelham os 7 endpoints
  (`createProposal`, `listSegments`, `simulate`, `chooseOffer`, `getDocumentLinks`,
  `insertAdditionalData`, `getStatus`). `BeviApiAdapter` implementa `ProposalGateway`.
- **Trade-off:** dois trilhos pra manter; precisa casar a oferta escolhida na descoberta com
  a simulação de parceiro no fechamento (re-simular pra obter `ofertaId` válido).

### Opção B — **Full-parceiro**

- Usar só a API de parceiro pra tudo (descoberta inclusa, exigindo CPF logo no início).
- **Trade-off:** mata a exploração anônima (pede CPF antes de mostrar qualquer coisa — atrito
  alto, contra o core value do Aja) e os cards ficam pobres (sem prazo/taxas/correção, §11).
- **Não recomendado** salvo exigência de negócio.

> **Recomendação:** Opção A. É o que o comentário do `bevi-api-adapter.ts` já antecipava
> ("split Discovery/Fulfillment, aderência §7.1"). **Esta decisão precisa de OK do Kairo antes
> de implementar** — muda a interface pública dos adapters.

---

## 13. Plano de implementação (passo a passo)

Assumindo **Opção A** aprovada:

1. **HTTP client da API de parceiro** (`bevi-api-adapter.ts`):
   - `fetch` nativo (sem axios — ver CLAUDE.md). 1 função `callService(serviceId, method, body?, qs?)`
     que injeta `Authorization`, `service_id`, `Content-Type`, parseia o **envelope** (§1) e
     lança erro tipado com `code`/`message`/`errors` em `success:false`.
   - Retry **só para 404 em `calculate_simulation`** (3–4×, ~500ms). Nada de retry cego em POST
     que cria/muta estado.
   - Timeout sensato (a API responde < 1s; usar ~15s).
2. **Tipos da API de parceiro** (novo arquivo, ex. `bevi-api-types.ts`): request/response de cada
   service_id + o `BeviPartnerOffer` (8 campos) — **separado** do `BeviOffer` (68 campos) atual.
3. **Reescrever `offer-mapper.ts`** (ou criar `partner-offer-mapper.ts`):
   - `BeviPartnerOffer → GroupSummary` e `→ QuotaSimulation`, tratando os GAPs de §11
     explicitamente (campos indisponíveis: `undefined`/estimativa rotulada, **nunca chutar
     número como se fosse real**). Decidir com o Kairo se o domínio aceita campos opcionais ou
     se Discovery (self-contract) preenche o que falta.
   - Manter o `BeviOffer`/mapper de 68 campos **se** o Trilho B (self-contract) for usado no
     Discovery — não apagar antes da decisão.
4. **`ProposalGateway`** (nova interface) + implementação no `BeviApiAdapter`: os 7 métodos.
   Mapear erros (§10) para erros de domínio (ex. `OngoingProposalError(ids)` pro 409).
5. **Factory** (`index.ts`): expor o gateway de fechamento além do adapter de descoberta.
6. **Env/secrets**: `BEVI_API_TOKEN` no secrets manager (prod), nunca no repo.

### Regras de ouro
- **Nunca** criar proposta com CPF que não seja real do usuário em prod (LGPD). Em teste, usar
  a loja-piloto + CPF de teste.
- **Idempotência**: `insert_proposal` **não** é idempotente (cada chamada cria; 409 protege por
  CPF). Não reenviar cegamente.
- `ofertaId` **expira em 30 min** (`expiresAt`). Se o usuário demorar, re-simular antes de
  `choose_offer`.

---

## 14. Estratégia de testes (3 camadas — CLAUDE.md)

- **Camada 1 (structural, todo PR):** asserts no client/mapper — envelope parseado certo,
  service_id correto por método, UPPERCASE no insert_proposal, mapper preenche
  `QuotaSimulation` e marca GAPs. `*.test.ts` ao lado do código.
- **Camada 2 (trajectory/contract):** testar o client contra **fixtures de resposta reais**
  (as capturas do Apêndice A) com `fetch` mockado — garante que mudança no parser/mapper
  quebra o teste. NÃO bater na API real no PR.
- **Integration real (opcional, fora do PR):** um teste manual/nightly que roda o fluxo na
  loja-piloto (CPF de teste) — gated por env, **nunca** no CI público (cria dado real).
- **Nunca** modificar teste pra passar; teste falha antes do fix (TDD).

---

## 15. Riscos e cuidados

- **LGPD / dado real:** `insert_proposal` cria proposta real na administradora. Em prod, só com
  consentimento (TERMO_LGPD/CONSULTA_DE_DADOS) e CPF do próprio usuário. Logs **sem** CPF.
- **1 proposta ativa por CPF (409):** o produto precisa de UX de "retomar vs nova" usando
  `ongoingProposalIds`. Não furar com `ignoreOngoingProposals:true` sem intenção.
- **TTL do ofertaId (30 min):** re-simular antes de escolher se expirou.
- **Crédito mínimo R$ 15.000:** validar no client antes de chamar (evita 400) e orientar o
  usuário.
- **Produção apenas:** a API é só prod (não há sandbox). A loja-piloto de teste é o ambiente
  de teste — não usar a loja-piloto em prod nem o token de prod em teste.
- **`taxaContemplacao` semântica indefinida:** confirmar com a AGX antes de exibir.

---

## Apêndice A — Capturas reais usadas como fixtures (2026-06-02)

Proposta de teste: `6a1f346110ffff8984ace724` (CPF teste `12345678909`, loja-piloto).
Respostas integrais reproduzíveis com o `curl` da §4 (token da loja-piloto). Salvar como
fixtures em `src/lib/adapters/bevi/__fixtures__/` ao implementar a Camada 2.

- `insert_proposal` → 201 (§4.1) · `list_segments` → 200 (§4.2)
- `calculate_simulation` AUTOS 50k → 200, 24 ofertas, shape de 8 campos (§4.3/§7)
- `choose_offer` → 200, `consortiumProposalLink` (§4.4)
- `get_document_upload_links` → 200, 2 links (§4.5)
- `insert_additional_data` → 200 (§4.6) · `consult_proposal_status` → 200 + changesHistory (§4.7/§9)
- Erros: 400 valor mín., 400 campo faltando, 409 proposta ativa, 404 proposta inexistente,
  403 token/sem-auth (§10)

## Apêndice B — Arquivos do código tocados por esta integração

| Arquivo | Papel | Ação |
|---|---|---|
| `src/lib/adapters/types.ts` | Domínio + `AdministradoraAdapter` | Adicionar `ProposalGateway` (Opção A) |
| `src/lib/adapters/bevi/bevi-api-adapter.ts` | Scaffold do adapter real | Implementar HTTP client + gateway |
| `src/lib/adapters/bevi/offer-mapper.ts` | Mapper (shape 68 campos) | Reescrever/duplicar p/ shape de 8 campos |
| `src/lib/adapters/index.ts` | Factory | Expor gateway de fechamento |
| `docs/integracoes/bevi-api-requests.md` | Trilho B (self-contract) | Referência p/ Discovery (Opção A) |
| `docs/integracoes/bevi-consorcio-aderencia.md` | Aderência §7.1 | Base da decisão de §12 |
