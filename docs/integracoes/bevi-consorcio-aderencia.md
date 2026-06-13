# Avaliação de Aderência — API Bevi Consórcio (AGX / CreditHub) × Aja Agora

> **Documento técnico-estratégico.** Avalia se a API do parceiro Bevi Consórcio
> (exposta pela plataforma AGX / CreditHub) atende ao modelo de negócio do Aja Agora,
> com foco em **maximizar automação e minimizar back office**.
>
> - **Data:** 2026-05-27
> - **Autor:** TwoBrains (engenharia Aja Agora)
> - **Fonte API:** `Bevi Consórcio — API de Parceiro.postman_collection.json`
> - **Base URL:** `https://api.uxvision.tech/api/v1/credithub/services`
> - **Contrato Aja avaliado:** `src/lib/adapters/types.ts` (`AdministradoraAdapter`)

> ⚠️ **Atualização 2026-05-27:** esta análise nasceu da collection (exemplo minimalista). A captura
> ao vivo do simulador ([api-discovery](./bevi-api-discovery.md) · [fluxo](./bevi-simulador-fluxo.md))
> **resolveu vários gaps** aqui listados: a oferta real **traz** taxa de adm, prazo, fundo, seguro,
> correção (INCC), assembleia, contemplação e comissão; retorna **múltiplas administradoras**
> (comparável); há **6 segmentos** (Imóvel e Moto incluídos); e o self-contract faz **KYC inline sem
> redirect**. Gaps que **permanecem**: ausência de simulação anônima e o redirect no `choose_offer`
> do trilho "API de Parceiro". Trate as seções §4–§5 abaixo à luz dessa atualização.

---

## 1. Sumário Executivo

A API do Bevi/AGX é um **motor de auto-contratação (AC) "proposta-first"**: o fluxo
começa identificando o cliente (CPF + aceites LGPD), simula, gera uma oferta e termina
**entregando o PDF da PROPOSTA de consórcio** (o `consortiumProposalLink` do `choose_offer`
faz `302` para um PDF no S3, `Content-Disposition: attachment`).

> ⚠️ **Correção (2026-06-04, verificado seguindo redirects reais):** versões anteriores
> deste doc afirmavam que o `consortiumProposalLink` redireciona para
> `edigital.beviconsorcio.com.br` para **assinatura**. **Isso está incorreto** — o link é
> o **PDF da proposta** (download), não um portal de assinatura. A
> assinatura/efetivação é **etapa posterior da mesa** (back office), fora do que a API de
> Parceiro automatiza hoje. Ver `docs/jornada/CONTEXT.md` → DES-1.

| Veredito por etapa do funil Aja | Aderência | Resumo |
|---|---|---|
| **Descoberta anônima** ("sem formulário") | 🔴 **Baixa** | Bevi exige CPF + LGPD **antes** de qualquer simulação. Não há busca por catálogo/faixa nem simulação anônima. |
| **Diferencial de produto** (lance embutido, investidor × sonhador) | 🟢 **Alta** | A API trata lance embutido e o eixo `investimento` × `contemplacao_rapida` **nativamente**. É o melhor encaixe. |
| **Riqueza de dados** (taxa adm, prazo, fundo, correção, contemplação) | 🟡 **Parcial / a confirmar** | A oferta de exemplo é enxuta (8 campos). Faltam dados que o Aja exige por **produto e por compliance (CDC)**. |
| **Fechamento / contratação** | 🟢 **Alta (com ressalva de redirect)** | Proposta, oferta, KYC textual e status são **automatizáveis via API**. Mas a assinatura final é **redirect** — colide com "sem redirect". |
| **Pós-venda** (assembleias, contemplação, monitoramento) | 🔴 **Sem suporte** | Nenhum endpoint para calendário de assembleias, histórico de contemplação ou alertas. |

**Conclusão acionável:** dá para integrar com **forte automação no fechamento** (proposta +
simulação + KYC textual + acompanhamento de status via API, eliminando boa parte do back
office manual de hoje). Porém:

