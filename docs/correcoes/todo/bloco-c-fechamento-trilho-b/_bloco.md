---
bloco: bloco-c-fechamento-trilho-b
branch: feat/fechamento-trilho-b
workspace: feat-fechamento-trilho-b
onda: 1
depends_on: []
paralelo_com: [bloco-a-documentos-cliente, bloco-b-chat-mesa-whatsapp]
itens: [FIX-88, FIX-89]
escopo_arquivos:
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts
  - src/lib/adapters/index.ts
  - src/lib/bevi/fulfillment.ts
  - docs/correcoes/decisions/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md
conflitos_esperados:
  - "nível 3 (dependência de contrato): consome `dispatchClientDocument(documentId, 'bevi_b')` do bloco-a (src/lib/documents/dispatch.ts). Implementar contra STUB com TODO(bloco-a) até o merge de A."
---
# Bloco C — Fechamento via Trilho B (self-contract fecha, não só descobre)

Contexto: o Trilho A (API Parceiro) está **travado** (`calculate_simulation` → 400 "Proposta não
pertence ao Bevi Consórcio", productId desvinculado — pendência AGX, confirmado ao vivo 28/06).
Decisão do Kairo: **fechar via Trilho B** (self-contract `/unauth/`, sem productId). O B descobre
E fecha na MESMA proposta. **Reverte parte do ADR** `2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`
(que descartara o fechamento-via-B por concorrência) — premissa mudou: A travado sem prazo +
piloto single-user. Atualizar o ADR é item do bloco.

Fluxo de fechamento no B (cookbook §7 + discovery §4): create-proposal + segmento + simulation
JÁ acontecem na descoberta → **escolher oferta** = `update-step/.../simulation` com `finished:true`
+ a oferta → KYC steps (opcionais) → `waitingForUniqueCode` → inserção assíncrona → `proposalNumber`.
B NÃO gera link uselink.me: insere direto → passo 5 vira "proposta enviada à administradora, nº X".

Ordem interna:
1. **FIX-88** — `BeviSelfContractProposalGateway implements ProposalGateway` + estende o self-contract-client (chooseOffer, KYC steps, waitingForUniqueCode, getStatus).
2. **FIX-89** — env-selector `PROPOSAL_GATEWAY=selfcontract` + fulfillment reusa a proposta de descoberta + dispara o despacho de documento (`dispatchClientDocument(..., 'bevi_b')` do bloco-a, via stub).

PENDENTE-KAIRO: validar ao vivo o step de upload de doc do self-contract (portal CONEXIA).
