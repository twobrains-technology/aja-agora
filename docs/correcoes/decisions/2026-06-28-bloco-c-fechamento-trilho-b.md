# Decisão — Bloco C: fechamento via Trilho B (self-contract)

> 2026-06-28/2026-07-01 · Design do `bloco-c-fechamento-trilho-b` (FIX-88 + FIX-89).
> Consolida os pontos de design não-óbvios levantados na implementação; as 3
> perguntas de trade-off foram confirmadas pelo Kairo via `AskUserQuestion`
> (todas seguindo a opção recomendada).

## Contexto

O Trilho A (API de Parceiro) está travado (`calculate_simulation` → 400
"Proposta não pertence ao Bevi Consórcio", pendência externa AGX/productId,
sem prazo de resolução). Decisão do Kairo: fechar via Trilho B (self-contract,
rotas `/unauth/...`, sem token, sem `productId`). O B já descobre (passos 1-4);
este bloco o faz também fechar (passo 5), reaproveitando a MESMA proposta.

Isto reverte parcialmente o ADR `2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`
— ver seção "Evolução" anexada lá.

## Pontos de design fechados

### D1 — Como obter o `proposalId` real do self-contract

O `create-proposal` do self-contract **não devolve um proposalId de verdade**
— só `data.selfContract.hashId`, que é igual ao `storeHash` da loja (não um id
de proposta). O self-contract é stateful **por hash**, não por proposalId
explícito nas chamadas (`update-step`/`simulation` não recebem proposalId no
payload — o servidor resolve a proposta ativa só pelo hash da URL).

**Decisão:** adicionar `getSystemState()` a `BeviSelfContractClient`
(`GET /{hash}/system`), que devolve o estado corrente da proposta pro hash
(inclui `proposal._id` = o proposalId real). `BeviSelfContractProposalGateway`
usa isso pra resolver o `proposalId` retornado por `createProposal` e
consultado por `getStatus`. Decisão técnica de implementação (não foi levada
ao Kairo — é a única rota que não depende de desambiguar múltiplas propostas
por CPF como o `get-multi-proposal` exigiria).

### D2 — `chooseOffer` sem `consortiumProposalLink` (self-contract não redireciona)

**Pergunta:** manter o shape de `ChooseOfferResult` (que o Trilho A também usa)
com `consortiumProposalLink: string` obrigatória, ou tornar opcional na
interface compartilhada?

**Decisão (Kairo, opção recomendada):** manter a interface intacta.
`BeviSelfContractProposalGateway.chooseOffer()` devolve
`consortiumProposalLink: ""` (sentinel vazio — self-contract não produz link,
fecha inline). O dado real (`proposalNumber`) vira um campo **novo e opcional**
em `ConfirmOfferResult` (tipo local de `fulfillment.ts`, único arquivo em
escopo que precisa mudar). Zero mudança em `proposal-gateway.ts` pro Trilho A.
A adaptação de copy/UI pro caso "sem link, só nº de proposta" fica como GAP
documentado — não é território deste bloco (`closing-presentation.ts`,
`signature-handoff.tsx`, `chat/types.ts` não estão no escopo_arquivos e o
bloco-b paralelo mexe nesses mesmos arquivos de chat/WhatsApp).

**Consequência:** `uploadContractDocument` (fulfillment.ts) tinha uma guarda
`if (!row || !link) throw` que exigia link truthy — quebraria sempre pro
self-contract (link = ""). Relaxada pra `if (!row) throw` (Trilho A não muda
de comportamento, sempre tem link truthy nesse ponto).

### D3 — Passo `finalize` (assimetria entre os trilhos)

O self-contract tem um passo que o Trilho A não tem: depois de "escolher"
(`finished:true` na simulação), só fecha de fato com um `finalize`
(`PATCH .../waitingForUniqueCode`) que devolve o `proposalNumber` (inserção
assíncrona na administradora).

**Pergunta:** modelar como método opcional na interface compartilhada
(duck-typed, sem branch por tipo concreto) ou como branch explícito
(`instanceof`) em `fulfillment.ts`?

**Decisão (Kairo, opção recomendada):** `finalize?(proposalId): Promise<{proposalId, proposalNumber?}>`
como método **opcional** em `ProposalGateway`. `BeviApiAdapter` não implementa
(Trilho A não tem esse passo — a inserção acontece do lado da Bevi após a
assinatura via link). `fulfillment.confirmOffer` chama `gateway.finalize?.(...)`
via optional chaining — sem checar o tipo concreto, mantendo `fulfillment.ts`
agnóstico de qual trilho está por trás (Adapter Pattern intacto).