1. A **fase de exploração anônima** — o coração do "sem formulário" — **não é servida** pela
   API atual e exige um motor de simulação indicativo (próprio ou um endpoint anônimo a
   negociar com o parceiro).
2. O **redirect de assinatura** e os **campos faltantes** (taxa adm, prazo, fundo, índice de
   correção) precisam ser resolvidos com o parceiro **antes** de prometer a jornada
   "do sonho à assinatura, sem redirect, sem back office" de ponta a ponta.

> **Frase para o cliente:** *"A API do Bevi resolve muito bem a metade de baixo do funil
> (fechar a venda com pouca burocracia manual). A metade de cima — a experiência mágica de
> explorar e simular sem pedir CPF — a gente precisa construir por cima, e há 12 perguntas
> objetivas a alinhar com o parceiro para fechar o desenho."*

---

## 2. As duas visões

### 2.1 O que o Aja Agora propõe

Fonte: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `src/lib/agent/system-prompt.ts`.

- **Core value:** *"O usuário diz o que quer ('comprar um carro em dois anos gastando R$ 800/mês')
  e recebe uma recomendação personalizada com botão para assinar — **sem formulário, sem
  corretor, sem redirect**."*
- **Funil "catálogo-first":** conversa anônima → busca de grupos → comparação → simulação →
  recomendação → **só então** coleta de dados (auth progressiva). O dado pessoal vem **no fim**.
- **Duas personas-alvo** (centrais para o brief de negócio):
  - **Investidor de consórcio** — foca rentabilidade, lance, contemplação como ativo financeiro.
  - **Sonhador do bem próprio** — foca no carro/casa/moto, na parcela que cabe e em "quando vou ter".
- **Modelo de receita:** comissão por venda (% da administradora por cota vendida via plataforma).
- **Posição do Bevi no negócio:** *"Parceira comercial — faz o meio de campo com administradoras."*
  Ou seja, o Aja **não** integra direto com BB/Itaú/Porto — integra com o **agregador Bevi/AGX**,
  que dá acesso às administradoras (no exemplo da API aparece **RODOBENS**).

### 2.2 O que a API Bevi / AGX oferece

- **Arquitetura:** gateway único `POST /api/v1/credithub/services`, com a operação escolhida
  pelo header **`service_id`** (estilo RPC sobre HTTP, não REST por recurso).
- **Autenticação:** `Authorization: Bearer {apiToken}` (token por loja parceira, liberado via
  painel `conexia.agxsoftware.com`).
- **Envelope padrão:** `{ status, code, success, message, data }`.
- **Modelo "proposta-first" e stateful:** uma `proposalId` carrega o estado; a `ofertaId`
  expira em **30 minutos**; a proposta tem uma máquina de passos (`currentStep`) do lado do Bevi.
- **Cadeia de valor:** `Aja Agora → API CreditHub (AGX) → Bevi → Administradoras (ex.: Rodobens)`.

---

## 3. Mapa do fluxo Bevi (7 operações)

Ordem recomendada pelo parceiro: **1 → 2 → 3 → 4 → 6** (5 e 7 opcionais).

