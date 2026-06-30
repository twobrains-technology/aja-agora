---
id: FIX-88
titulo: "BeviSelfContractProposalGateway (ProposalGateway via self-contract) + KYC/finalização no client"
status: todo
bloco: bloco-c-fechamento-trilho-b
arquivos:
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts
rodada: 2026-06-28 — fazer a jornada fechar de ponta a ponta (Trilho A travado)
---

## Palavras do operador
> "só precisamos fazer com que isso funcione a jornada toda." (+ decisão: implementar fechamento
> via Trilho B, jornada completa com KYC)

## Cenário (estado atual — investigado ao vivo 28/06)
`BeviSelfContractClient` cobre só até `simulate`. O fechamento (escolher oferta + KYC +
`waitingForUniqueCode`) NÃO existe. O Trilho A (`BeviApiAdapter`) está travado (productId/AGX),
então o `ProposalGateway` atual não fecha.

## Root cause (investigado)
Falta uma implementação de `ProposalGateway` (contrato de fechamento) sobre o self-contract, e
faltam os endpoints de fechamento no client (KYC steps + finalização). O B fecha sem productId.

## Correção proposta
| O quê | Onde |
|---|---|
| Estender `BeviSelfContractClient`: `chooseOffer(offer)` = `PATCH update-step/.../simulation` com `finished:true` + objeto da oferta; `setIdentityDoc(dados)` = step `dadosDoDocumentoDeIdentidade`; `setEndereco(end)` = step `endereco`; `finalize()` = `PATCH .../waitingForUniqueCode` → devolve `proposalNumber` | `src/lib/adapters/bevi/self-contract-client.ts` |
| `BeviSelfContractProposalGateway implements ProposalGateway` mapeando os 8 métodos pro self-contract (ver tabela no _bloco / proposal-gateway.ts): createProposal→create-proposal; listSegments→getSegments; simulate→simulation; chooseOffer→simulation finished:true (sem uselink.me — devolve marcador de inserção); getStatus→get-multi-proposal; insertAdditionalData→steps KYC; getDocumentLinks/uploadDocument→delegado ao despacho de documentos (bloco-a) | `src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts` (novo) |

Quirks do self-contract (já no client): retry 404 transitório pós-troca de step; 1 proposta
ativa por hash/device (reusa a de descoberta). Fixtures = cassettes reais (ok-selfcontract-*).

## Regressão exigida
- **Camada 1 (structural):** o gateway implementa todos os métodos de `ProposalGateway`;
  `chooseOffer` envia `finished:true`; `finalize` chama o step `waitingForUniqueCode`.
- **Integration (contract):** com fetch mockado pelas fixtures self-contract, o fluxo
  createProposal→simulate→chooseOffer→finalize roda e devolve `proposalNumber`. Não-agêntico → sem cassette.
