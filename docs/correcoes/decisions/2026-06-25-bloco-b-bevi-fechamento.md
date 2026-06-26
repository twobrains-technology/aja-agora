---
data: 2026-06-25
bloco: bloco-b-bevi-fechamento
escopo: FIX-79 — Bevi rejeita o propostaId no fechamento ("Proposta não pertence ao Bevi Consórcio.")
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do Bloco B (fechamento Bevi: rejeição do propostaId)

## Contexto

QA manual do Kairo (2026-06-25), conv `a9c5effa`, administradora TRADIÇÃO. Ao fechar
o contrato (passo 5 "Contratar" da jornada — o core value), a Bevi devolve **400** no
`calculate_simulation` com:

```
errors: [{ field: 'propostaId', message: 'Proposta não pertence ao Bevi Consórcio.' }]
```

A UX cai no fallback gracioso (*"Tive um problema ao falar com a administradora agora…"*)
e o contrato **não fecha**.

### Cadeia confirmada no código (root cause)

- `startContract` (`src/lib/bevi/fulfillment.ts:86`) → `gateway.simulate({ proposalId })`
  → `BeviApiAdapter.simulate` (`bevi-api-adapter.ts:139`, service `calculate_simulation_bevi_consorcio`).
- conv `a9c5effa` tem **0 linhas em `bevi_proposals`** → não foi reuso idempotente; foi
  `createProposal` **fresco** que **não persistiu** porque o erro estourou no `simulate`
  (linha 86) antes do snapshot (linha 98+).
- **SMOKING GUN:** `createProposal` envia `productId` **explícito**
  (`bevi-api-adapter.ts:120`, `BEVI_PRODUCT_ID` default hardcoded `6986245b3518ceb00e7844da`)
  mas `simulate` **NÃO** envia `productId` — a Bevi resolve a propriedade da proposta pela
  conta do `BEVI_API_TOKEN`. Proposta recém-criada recusada como "não pertence" indica que
  **nasceu sob product/conta diferente** do que o token resolve como "Bevi Consórcio".

### O que a spec diz (`docs/integracoes/bevi-api-parceiro-spec.md §4.3`)

O request de `calculate_simulation` documentado **não lista `productId`** — a propriedade
é fixada na criação (`insert_proposal`, §4.1, `productId` obrigatório) e resolvida por
token + propostaId no simulate. Ou seja: a causa-raiz definitiva é o **`BEVI_PRODUCT_ID`
errado na criação**, não a ausência do campo no simulate.

## Hipótese (NÃO verificável só do nosso lado — é hipótese, não fato)

`BEVI_PRODUCT_ID` (`6986245b3518ceb00e7844da`) é o **default hardcoded** em
`bevi-api-adapter.ts:60` (não setado explícito no env do dev) e **pode não corresponder**
ao product "Bevi Consórcio" da conta do `BEVI_API_TOKEN` (loja-piloto). Proposta nasce sob
product órfão → `simulate` recusa por ownership.

## Opções consideradas (raciocínio brainstorming — executor decide, sem perguntar)

1. **Só enviar `productId` no `simulate`.** Fecha a assimetria do smoking gun. Risco:
   a spec não lista o campo; um validador estrito poderia 400. Mitigação: é o **mesmo**
   `this.config.productId` que criou a proposta → no pior caso é ignorado, nunca cria um
   mismatch NOVO. Não resolve sozinho se o `BEVI_PRODUCT_ID` em si estiver errado.
2. **Só parametrizar `BEVI_PRODUCT_ID` (env).** O código já lê de env (`loadBeviConfigFromEnv`,
   linha 60) — o único hardcode é o **default**. A correção real é setar o valor certo no env,
   que é **dado externo da Bevi/AGX** (PENDENTE-KAIRO). Sem o `productId` no simulate, a
   assimetria do smoking gun continua.
3. **Ambos** + tornar o erro de ownership **tipado/diagnosticável**.

## Decisão: Opção 3 (ambos, em camadas)

1. **Thread `productId` no `simulate`** (`bevi-api-adapter.ts`) — mesma fonte
   `this.config.productId` que o `createProposal` usa. Fecha a assimetria do smoking gun
   **do nosso lado**: criar e simular passam a referenciar o MESMO product explicitamente.
   É o prerequisito de consistência; a definição do valor certo é externa.
2. **`BEVI_PRODUCT_ID` permanece env-parametrizado** (já era). O default hardcoded fica como
   fallback, mas o valor correto da loja-piloto é **PENDENTE-KAIRO** (acionar Bevi/AGX +
   setar `BEVI_PRODUCT_ID` explícito no env dev/prod). **Não inventei o productId** — é dado
   da Bevi.
3. **`ProposalOwnershipError` tipado** (`bevi-errors.ts`) — o 400 com `errors[].field ==
   'propostaId'` vira um erro de domínio nomeado (subclasse de `BeviApiError`), pra ops
   grepar a classe exata e pro teste asseverar. Não muda a UX (o route trata via o catch
   genérico → fallback gracioso, que continua disparando), só torna o bug diagnosticável.

### Por que não tocar o `route.ts`/`contract-capture.ts`

O bloco é disjunto (nível 1) e o `escopo_arquivos` declara apenas `bevi-api-adapter.ts`,
`fulfillment.ts`, `bevi-errors.ts` e o teste. O fallback gracioso já dispara hoje (catch
genérico do route → *"Tive um problema…"*), coberto por
`route.contract-error-logging.test.ts`. **Gap honesto:** a UX mostra *"tente de novo em
instantes"* para um erro de config **permanente** (productId mismatch nunca cura no retry) —
melhorar isso (mapear ownership → copy de "habilitação com a administradora", como já há pra
`BeviConfigError`) toca o `route.ts`, **fora do escopo deste bloco**. Registrado como nota.

## Regressão

Integration/contract test do adapter (NÃO cassette — é bug de integração, não de agente):
`src/lib/bevi/fulfillment.fix-79.test.ts`. Exercita `startContract` → `BeviApiAdapter` REAL
→ `fetch` mockado, com o gateway HTTP reproduzindo o ownership-400. TDD strict: vermelho
primeiro (simulate sem productId → 400), verde após o fix (simulate com productId → ofertas).
Vive ao lado do código (não em `tests/integration/`, que o `vitest.config.ts` nem coleta) pra
**gatear todo PR** via `pnpm test:unit`.

## PENDENTE-KAIRO (externo — Bevi/AGX)

1. Confirmar com a Bevi/AGX o `productId` correto do produto "Bevi Consórcio" da loja-piloto
   desse `BEVI_API_TOKEN` e **setar `BEVI_PRODUCT_ID` explícito no env** (dev e prod).
2. Investigar com a Bevi se `ignoreOngoingProposals:true` (`fulfillment.ts:82`) realmente
   solta o CPF de proposta ongoing em **outro** product (pode mascarar o mismatch).