| # | Operação (`service_id`) | Método | Entrada principal | Saída principal | Observações críticas |
|---|---|---|---|---|---|
| 1 | `insert_proposal_bevi_consorcio` | POST | `productId`, **`CPF`**, **`CELULAR`**, **`TERMO_LGPD`**, **`CONSULTA_DE_DADOS`**, `ignoreOngoingProposals` | `proposalId` | **PII + aceites já no passo 1.** 409 se CPF tem proposta em andamento (`ongoingProposalIds[]`). |
| 2 | `list_segments_bevi_consorcio` | GET | `proposalId` | `segmentos[] {segmento, segmentoLabel}` | **Atrelado à proposta** (precisa de CPF antes). Exemplo retorna só `AUTOS` e `SERVICOS`. |
| 3 | `calculate_simulation_bevi_consorcio` | POST | `propostaId`, `segmento`, `tipoSimulacao` (`valor_total`\|`valor_parcela`), `valor`, **`objetivo`** (`investimento`\|`contemplacao_rapida`), `lanceEmbutido`, `temLanceParaOfertar`, `valorDoLance` | `simulationSessionId`, `expiresAt` (TTL 30 min), `offers[]` | **Lance embutido e eixo de persona nativos.** Exemplo retorna **1 oferta**. |
| 4 | `choose_offer_bevi_consorcio` | POST | `propostaId`, `ofertaId` | `proposalId`, **`consortiumProposalLink`**, `cotaProposalId` | **`consortiumProposalLink` = redirect** para `edigital.beviconsorcio.com.br`. |
| 5 | `get_document_upload_links_bevi_consorcio` | POST | `propostaId` | `linkDocumentosPessoais`, `linkComprovanteEndereco` | **Documentado como 501 (não implementado).** Links externos (`indiky.link`). Disponível só após passo 4. |
| 6 | `insert_additional_data_bevi_consorcio` | POST | `propostaId`, `documentoIdentidade{...}`, `endereco{...}` | `proposalId` | **KYC textual via API** (RG/órgão emissor + CEP/endereço). Sem upload de imagem aqui. |
| 7 | `consult_proposal_status_bevi_consorcio` | POST | `propostaId` | `statusName`, `situation`, `approvedAt`, `reprovedAt`, `changesHistory[]` | **Polling** de status. Não há webhook documentado. |

### 3.1 Shape real da oferta (passo 3)

```json
{
  "ofertaId": "f47ac10b-...",
  "administradora": "RODOBENS",
  "tipoOferta": "FREE_BID",
  "grupo": "90120",
  "valorCarta": 50000,
  "parcela": 565.53,
  "taxaContemplacao": 0.4375,
  "quotaId": "674c1d2e..."
}
```

> **8 campos.** Note o que **não** vem: prazo (nº de parcelas), taxa de administração, fundo de
> reserva, seguro, custo total, índice de correção (INCC/IPCA). E `taxaContemplacao: 0.4375` tem
> **unidade ambígua** (43,75%? 0,4375%/mês? probabilidade acumulada?) — precisa ser esclarecido.

---

## 4. Contrato esperado pelo Aja × o que o Bevi entrega

O Aja espera que **qualquer administradora** implemente 4 métodos (`AdministradoraAdapter`,
`src/lib/adapters/types.ts:101-106`). Cruzamento campo a campo:

### 4.1 `searchGroups(category, creditMin?, creditMax?) → GroupSummary[]`

| Campo esperado (Aja) | Bevi entrega? | Nota |
|---|---|---|
| filtro por `category` (imovel/auto/moto/servicos) | 🟡 via `segmento` | Exemplo só lista `AUTOS`/`SERVICOS`. **Imóvel e moto a confirmar.** |
| filtro por **faixa** `creditMin–creditMax` | 🔴 Não | Bevi quer **valor pontual** (`valor`), não faixa. |
| retorno **multi-grupo / multi-administradora** | ❓ A confirmar | Exemplo retorna **1 oferta**. Comparação lado a lado depende disso. |
| `administradora`, `creditValue`(=`valorCarta`), `monthlyPayment`(=`parcela`) | 🟢 Sim | Mapeiam direto. |
| `adminFeePercent`, `termMonths`, `totalParticipants`, `availableSlots` | 🔴 Não (no exemplo) | Ausentes na oferta. **`termMonths` é básico de consórcio.** |
| `contemplationRate` | 🟡 `taxaContemplacao` | **Unidade a confirmar.** |

> **Conclusão:** a operação Bevi mais próxima de `searchGroups` é a **`simulate`** (passo 3), mas
> ela (a) exige CPF antes, (b) recebe valor pontual e não faixa, e (c) parece devolver poucas
> ofertas. O modelo "busca anônima por catálogo" **não tem equivalente direto**.

### 4.2 `simulateQuota(groupId, creditValue) → QuotaSimulation`

