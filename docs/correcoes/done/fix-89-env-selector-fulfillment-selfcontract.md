---
id: FIX-89
titulo: "Selecionar o gateway self-contract por env + fulfillment reusa a proposta de descoberta"
status: done
bloco: bloco-c-fechamento-trilho-b
arquivos:
  - src/lib/adapters/index.ts
  - src/lib/bevi/fulfillment.ts
  - docs/correcoes/decisions/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md
rodada: 2026-06-28 — fazer a jornada fechar de ponta a ponta (Trilho A travado)
commit: 1ad9496b
executado_em: 2026-07-01
---

## Palavras do operador
> "só precisamos fazer com que isso funcione a jornada toda."

## Cenário (estado atual)
`getProposalGateway()` (`src/lib/adapters/index.ts`) só conhece `"bevi"` (BeviApiAdapter / Trilho A).
O `fulfillment.startContract` cria proposta NOVA no A + re-simula + `pickClosestOffer` (handoff B→A).
Com o A travado, não fecha.

## Root cause (investigado)
Sem seletor pro gateway self-contract e sem o fulfillment saber reusar a proposta de descoberta
do Trilho B (no B, descoberta e fechamento são a MESMA proposta — não cria nova, não re-simula).

## Correção proposta
| O quê | Onde |
|---|---|
| Adicionar `"selfcontract"` ao switch de `PROPOSAL_GATEWAY` → instancia `BeviSelfContractProposalGateway` (FIX-88) | `src/lib/adapters/index.ts` |
| Quando o gateway é self-contract, `startContract` REUSA a proposta de descoberta da conversa (discovery-session) em vez de criar nova/re-simular; `confirmOffer` → `chooseOffer` (finished:true) + `finalize` → `proposalNumber`; sem `consortiumProposalLink` (UX "proposta enviada à administradora, nº X") | `src/lib/bevi/fulfillment.ts` |
| Disparar o despacho do documento pro destino do trilho: `dispatchClientDocument(documentId, "bevi_b")` — **STUB nível 3** (contrato do bloco-a) com `TODO(bloco-a): dispatch real` até o merge de A | `src/lib/bevi/fulfillment.ts` |
| Atualizar o ADR: o fechamento-via-B deixa de ser "descartado" — premissa mudou (A travado sem prazo + piloto). Registrar a evolução da decisão (não apagar a anterior; anexar) | `docs/correcoes/decisions/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md` |

## Regressão exigida
- **Camada 1 (structural):** `PROPOSAL_GATEWAY=selfcontract` resolve o gateway self-contract;
  no modo self-contract o fulfillment NÃO chama createProposal-nova/pickClosestOffer (reusa descoberta).
- **Camada 2 (cassette):** o fechamento via B é caminho do AGENTE? O fechamento é disparado por
  ação (contract-submit/offer-confirm) — se o comportamento do agente muda (texto/artifact do passo 5),
  adicionar cassette em `tests/regression/agent-trajectory.test.ts`; senão, Camada 1 basta. Decida pelo diff.
- **Integration:** startContract no modo selfcontract reusa a proposta de descoberta e finaliza
  (fixtures self-contract) devolvendo `proposalNumber`; o stub de dispatch é chamado com `bevi_b`.
