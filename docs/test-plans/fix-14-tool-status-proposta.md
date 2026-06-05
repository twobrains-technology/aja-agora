---
feature: FIX-14
slug: fix-14-tool-status-proposta
titulo: "Tool check_proposal_status — status REAL da proposta no chat"
bloco: bloco-b-status-tool
autor: PO Lead (skill QA sênior)
data: 2026-06-05
status: plano-aprovado-para-implementacao
fonte_de_verdade: "Este documento define o que 'feito' significa. Critério não escrito = critério não validado."
refs:
  - docs/correcoes/todo/bloco-b-status-tool/fix-14-tool-status-proposta.md
  - docs/correcoes/todo/bloco-b-status-tool/_bloco.md
  - docs/jornada/jornada-ate-boleto.md (§4 POC real)
  - docs/integracoes/bevi-api-parceiro-spec.md (§9 máquina de estados, §10 erros)
  - CLAUDE.md (jornada canônica, mock-runtime-morto, regressão 3 camadas)
---

# Plano de teste — FIX-14: tool `check_proposal_status`

## 0. Resumo da feature (o que validamos)

Quando o usuário pergunta no chat "qual o status da minha proposta?" / "como tá meu
consórcio?", o agent chama a tool `check_proposal_status` — que consulta a Bevi **AO VIVO**
(`gateway.getStatus`) usando o `proposalId` da **conversa** (resolvido via
`getLatestBeviProposal(conversationId)`), traduz o estado técnico para uma mensagem leiga
em PT-BR e devolve uma `userMessage` pronta. O agent narra essa mensagem — **nunca**
responde status de memória, **nunca** re-busca grupos, **nunca** inventa estado.

Princípio arquitetural sob teste (regra D11 — **servidor decide, modelo narra**): a
verdade e a tradução vivem em `src/lib/bevi/proposal-status.ts`; o modelo só repassa.

---

## 1. Escopo

### 1.1 DENTRO do escopo (validado por este plano)

| # | Item |
|---|---|
| E1 | Função pura `translateProposalStatus(status)` — mapa `systemicValue → mensagem leiga` + cadeia de overrides (reprovedAt > approvedAt > integrationCode > mapa > fallback honesto). |
| E2 | `checkProposalStatus(conversationId, deps?)` — orquestra `getLatestBeviProposal` → `gateway.getStatus` → tradução. Retorno estruturado `{ ok, hasProposal, userMessage, lastTransition?, raw? }`. |
| E3 | Extração de `lastTransition` do `changesHistory` (último item com `newState.changeDate` mais recente; resiliente a shape vazio/inesperado). |
| E4 | Sem proposta na conversa → `{ ok:true, hasProposal:false, userMessage:"nenhuma proposta criada ainda…" }`. |
| E5 | Erro do gateway (404/403/timeout/qualquer throw) → `{ ok:false, hasProposal:?, userMessage:"não consegui consultar agora…" }` + log estruturado server-side. NUNCA estado inventado. |
| E6 | Tool `check_proposal_status` no registry: entry estática em `consorcioTools` (resposta "sem contexto") + override na factory `buildConsorcioTools` com `conversationId` via closure. `inputSchema: z.object({})` — **zero campos**. |
| E7 | Tool sempre-exposta aos specialists pelo `builder.ts` (primitivo do sistema, como `present_contract_form`). |
| E8 | Regra no `SPECIALIST_BASE_PROMPT`: pergunta de status → SEMPRE `check_proposal_status`; PROIBIDO responder de memória ou re-buscar grupos. |
| E9 | Tradução leiga em PT-BR — sem jargão técnico (`systemicValue`, `waitingForUniqueCode`, `pending`) vazado pro usuário. |
| E10 | Multi-canal: a mesma tool/builder serve web e WhatsApp (ambos passam pelo mesmo `buildConsorcioTools`/`buildAgent`). |

### 1.2 FORA do escopo (NÃO validar aqui — evitar gold-plating)