| Campo esperado (Aja) | Bevi entrega? | Nota |
|---|---|---|
| `monthlyPayment` | 🟢 `parcela` | OK |
| `creditValue` | 🟢 `valorCarta` | OK |
| **`adminFee`** (R$) | 🔴 Não | **Exigido por CDC art. 37** (ver §5.4). |
| **`reserveFund`** (R$) | 🔴 Não | — |
| `insurance` (R$) | 🔴 Não | — |
| **`totalCost`** / `effectiveRate` | 🔴 Não | Sem breakdown não há custo efetivo total. |
| **`termMonths`** | 🔴 Não (no exemplo) | Sem prazo não dá para montar o card de simulação. |
| `lanceScenario {lancePercent, expectedTermMonths}` | 🟡 Parcial | Input de lance existe; o **prazo esperado com lance** não vem explícito. |
| `expectedAdjustment {INCC\|IPCA, annualPercent}` | 🔴 Não | Aja modela correção da carta; Bevi não retorna. |

### 4.3 `getRates(administradora?, category?) → RateInfo[]`

🔴 **Sem equivalente.** Não há endpoint de tabela de taxas vigentes (adm%, fundo%, seguro%).
O agente usa isso para falar de custo com número comparativo (compliance).

### 4.4 `getGroupDetails(groupId) → GroupDetails`

🔴 **Sem equivalente.** Não há histórico de contemplação (`contemplationHistory[]`), próxima
assembleia (`nextAssembly`) nem status do grupo. **Isso quebra o scoring de recomendação** do
Aja (que pesa contemplação 25% e prazo 15%) e inviabiliza o monitoramento de assembleias (INTG-03).

---

## 5. Análise de aderência

### 5.1 Aderências fortes (o que casa — e bem)

1. **🟢 Lance embutido é cidadão de primeira classe.** `lanceEmbutido` (% ou `nenhum`),
   `temLanceParaOfertar`, `valorDoLance` estão no corpo da simulação. O diferencial mais
   vendido do Aja já existe na API.
2. **🟢 As duas personas têm um switch nativo: `objetivo`.**
   - `investimento` → **o investidor** do ramo de consórcio.
   - `contemplacao_rapida` → **o sonhador** que quer o bem logo.
   Isso é um encaixe quase perfeito com o brief de negócio.
3. **🟢 Simulação por parcela-alvo (`tipoSimulacao: valor_parcela`)** — atende literalmente o
   exemplo do core value *"gastando R$ 800/mês"*. **O Aja hoje só simula por valor de crédito;
   a API do Bevi é mais rica nesse ponto.**
4. **🟢 KYC textual via API** (`insert_additional_data`): RG + endereço entram pelo chat, sem
   formulário externo. Reduz back office.
5. **🟢 Acompanhamento de status via API** (`consult_proposal_status`): dá para mostrar
   "em análise / aprovada / reprovada" dentro do produto.
6. **🟢 Stateful combina com o Aja**, que já é stateful (conversa + metadata). Basta persistir
   os IDs do Bevi.

### 5.2 Divergências estruturais (o que não casa)

1. **🔴 Funil invertido — proposta-first × catálogo-first.** O Aja captura PII **no fim**; o Bevi
   exige CPF + LGPD **no início**. Sem resolver isso, o "sem formulário" morre: o usuário teria
   que dar CPF antes de ver qualquer simulação.
2. **🔴 Redirect no fechamento.** `choose_offer` devolve `consortiumProposalLink` para o portal
   `edigital.beviconsorcio.com.br`. O core value diz **"sem redirect"**. A assinatura final, hoje,
   acontece fora do Aja.
3. **🟡 Sem busca por faixa / catálogo.** O Aja explora faixas e compara grupos; o Bevi quer um
   valor pontual e (aparentemente) devolve poucas ofertas por chamada.
4. **🟡 Cobertura de segmentos incerta.** O exemplo só mostra `AUTOS`/`SERVICOS`. **Imóvel** é o
   ticket alto e a persona Helena — se não estiver no catálogo Bevi, metade do produto fica sem
   motor real.

### 5.3 Gaps de dados (campos que o Aja precisa e a oferta não traz)

