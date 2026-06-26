# Bloco B — Fechamento Bevi: rejeição do propostaId (FIX-79)

**Data:** 2026-06-26
**Branch:** `fix/bevi-fechamento-propostaid`
**Commits:** `35e0bbac` (docs decisão) · `e2436990` (test+fix) · close do bloco

## O que estava quebrado (e por que importa)

O **passo 5 da jornada — "Contratar"** é o core value do produto: é onde o usuário
fecha o contrato de consórcio sem corretor, sem redirect. Na rodada de QA manual do
Kairo (2026-06-25, conv `a9c5effa`, administradora TRADIÇÃO), esse passo **travava**: a
Bevi devolvia `400 — "Proposta não pertence ao Bevi Consórcio."` e o usuário via o
fallback gracioso *"Tive um problema ao falar com a administradora agora…"*. O contrato
**não fechava** — o funil inteiro morria na linha de chegada.

## Causa-raiz (smoking gun)

A cadeia `startContract → createProposal → simulate` tinha uma **assimetria**:
`createProposal` enviava `productId` explícito, mas `calculate_simulation` **não**. A
proposta era criada referenciando um product, e o `simulate` resolvia a propriedade por
outro caminho (conta do token) — então uma proposta **recém-criada** era recusada como
"não pertence". A proposta nem chegava a persistir (`bevi_proposals` com 0 linhas pra a
conv): o erro estourava no `simulate`, antes do snapshot.

## O que foi entregue

1. **Consistência no `simulate`** (`bevi-api-adapter.ts`): agora envia o **mesmo**
   `this.config.productId` que criou a proposta. Fecha a assimetria do nosso lado —
   criar e simular passam a referenciar o product explicitamente, pelo mesmo caminho.
2. **Erro de ownership tipado** (`bevi-errors.ts`): o `400` com `field: 'propostaId'`
   vira `ProposalOwnershipError` (subclasse de `BeviApiError`). Ops consegue grepar a
   classe exata; o teste assevera. A UX não muda — o route já degrada gracioso.
3. **Regressão anti-volta** (`src/lib/bevi/fulfillment.fix-79.test.ts`): integration/
   contract test do adapter (NÃO cassette — é bug de integração, não de agente).
   Exercita o caminho REAL: `startContract → BeviApiAdapter real → fetch mockado`
   reproduzindo o ownership-400. TDD strict: **vermelho** (simulate sem productId →
   400) → **verde** (com productId → ofertas). Vive ao lado do código pra **gatear todo
   PR** via `pnpm test:unit` — `tests/integration/` não é coletado pelo `vitest.config`.

## Decisão de design

Opção escolhida: **ambos, em camadas** — thread `productId` no `simulate` (consistência,
o código) + `BEVI_PRODUCT_ID` permanece env-parametrizado (já era) + erro tipado pra
diagnóstico. ADR completo em
`docs/correcoes/decisions/2026-06-25-bloco-b-bevi-fechamento.md`.

## ⚠️ PENDENTE-KAIRO (dependência externa — Bevi/AGX)

A correção de código fecha a assimetria do **nosso** lado, mas a correção **DEFINITIVA
depende de dado externo que não podemos inventar**:

1. **Confirmar com a Bevi/AGX o `productId` correto** do produto "Bevi Consórcio" da
   loja-piloto desse `BEVI_API_TOKEN` e **setar `BEVI_PRODUCT_ID` explícito no env**
   (dev e prod). O default hardcoded (`6986245b3518ceb00e7844da`) é **hipótese não
   confirmada** — se ele estiver fora da conta do token, o fechamento continua recusando
   mesmo com o `productId` no simulate (proposta nasce sob product errado).
2. **Investigar `ignoreOngoingProposals:true`** (`fulfillment.ts:82`) — confirmar com a
   Bevi se ele solta o CPF de proposta ongoing em **outro** product (pode mascarar o
   mismatch).

> Não inventei o productId — é dado da Bevi. O código está pronto pra quando o valor
> correto for setado no env.

## Validação

- `pnpm test:unit` (gate do merge-wave) **verde no container**: 181 arquivos passaram,
  1 skipped, **0 falhas** (com DB migrado + `RUN_DB_TESTS=1`).
- Suítes Bevi (`src/lib/adapters/bevi/` + `src/lib/bevi/`): 191 testes verdes.
- Ambiente: container `aja-app-bevi-fechamento-propostaid` (store pnpm compartilhado +
  pg migrado), conforme convenção local-dev TwoBrains. **Host sem node_modules** (TRAVA
  do Superset) → o pre-commit do husky não está wired no worktree (`.husky/_` ausente);
  o commit foi **normal, sem `--no-verify`**, com o gate verificado no container.

## Gaps honestos (fora do escopo deste bloco)

- **UX de erro permanente:** para o ownership-400 (config permanente — retry nunca cura),
  o route ainda mostra *"tente de novo em instantes"*. O ideal seria mapear pra copy de
  "habilitação com a administradora" (como já há pra `BeviConfigError`), mas isso toca
  `route.ts`/`contract-capture.ts` — **fora do `escopo_arquivos`** do bloco (disjunto,
  nível 1). Registrado pra um bloco futuro.
- **Spec:** `calculate_simulation` não documenta `productId` (§4.3). Enviamos assim mesmo
  (mesmo valor da criação → ignorado no pior caso, nunca cria mismatch novo). Se a Bevi
  validar campos estritamente, confirmar que aceita o extra — parte da conversa do
  PENDENTE-KAIRO.

## Linha vermelha

Push da branch feito. **Sem** PR/merge/deploy/migration-na-mão/reminder — integração na
base é do orquestrador (merge-wave); revisão+merge é decisão do Kairo.