| # | Item | Onde vive |
|---|---|---|
| F1 | **Polling proativo / acompanhamento ativo** (mensagem proativa a cada transição). | feature futura `jornada-ate-boleto` §5.3 — explicitamente FORA. |
| F2 | **Bypass / automação das telas CONEXIA** (`insert_additional_data`, finalização `waitingForUniqueCode`). | feature futura. |
| F3 | **Emissão/exibição de boleto e detecção de pagamento.** Nenhum estado conhecido menciona boleto (POC §3.2). | gaps G1/G2, aguardando Bevi. |
| F4 | Criação de proposta, simulação, choose_offer, upload de documento. | FIX da Onda já coberta (fulfillment). |
| F5 | Persistência de histórico de mensagens / estado terminal no prompt (amnésia pós-fechamento). | **FIX-11 / bloco A** — dependência de produto, não desta tool. A tool funciona sozinha. |
| F6 | UI/artifact visual de status (card). FIX-14 entrega **texto** (`userMessage`), não card. | — |
| F7 | Confirmar semântica de `taxaContemplacao`, regra de comissão (G3). | aguardando Bevi. |

> **Nota de fronteira:** o cenário completo do usuário ("perguntei o status e o resto do
> turno o agent lembra de tudo") só fica 100% com FIX-11 + FIX-14 mergeados. Este plano
> valida **a tool**, não a amnésia geral. Um cenário de regressão (CN-15) checa que a tool
> NÃO depende do bloco A para responder corretamente.

---

## 2. Dados de teste (fixtures)

Todas as fixtures de `ProposalStatus` abaixo são **capturas REAIS** da POC de 2026-06-05
(jornada-ate-boleto §4) ou shapes documentados na spec §9/§10. Devem virar constantes nos
testes (Camadas 1/2) e no seed do eval (Camada 3). `changesHistory` segue o shape de
`ProposalStatusChange` (`{ title, situation, systemicValue, sort }` em `previousState`/`newState`).

### 2.1 Fixtures de `bevi_proposals` (linha de DB por conversa)

| ID fixture | conversationId | proposalId | Observação |
|---|---|---|---|
| `ROW-WITH-PROPOSAL` | UUID de conversa seedada | `6a230bb1…bd089b` | proposta CANOPUS 4400 R$46k da POC real |
| `ROW-NONE` | UUID de conversa seedada | — (sem linha em bevi_proposals) | conversa sem fechamento |

### 2.2 Fixtures de retorno de `gateway.getStatus` (capturas reais)

| ID fixture | statusName | situation | último systemicValue (changesHistory.newState) | integrationCode | approvedAt | reprovedAt | Origem |
|---|---|---|---|---|---|---|---|
| `ST-WAITING-UNIQUE-CODE` | "Aguardando inserção da proposta" | pending | `waitingForUniqueCode` (sort 10) | null | null | null | POC §4 (6a230bb1, sem transição há 4h+) |
| `ST-ENDERECO` | "Endereço" | pending | `endereco` (sort 8) | null | null | null | POC §4 (6a1f3461, abandonada 3 dias) |
| `ST-DOC-PESSOAL` | "Documento pessoal" | pending | `documentoPessoal` (sort 6) | null | null | null | POC §4 (6a1f7953) |
| `ST-COMPROVANTE` | "Comprovante de endereço" | pending | `comprovanteDeEndereco` (sort 9) | null | null | null | POC §4.achados (changesHistory 14:50) |
| `ST-DOC-IDENTIDADE` | "Dados do documento de identidade" | pending | `dadosDoDocumentoDeIdentidade` (sort 7) | null | null | null | POC §4.achados (estado novo, 14:49) |
| `ST-SIMULATION` | "Simulação Consórcio" | pending | `simulation` (sort 5) | null | null | null | spec §9 |
| `ST-CONSULTA` | "Espera Consulta Consórcio" | pending | `consultaConsorcioBevicred` (sort 1) | null | null | null | spec §9 |
| `ST-DADOS-INICIAIS` | "Dados iniciais" | pending | `dadosIniciais` | null | null | null | spec §9 (estado inicial) |
| `ST-INTEGRATED` | "Inserida na administradora" | pending | `waitingForUniqueCode` | `"PROP-123456"` | null | null | **PROJETADO** (nunca observado real — override por integrationCode) |
| `ST-APPROVED` | "Aprovada" | approved | (qualquer) | `"PROP-123456"` | `"2026-06-10T12:00:00Z"` | null | **PROJETADO** (override approvedAt) |
| `ST-REPROVED` | "Reprovada" | reproved | (qualquer) | null | null | `"2026-06-10T12:00:00Z"` | **PROJETADO** (override reprovedAt — prioridade máxima) |
| `ST-UNKNOWN` | "Análise de crédito especial" | pending | `creditAnalysisSpecial` (estado NÃO mapeado) | null | null | null | **SINTÉTICO** — estado novo da Bevi não previsto |
| `ST-EMPTY-HISTORY` | "Endereço" | pending | changesHistory = `[]` | null | null | null | edge: history vazio |
| `ST-MALFORMED-HISTORY` | "Endereço" | pending | changesHistory = `[{}, {newState:{}}]` | null | null | null | edge: shape inesperado (sem systemicValue/changeDate) |

### 2.3 Fixtures de ERRO do gateway (`getStatus` lança)

| ID fixture | Erro lançado | Origem |
|---|---|---|
| `ERR-404` | `BeviApiError(404, "Proposta não encontrada.", [{field:"propostaId",…}])` | POC §4 (id inexistente) + spec §10 |
| `ERR-403` | `BeviConfigError("…token…", 403)` | spec §10 (token não liberado) |
| `ERR-TIMEOUT` | `DOMException`/`AbortError` (AbortSignal.timeout 15s) | bevi-api-adapter TIMEOUT_MS |
| `ERR-GENERIC` | `BeviApiError(500, "Erro interno")` ou `Error` cru | resiliência |

### 2.4 Dado de teste para o cassette (Camada 2)

Stream determinístico: turn em que o usuário pergunta status e o modelo responde chamando
`check_proposal_status` (sem args) e narrando a `userMessage` traduzida.

---

## 3. Cenários

Convenção: **CN-x** = cenário. Cada cenário aponta para os CA que ele exercita.

### 3.1 Happy path

| CN | Cenário | Entrada | Resultado esperado |
|----|---------|---------|--------------------|
| CN-1 | Status no meio do funil (proposta existe, em `waitingForUniqueCode`) | `ROW-WITH-PROPOSAL` + `ST-WAITING-UNIQUE-CODE` | `{ ok:true, hasProposal:true, userMessage: fila da administradora… }`. Sem jargão. |
| CN-2 | Status em `documentoPessoal`/`endereco`/`comprovanteDeEndereco` | `ST-DOC-PESSOAL` / `ST-ENDERECO` / `ST-COMPROVANTE` | `userMessage` = "falta completar X" (oferece completar, ponte com jornada). hasProposal:true. |
| CN-3 | Status com `integrationCode` preenchido (projetado) | `ST-INTEGRATED` | `userMessage` repassa "entrou na administradora (nº PROP-123456)". Override integrationCode vence o mapa de estado. |
| CN-4 | Proposta aprovada (projetado) | `ST-APPROVED` | `userMessage` = aprovada. approvedAt vence integrationCode e mapa. |
| CN-5 | Proposta reprovada (projetado) | `ST-REPROVED` | `userMessage` = reprovada/honesta. reprovedAt tem prioridade MÁXIMA (vence approvedAt se ambos setados). |
| CN-6 | `lastTransition` extraída do changesHistory | `ST-WAITING-UNIQUE-CODE` (history populado) | retorno inclui `lastTransition` (estado + data do último item) → permite "desde X está em Y". |

### 3.2 Edge cases

| CN | Cenário | Entrada | Resultado esperado |
|----|---------|---------|--------------------|
| CN-7 | Sem proposta na conversa | `ROW-NONE` | `{ ok:true, hasProposal:false, userMessage:"nenhuma proposta criada ainda…" }`. Gateway **NÃO** é chamado. |
| CN-8 | Proposta abandonada (pending eterno) | `ST-ENDERECO` (idade 3 dias) | resposta normal do estado — **não** inventa "expirada" (a API não sinaliza abandono; POC §4). |
| CN-9 | Estado desconhecido novo da Bevi | `ST-UNKNOWN` | fallback honesto: repassa `statusName` ("Análise de crédito especial") SEM inventar significado nem vazar `systemicValue`. |
| CN-10 | changesHistory vazio | `ST-EMPTY-HISTORY` | `userMessage` correta pelo estado; `lastTransition` = `undefined`/ausente, sem crash. |
| CN-11 | changesHistory com shape inesperado | `ST-MALFORMED-HISTORY` | não lança; `lastTransition` tolerante a `{}`/`newState` sem campos. |
| CN-12 | `conversationId` ausente (admin/preview) | tool estática (sem closure) | retorna a resposta "sem contexto" (`DISCOVERY_NO_CONTEXT`-like) — não chama DB nem gateway. |

### 3.3 Erros do gateway (NUNCA estado inventado)

| CN | Cenário | Entrada | Resultado esperado |
|----|---------|---------|--------------------|
| CN-13a | 404 (proposta deletada/desconhecida na Bevi) | `ROW-WITH-PROPOSAL` + `ERR-404` | `{ ok:false, userMessage:"não consegui consultar agora…" }` + log estruturado server-side com `error_name`/`conversation_id`. |
| CN-13b | 403 (token) | `ERR-403` | idem `ok:false`; log marca config error; usuário recebe mensagem honesta genérica (não expõe token/credencial). |
| CN-13c | timeout | `ERR-TIMEOUT` | idem `ok:false`; nunca trava o turn além do timeout. |
| CN-13d | erro genérico/500 | `ERR-GENERIC` | idem `ok:false`; não vaza stack/mensagem técnica crua pro usuário. |

### 3.4 Regressões prováveis (o que o agent NÃO pode fazer)

| CN | Cenário | Resultado esperado |
|----|---------|--------------------|
| CN-14 | Pergunta de status com proposta ativa | modelo chama **`check_proposal_status`** e NÃO `search_groups`/`recommend_groups`/`simulate_quota`/`present_comparison_table`. (cassette) |
| CN-15 | Tool funciona sem o bloco A (FIX-11) | `checkProposalStatus` retorna estado correto mesmo sem persistência de histórico/estado terminal — não importa nada do bloco A. |
| CN-16 | Pergunta de status ANTES de qualquer fechamento | modelo idealmente NÃO chama a tool (sem proposta); se chamar, CN-7 garante resposta segura ("nenhuma proposta criada ainda"). Sem alucinação de status. |
| CN-17 | Não vaza jargão técnico | nenhuma `userMessage` contém `systemicValue`, `waitingForUniqueCode`, `pending`, `situation`, `integrationCode` como termo cru pro usuário. |
| CN-18 | proposalId nunca vem do modelo | a tool não tem campo de input; o `proposalId` vem SEMPRE de `getLatestBeviProposal(conversationId)` (closure). Zero chance de id alucinado. |
| CN-19 | Multi-canal idêntico | web e WhatsApp resolvem a mesma tool via `buildConsorcioTools` — sem divergência de comportamento. |

---

## 4. Critérios de aceite (binários, verificáveis)

> Cada CA é **passa/não passa**. "Deveria" não existe. Marcação por camada de regressão.

### 4.1 Função de tradução — `translateProposalStatus` (pura)

- **CA-1** — Para cada um dos 10 estados conhecidos (`dadosIniciais`, `consultaConsorcioBevicred`, `simulation`, `documentoPessoal`, `dadosDoDocumentoDeIdentidade`, `endereco`, `comprovanteDeEndereco`, `waitingForUniqueCode` + os de sort intermediário documentados), `translateProposalStatus` retorna uma `userMessage` NÃO vazia, em PT-BR, **sem** conter a string do `systemicValue`. ✅ se assert passa para todos; ❌ se qualquer um cai no fallback ou vaza o termo técnico.
- **CA-2** — Override `reprovedAt` (não-null) tem prioridade MÁXIMA: com `ST-REPROVED` (reprovedAt + approvedAt + integrationCode todos setados), a mensagem é de reprovação. ✅/❌.
- **CA-3** — Override `approvedAt` vence `integrationCode` e o mapa de estado: `ST-APPROVED` → mensagem de aprovação. ✅/❌.
- **CA-4** — Override `integrationCode` (preenchido, sem approved/reproved) vence o mapa: `ST-INTEGRATED` → mensagem "entrou na administradora" contendo o código. ✅/❌.
- **CA-5** — Estado NÃO mapeado (`ST-UNKNOWN`) → fallback honesto que repassa `statusName` literal e NÃO inventa significado nem vaza `systemicValue`. ✅/❌.
- **CA-6** — A ordem de precedência é exatamente `reprovedAt > approvedAt > integrationCode > mapa(systemicValue) > fallback(statusName)`. Teste paramétrico cobrindo combinações conflitantes. ✅/❌.

### 4.2 Orquestração — `checkProposalStatus(conversationId, deps?)`

- **CA-7** — Com `ROW-WITH-PROPOSAL` + `ST-WAITING-UNIQUE-CODE` (gateway dublê): retorna `{ ok:true, hasProposal:true, userMessage:<traduzida> }` e chamou `gateway.getStatus` **exatamente uma vez** com o `proposalId` da linha (`6a230bb1…`). ✅/❌.
- **CA-8** — Sem linha (`ROW-NONE`): retorna `{ ok:true, hasProposal:false, userMessage:<"nenhuma proposta criada ainda…"> }` e **NÃO** chama `gateway.getStatus` (spy: 0 calls). ✅/❌.
- **CA-9** — `getStatus` lança `ERR-404`: retorna `{ ok:false, userMessage:<"não consegui consultar agora…"> }`. Não relança; não retorna estado. ✅/❌.
- **CA-10** — `getStatus` lança `ERR-403`/`ERR-TIMEOUT`/`ERR-GENERIC`: cada um → `{ ok:false, userMessage:<honesta genérica> }`. Mensagem ao usuário idêntica/segura nos 3 (não diferencia credencial vs rede pro usuário). ✅/❌.
- **CA-11** — Em qualquer caminho `ok:false`, há **log estruturado server-side** (JSON com `level:"error"`, `source` identificável, `conversation_id`, `error_name`) emitido ANTES do retorno. Verificável por spy em `console.error`. ✅/❌.
- **CA-12** — `lastTransition` é extraída quando `changesHistory` tem item válido (`ST-WAITING-UNIQUE-CODE`): retorno inclui `lastTransition` com o último estado e sua data. ✅/❌.
- **CA-13** — `changesHistory` vazio (`ST-EMPTY-HISTORY`) ou malformado (`ST-MALFORMED-HISTORY`): NÃO lança; `lastTransition` ausente/undefined; `userMessage` ainda correta pelo estado. ✅/❌.
- **CA-14** — `deps` é injetável (gateway + repo) — a função aceita dublês sem tocar DB/rede real (testável puro). ✅/❌.

### 4.3 Tool / registry / factory

- **CA-15** — `check_proposal_status` existe no registry estático `consorcioTools` e seu `execute` (sem contexto) retorna a resposta "sem contexto" — não chama DB/gateway. ✅/❌.
- **CA-16** — `inputSchema` da tool é `z.object({})` — **zero campos**. Assert: o schema não declara `proposalId` nem nenhum campo. (anti-hallucination, espelha `present_whatsapp_optin`/contract_form). ✅/❌.
- **CA-17** — `buildConsorcioTools({ conversationId })` produz um override de `check_proposal_status` cujo `execute` chama `checkProposalStatus(conversationId)` via closure. Com `conversationId` undefined → resposta "sem contexto" (CN-12). ✅/❌.
- **CA-18** — `buildAgent` para specialist (não-concierge) SEMPRE inclui `check_proposal_status` em `tools`, mesmo que `row.activeTools` NÃO a liste (primitivo do sistema, espelha `present_contract_form`). Concierge NÃO a inclui. ✅/❌.

### 4.4 Prompt

- **CA-19** — `SPECIALIST_BASE_PROMPT` contém uma seção que instrui: pergunta de status/andamento → SEMPRE chamar `check_proposal_status`. Assert por substring/regex (`/status[\s\S]{0,200}check_proposal_status/i`). ✅/❌.
- **CA-20** — O prompt PROÍBE explicitamente responder status de memória e re-buscar grupos para pergunta de status (substrings tipo "nunca de memória" + "não re-buscar/re-buscar grupos" perto de `check_proposal_status`). ✅/❌.

### 4.5 Camada 2 — cassette `FIX-14-STATUS-VIA-TOOL`

- **CA-21** — Cassette: turn "qual o status da proposta?" com proposta ativa → `toolCalls` contém `check_proposal_status` e **NÃO** contém `search_groups`/`recommend_groups`/`simulate_quota`/`present_comparison_table`/`present_recommendation_card`. ✅/❌.
- **CA-22** — Cassette: a tool é chamada **sem nenhum argumento** (input `{}`) — prova que o modelo não passa proposalId. ✅/❌.
- **CA-23** — Cassette: o texto narrado pelo agent NÃO vaza jargão (`systemicValue`, `waitingForUniqueCode`, `pending`, `situation`). ✅/❌.
- **CA-24** — O `describe` vive em `tests/regression/agent-trajectory.test.ts` com nome `FIX-14-STATUS-VIA-TOOL` (append-only, não quebra describes existentes). ✅/❌.

### 4.6 Camada 1 — completude estrutural

- **CA-25** — Arquivo `src/lib/bevi/proposal-status.test.ts` existe e cobre CA-1..CA-14 (tradução + orquestração com dublês). Roda em < 1s, sem rede/DB real. ✅/❌.
- **CA-26** — Teste estrutural cobre tool no registry + schema vazio + factory closure + builder always-exposed + prompt (CA-15..CA-20), no padrão de `decision-prompt.structural.test.ts`. ✅/❌.

### 4.7 Camada 3 — eval (nightly)

- **CA-27** — `tests/eval/agent-flow.eval.test.ts` ganha cenário: conversa pós-fechamento (seed de `bevi_proposals` para a conversa + gateway dublê via `__setProposalGatewayForTests` retornando `ST-WAITING-UNIQUE-CODE`). Usuário pergunta "qual o status da proposta?". Asserts comportamentais: agent chamou `check_proposal_status`; NÃO chamou `search_groups`/`recommend_groups` (zero re-descoberta); transcript reflete o estado real traduzido; nenhum jargão técnico no texto final. ✅/❌.
- **CA-28** — O cenário do eval restaura os seams no `afterAll` (`__setProposalGatewayForTests(null)` + limpeza do seed), sem vazar estado pra outros evals. ✅/❌.

### 4.8 Invariantes globais (não-regressão)

- **CA-29** — `npm run test:pre-commit` (Camadas 1+2) passa verde com FIX-14 incluso. ✅/❌.
- **CA-30** — `npx vitest run` (suite completa Camadas 1+2) passa sem quebrar nenhum describe pré-existente (mock-runtime-morto, gate-identify, contract-flow etc.). ✅/❌.
- **CA-31** — Nenhuma `userMessage` em nenhum cenário inventa número/data/estado que não veio do `getStatus` real (regra mock-runtime-morto + D11). ✅/❌.
- **CA-32** — Nenhum dado mock em runtime: `proposal-status.ts` não importa `MockProposalGateway` nem fixtures de teste em produção (usa `getProposalGateway()`/`getLatestBeviProposal`; dublês só via `deps`). ✅/❌.

---

## 5. Output esperado por cenário (shapes e asserts)

### 5.1 Shape do retorno de `checkProposalStatus`

```ts
// hasProposal:true, sucesso
{
  ok: true,
  hasProposal: true,
  userMessage: string,           // PT-BR leigo, pronta pro modelo narrar
  lastTransition?: { state: string; label?: string; at?: string },
  raw?: ProposalStatus,          // opcional, pra debug/log — NUNCA exposto cru ao user
}

// sem proposta
{ ok: true, hasProposal: false, userMessage: "Você ainda não criou nenhuma proposta…" }

// erro de gateway
{ ok: false, hasProposal?: true, userMessage: "Não consegui consultar o andamento agora — tenta de novo em instantes." }
```

### 5.2 Conteúdo esperado da `userMessage` por estado

| Estado / override | `userMessage` (sentido, não literal — confirmar copy na implementação) | Proíbe |
|---|---|---|
| `waitingForUniqueCode` | "Sua proposta está na fila da administradora — te aviso assim que entrar." | "waitingForUniqueCode", "pending" |
| `documentoPessoal` / `endereco` / `comprovanteDeEndereco` / `dadosDoDocumentoDeIdentidade` | "Falta completar <passo> — quer que eu te ajude a finalizar?" | termos técnicos |
| `simulation` / `consultaConsorcioBevicred` / `dadosIniciais` | "Sua proposta está em <fase> com a administradora." | termos técnicos |
| `integrationCode` preenchido | "Sua proposta entrou na administradora (nº <code>)." | — |
| `approvedAt` | "Boa notícia: sua proposta foi aprovada!" | — |
| `reprovedAt` | "Sua proposta não foi aprovada — posso te explicar os próximos passos." | — |
| desconhecido | repassa `statusName` literal: "Status atual: <statusName>." | inventar significado |
| sem proposta | "Você ainda não tem uma proposta criada por aqui." | — |
| erro | "Não consegui consultar agora — tenta de novo em instantes." | estado/credencial |

### 5.3 Output do cassette (Camada 2)

- `toolCalls` = `[{ toolName: "check_proposal_status", input: {} }]`.
- `toolCalls.map(t=>t.toolName)` ∩ `{search_groups, recommend_groups, simulate_quota, present_comparison_table, present_recommendation_card}` = ∅.
- `text` não casa `/systemicValue|waitingForUniqueCode|\bpending\b|situation/i`.

### 5.4 Output do eval (Camada 3)

- `transcript` (turns) contém uma tool-call `check_proposal_status`.
- contagem de `search_groups` + `recommend_groups` nesse turn = 0.
- assert estrutural: texto final do agent reflete o estado seedado (substring do sentido da `userMessage`).
- log/DB: a tool consultou via gateway dublê (spy de chamada).

---

## 6. Como o QA crítico vai validar (comandos / método por critério)

> Banco para Camadas 1/2 (do header do `agent-trajectory.test.ts`):
> `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/aja_agora`.
> Os testes de função pura/dublê NÃO precisam de DB; os de repo precisam.

| CA | Como validar |
|----|--------------|
| CA-1..CA-6 | `npx vitest run src/lib/bevi/proposal-status.test.ts --reporter=verbose` — inspecionar asserts de tradução/precedência. Inspeção de código de `translateProposalStatus` (ordem dos ifs). |
| CA-7..CA-14 | mesmo arquivo — testes de `checkProposalStatus` com gateway/repo dublês (spy de chamadas: `getStatus` 1x com proposalId certo; 0x quando sem proposta; `console.error` spy no caminho de erro). |
| CA-15..CA-18 | `npx vitest run src/lib/agent/<proposal-status|status-tool>.structural.test.ts` — asserts: `"check_proposal_status" in consorcioTools`; schema sem campos (introspecção do zod shape); `buildConsorcioTools({conversationId:"x"})` retorna override; `buildAgent(specialistRow)` inclui a tool sem ela estar em activeTools; concierge não inclui. |
| CA-19..CA-20 | mesmo arquivo — asserts de substring/regex no `SPECIALIST_BASE_PROMPT` (padrão de `decision-prompt.structural.test.ts`). |
| CA-21..CA-24 | `npx vitest run tests/regression/agent-trajectory.test.ts -t "FIX-14-STATUS-VIA-TOOL" --reporter=verbose` — cassette com `runMockStream` + `toolCallChunk("…","check_proposal_status",{})`. |
| CA-25..CA-26 | inspeção: arquivos existem nos paths exigidos; tempo de execução < 1s (`--reporter=verbose` mostra duração). |
| CA-27..CA-28 | `npx vitest run --config vitest.eval.config.ts -t "<nome do cenário FIX-14>"` (gated por `ANTHROPIC_API_KEY` — `describeIfKey`). Verificar seed/seam restaurados no `afterAll`. Como é nightly, o QA roda manualmente uma vez e confirma estrutura + asserts; falha aqui NÃO bloqueia merge mas DEVE estar escrito e passando localmente. |
| CA-29 | `npm run test:pre-commit` — verde. |
| CA-30 | `npx vitest run` (Camadas 1+2 completas) — zero describes pré-existentes quebrados. |
| CA-31..CA-32 | inspeção adversarial de código: grep por valores hardcoded de status/data em `proposal-status.ts`; grep por import de `MockProposalGateway`/`__fixtures__` em `src/`; confirmar que toda string de número/estado vem do `raw` do `getStatus`. |

### 6.1 Rigor adversarial — buracos que o QA DEVE tentar furar

1. **proposalId alucinado**: tentar provar que existe algum caminho onde o modelo controla o id. Confirmar `inputSchema` vazio E que o execute ignora qualquer input. (CA-16/CA-18/CA-22)
2. **estado inventado em erro**: forçar `ERR-404` e confirmar que NENHUM campo de estado real aparece na `userMessage` (não pode "chutar" pending). (CA-9/CA-31)
3. **jargão vazado**: varrer TODAS as `userMessage` de todos os estados por termos técnicos. Um único vazamento = ❌ CA-1/CA-17/CA-23.
4. **gateway chamado sem proposta**: spy deve provar 0 chamadas em `ROW-NONE` (custo/latência à toa + risco de 404 falso). (CA-8)
5. **changesHistory hostil**: passar `null`, `undefined`, `[{}]`, item com `newState` sem `systemicValue` — não pode lançar. (CA-13)
6. **divergência multi-canal**: confirmar que web e WhatsApp passam pelo MESMO `buildConsorcioTools`/`buildAgent` (não há um segundo registry pro WhatsApp). (CA-19/CN-19)
7. **regressão de re-busca**: no cassette E no eval, qualquer `search_groups`/`recommend_groups` no turn de status = ❌ (era exatamente o bug do print do Kairo). (CA-21/CA-27)
8. **mock em runtime**: garantir que o código de produção não importa nada de `tests/` nem `MockProposalGateway`. (CA-32)

---

## 7. Definição de DONE (gate de conclusão)

FIX-14 só é "feito" quando **todos** os CA-1..CA-32 estão ✅, com evidência:
- Camadas 1 e 2 verdes em `npm run test:pre-commit` e na suite completa (CA-29/CA-30).
- Cassette `FIX-14-STATUS-VIA-TOOL` presente e verde (CA-21..CA-24).
- Cenário de eval escrito e passando localmente com chave (CA-27/CA-28) — nightly não bloqueia merge, mas o teste tem que existir e estar verde.
- Commit único `test+feat:` com Camada 1 + Camada 2 + código de produção (TDD: testes primeiro, ver falhar, implementar, ver passar).
- Após concluir: mover `docs/correcoes/todo/bloco-b-status-tool/fix-14-tool-status-proposta.md` → `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.

Nenhum CA é negociável para "fechar". Critério reprovado → corrige → re-roda QA → repete.