`termMonths` (prazo) · `adminFeePercent`/`adminFee` (taxa de administração) ·
`reserveFund` (fundo de reserva) · `insurance` (seguro) · `totalCost`/`effectiveRate`
(custo efetivo total) · `expectedAdjustment` (INCC/IPCA) · `contemplationHistory`
(histórico de contemplação) · `nextAssembly` (calendário de assembleias) ·
unidade de `taxaContemplacao`.

> Sem esses campos, **não dá para renderizar** o `SimulationResult`, o `RecommendationCard`
> (scoring) nem os `Scenarios` do Aja com dados reais.

### 5.4 Gaps de compliance (CDC) — risco, não só feature

O system prompt do Aja embute regras de compliance que **dependem desses dados**:

- **CDC art. 37 (publicidade enganosa por omissão)** — `system-prompt.ts:433-441`: é **proibido**
  dizer "taxa competitiva" sem número. O agente **tem que** dizer "taxa de 16% — abaixo da média
  de 18% do mercado". **Se a API não devolve a taxa de administração, o agente não pode cumprir a
  própria regra** sem inventar número (alucinação proibida).
- **CDC art. 37 (valores literais)** — `system-prompt.ts:443-454`: nunca arredondar valores
  monetários. Exige `adminFee`, `reserveFund`, `insurance`, `totalCost` exatos.
- **CDC art. 30/37 (cenários sem garantia)** — `scenarios.ts`: projeções de contemplação por lance
  precisam de base. Sem histórico/calendário de assembleia, a projeção fica sem lastro.

> **Este é o ponto mais sensível:** trata-se de **risco regulatório**, não preferência de UX.
> Mostrar simulação sem breakdown de custos a um consumidor pode configurar publicidade enganosa.

---

## 6. Impacto na automação / back office

A pergunta-guia: *quanto mais automação, menos back office, melhor.*

### ✅ Automatizável 100% via API (sem back office)

- Criação de proposta (CPF, celular, aceites LGPD/consulta).
- Simulação com lance e por objetivo (investimento/contemplação rápida).
- Escolha de oferta (geração do contrato/link).
- KYC textual (documento de identidade + endereço).
- Acompanhamento de status (polling).

### 🟡 Parcial / depende do parceiro

- **Upload de documentos** (`get_document_upload_links`): documentado como **501 (não implementado)**;
  quando sair, são **links externos** (`indiky.link`), provavelmente fora do chat.
- **Comparação multi-oferta**: depende de a `simulate` devolver várias ofertas.

### 🔴 Permanece manual / fora do Aja hoje

- **Assinatura do contrato** (redirect `edigital`).
- **Análise/aprovação da proposta** (há `statusName: "Em análise"`, `approvedAt`/`reprovedAt` —
  existe um processo do lado da administradora; assíncrono).
- **Tratamento de reprovação / pendência documental** (acompanhamento humano).
- **Monitoramento de assembleias e contemplação** (sem endpoint).

> **Saldo:** mesmo com as ressalvas, integrar o Bevi **reduz drasticamente** o back office de
> fechamento vs. o estado atual (hoje o MVP para na recomendação e o fechamento é 100% manual).
> O back office remanescente concentra-se em **acompanhar análise/reprovação** e na **costura do
> redirect de assinatura**.

---

## 7. Arquitetura de integração recomendada

### 7.1 Separar o adapter em dois papéis

O `AdministradoraAdapter` atual mistura **descoberta** e **fechamento**. O Bevi cobre bem o
segundo, mal o primeiro. Recomenda-se evoluir para dois contratos:

```
┌─────────────────────── Aja Agora (agente + UI) ──────────────────────┐
│                                                                       │
│   FASE 1 — DESCOBERTA (anônima, "sem formulário")                     │
│   DiscoveryAdapter: searchGroups · simulateQuota (indicativa) ·       │
│                     getRates · getGroupDetails                        │
│        └── fonte: motor próprio / tabela / endpoint anônimo Bevi      │
│            (A NEGOCIAR — ver §8 Q1)                                    │
│                                                                       │
│   ── ponto de costura: usuário decide avançar → pede CPF/celular ──   │
│                                                                       │
│   FASE 2 — FECHAMENTO (identificada)                                  │
│   FulfillmentAdapter (BeviApiAdapter):                                │
│     insertProposal → listSegments → simulate → chooseOffer →          │
│     insertAdditionalData → consultStatus                             │
│        └── fonte: API Bevi / AGX CreditHub (real)                     │
└───────────────────────────────────────────────────────────────────────┘
```