`confirmOffer` chama `chooseOffer` **e então** `finalize` na mesma invocação
(sequência imediata, sem esperar upload de documento — os passos de KYC
inline, doc pessoal e comprovante de endereço são **opcionais** no self-contract
e não bloqueiam a inserção, conforme `bevi-api-discovery.md §4`).

### D4 — Persistência do `proposalNumber`

**Pergunta:** persistir em `bevi_proposals` (exige migration à mão, já que
`db:generate` está quebrado — bloco-g/FIX-100) ou só devolver no retorno da
função por agora?

**Decisão (Kairo, opção recomendada):** só no retorno da função por agora.
Evita migration fora do `escopo_arquivos` declarado (`schema.ts` não está
listado neste bloco) e evita conflito de migration com o bloco-a (que também
altera `schema.ts` na mesma onda, adicionando `client_documents`).
Persistência fica de follow-up quando o admin/WhatsApp precisar exibir o nº
depois do turno atual.

### D5 — Mapeamento de oferta self-contract → `PartnerOffer`

Não levado ao Kairo (decisão técnica direta). O self-contract "escolhe" a
oferta reenviando o **objeto da oferta inteiro** no PATCH `finished:true`
(não um id isolado como no Trilho A) — por isso o gateway precisa **cachear**
as ofertas cruas da última `simulate()` (por `quotaId`, mesmo padrão do
`BeviSelfContractAdapter.offerIndex` na descoberta) pra reidratar o objeto
completo quando `chooseOffer({ofertaId})` for chamado.

Mapeamento `BeviOffer` (self-contract, ~72 campos) → `PartnerOffer` (Trilho A,
8 campos, é o shape que `pickClosestOffer`/`partnerOfferToRealOffer` em
`fulfillment.ts` já esperam — não modificados):

| `PartnerOffer` | Origem self-contract |
|---|---|
| `ofertaId` | `quotaId` |
| `administradora` | `bankLabel ?? bank` |
| `tipoOferta` | `type === "FREE_BID" ? "FREE_BID" : "SPECIAL_OFFER"` (EMBEDDED_BID colapsa em SPECIAL_OFFER — GAP documentado, mesmo padrão do `offer-mapper.ts` que já colapsa enums) |
| `grupo` | `group` |
| `valorCarta` | `finalValue` |
| `parcela` | `importedInstallmentValue ?? installmentValue` |
| `taxaContemplacao` | `lowestContemplationRate` (fração — semântica TBD, igual ao Trilho A) |
| `quotaId` | `quotaId` |
| `prazo` | `term` |
| `lanceMedio` | `averageBid` |

## PENDENTE-KAIRO (não resolvido — fora do alcance deste bloco)

1. **Validar ao vivo o step de upload de documento do self-contract** (portal
   CONEXIA) — já era pendência conhecida antes deste bloco. O caminho de
   upload delega ao stub `dispatchClientDocument(documentId, "bevi_b")`
   (contrato do bloco-a, FIX-84) em vez de tentar uma chamada HTTP real não
   comprovada.
2. **O shape exato do PATCH `finished:true`** (que campos exatamente carregam
   "a oferta escolhida" no body do `update-step/.../simulation`) também **não
   tem captura real** — é inferido da descrição textual do cookbook
   (`bevi-api-discovery.md §4`), não de um payload capturado ao vivo. Implementado
   com o melhor palpite razoável (reenvia os params da simulação + `finished:true`
   + o objeto da oferta cacheada) — precisa validação ao vivo junto com o item 1.

## Arquivos afetados

- `src/lib/adapters/bevi/self-contract-client.ts` — `getSystemState()`,
  `chooseOffer()` (finished:true), `finalize()` (waitingForUniqueCode).
- `src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts` (novo) —
  implementa `ProposalGateway` + `finalize?()`.
- `src/lib/adapters/proposal-gateway.ts` — adiciona `finalize?()` opcional à
  interface.
- `src/lib/adapters/index.ts` — `PROPOSAL_GATEWAY=selfcontract` no seletor.
- `src/lib/bevi/fulfillment.ts` — `confirmOffer` chama `finalize?.()`;
  `ConfirmOfferResult.proposalNumber?`; guarda de `uploadContractDocument`
  relaxada; dispatch stub local (`dispatchClientDocument`, contrato do
  bloco-a/FIX-84) chamado pelo caminho de documento do self-contract.