- **`BeviApiAdapter`** implementa o `FulfillmentAdapter` e mora no factory já preparado
  (`src/lib/adapters/index.ts:12` → `// TODO: case 'bevi'`), acionado por `ADMINISTRADORA_ADAPTER=bevi`.
- A **fase de descoberta** continua com dados indicativos (mock realista ou tabela própria) **até**
  o parceiro fornecer um endpoint anônimo — ou negociamos coletar CPF mais cedo (trade-off de UX).

### 7.2 Risco de divergência simulação indicativa × oferta real

Se a fase de descoberta usa um motor próprio e o fechamento usa o Bevi, **os números podem
divergir**. Decisão de produto necessária (ver §8 Q2): a simulação anônima é **vinculante** (tem
que bater com a oferta) ou **indicativa** ("sujeita a confirmação")? A segunda dá folga, mas
exige cuidado redobrado com CDC art. 37 (não enganar) — a divergência precisa ser pequena e
comunicada.

### 7.3 Persistência (migração de schema)

O schema atual (`leads`, `conversations`) **não guarda** os identificadores do Bevi. Adicionar:

- `proposalId`, `cotaProposalId`, `simulationSessionId`, `ofertaId`, `offerExpiresAt`,
  `consortiumProposalLink`, `proposalStatus`.
- Vincular à `conversation`/`lead` para o agente retomar (TTL de 30 min na oferta).

### 7.4 Tratamento de estados de borda

- **TTL 30 min da oferta:** conversa de chat pode demorar. Re-simular transparentemente ao expirar.
- **409 (proposta em andamento):** política de retomar vs. criar nova (`ignoreOngoingProposals`).
- **501 (upload de docs):** feature-flag; só habilitar quando o parceiro implementar.
- **Circuit breaker / timeout:** o Aja exige resposta < 3 s; o Bevi adiciona latência de rede —
  prever cache (INTG-02) e degradação graciosa.

---

## 8. Perguntas críticas para o parceiro (AGX / Bevi)

Bloqueiam o desenho final. Agrupadas por tema.

**Descoberta & simulação**
1. Existe **simulação sem CPF** (anônima/indicativa) para a fase de exploração? Ou CPF é sempre
   obrigatório no passo 1?
2. A simulação anônima precisaria ser **vinculante** ou pode ser **indicativa** ("sujeita a
   confirmação na contratação")?
3. A `calculate_simulation` retorna **múltiplas ofertas** (várias administradoras/grupos) ou só a
   "melhor"? Dá para comparar lado a lado?

**Cobertura & dados**
4. Quais **segmentos** o nosso `productId` habilita? **Imóvel** está disponível? E **moto**?
5. Quais **administradoras** estão no catálogo (BB, Itaú, Porto, Rodobens, …)?
6. A oferta pode retornar **prazo (nº de parcelas), taxa de administração, fundo de reserva,
   seguro e índice de correção (INCC/IPCA)**? *(necessário por compliance CDC — ver §5.4)*
7. Qual a **unidade/semântica** de `taxaContemplacao: 0.4375`?
8. Há acesso a **histórico de contemplação** e **calendário de assembleias** por grupo?

**Fechamento & operação**
9. `get_document_upload_links` está **501** — quando estará disponível? Dá para **embutir** o
   upload no nosso fluxo (sem redirect)?
10. A **assinatura final** é sempre redirect para o `edigital`, ou há fluxo **via API / embedded /
    white-label**? Há **webhook** de conclusão/assinatura?
11. Mudanças de status (aprovado/reprovado/contemplado) têm **webhook** ou só **polling**?

**Negócio & ambiente**
12. **Comissionamento:** como o parceiro remunera a venda originada pelo Aja? Há `partnerId`/
    rastreio de origem na proposta?
13. Há **sandbox/homologação** com dados de teste? (`api.uxvision.tech` é produção ou homolog?)
14. **SLA / rate limits / latência** esperada por operação?

---

## 9. Roadmap de integração sugerido

| Fase | Escopo | Pré-requisito |
|---|---|---|
| **0 — Alinhamento** | Responder §8 (esp. Q1, Q4, Q6, Q10). Acesso a sandbox + token. | Reunião com AGX/Bevi |
| **1 — Fulfillment real** | `BeviApiAdapter`: insertProposal → simulate → chooseOffer → status. Persistir IDs. Feature-flag `ADMINISTRADORA_ADAPTER=bevi`. | Q1, Q13 |
| **2 — KYC no chat** | `insert_additional_data` via artifacts (RG + endereço). Upload de docs quando sair do 501. | Q9 |
| **3 — Descoberta** | Decidir motor da simulação anônima (próprio vs. endpoint Bevi). Garantir paridade/aviso de indicativo. | Q1, Q2, Q6 |
| **4 — Pós-venda** | Status no produto + (se houver webhook) notificações. Monitoramento de assembleia se o parceiro expuser. | Q8, Q11 |

---

## 10. Riscos & mitigação

| Risco | Severidade | Mitigação |
|---|---|---|
| API não cobre **descoberta anônima** → mata o "sem formulário" | 🔴 Alta | Motor indicativo próprio na fase 1; negociar endpoint anônimo (Q1). |
| Oferta **sem taxa adm/prazo** → viola CDC art. 37 | 🔴 Alta | Não exibir simulação a consumidor sem breakdown; obter campos (Q6) ou rotular claramente como estimativa. |
| **Imóvel** indisponível no catálogo | 🟠 Média-alta | Confirmar Q4 cedo; replanejar personas se faltar. |
| **Redirect** de assinatura quebra "sem redirect" | 🟠 Média | Negociar fluxo embedded/white-label (Q10); ou reposicionar a promessa ("assinatura segura em 1 toque"). |
| **TTL 30 min** expira durante a conversa | 🟡 Baixa-média | Re-simular transparente; avisar o usuário de forma natural. |
| Divergência simulação indicativa × oferta real | 🟠 Média | Política de indicativo + tolerância pequena + comunicação (Q2). |
| Upload de docs **501** sem previsão | 🟡 Média | Feature-flag; manter etapa documental fora do happy-path inicial. |
| Sem **webhook** → só polling de status | 🟡 Baixa | Polling com backoff; cache; revisitar se o volume crescer. |

---

## Anexo A — Glossário de mapeamento (Aja ↔ Bevi)

| Conceito Aja | Equivalente Bevi | Status |
|---|---|---|
| `category` | `segmento` / `segmentoLabel` | 🟡 cobertura a confirmar |
| `creditValue` | `valorCarta` / `valor` (`tipoSimulacao=valor_total`) | 🟢 |
| parcela-alvo | `valor` (`tipoSimulacao=valor_parcela`) | 🟢 (Aja ainda não usa) |
| `monthlyPayment` | `parcela` | 🟢 |
| lance | `lanceEmbutido`, `valorDoLance`, `temLanceParaOfertar` | 🟢 |
| investidor × sonhador | `objetivo` (`investimento` × `contemplacao_rapida`) | 🟢 |
| `contemplationRate` | `taxaContemplacao` | 🟡 unidade a confirmar |
| `adminFeePercent`, `termMonths`, fundo, seguro, INCC/IPCA | — | 🔴 ausentes |
| `recommend_groups` (scoring) | — (faltam inputs) | 🔴 |
| `capture_lead` | `insert_proposal` (CPF/celular) + `insert_additional_data` | 🟡 modelo diferente (CPF cedo, sem email no passo 1) |
| assinatura | `choose_offer` → `consortiumProposalLink` (redirect) | 🟡 redirect |
| status do lead | `consult_proposal_status` | 🟢 |

---

*Gerado a partir da collection do parceiro e da análise do código-fonte do Aja Agora
(`src/lib/adapters`, `src/lib/agent`, `.planning`). Próximo passo: reunião de alinhamento (§8).*
