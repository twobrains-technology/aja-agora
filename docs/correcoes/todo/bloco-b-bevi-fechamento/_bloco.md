---
bloco: bloco-b-bevi-fechamento
branch: fix/bevi-fechamento-propostaid
workspace: fix-bevi-fechamento-propostaid
onda: 1
depends_on: []
paralelo_com: [bloco-a-agente-passos-obrigatorios, bloco-c-estudo-remocao-letta]
itens: [FIX-79]
escopo_arquivos:
  - src/lib/adapters/bevi/bevi-api-adapter.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/adapters/bevi/bevi-errors.ts
  - tests/integration/  # integration test do adapter Bevi (caminho exato a critério do executor)
---
# Bloco B — Fechamento Bevi: rejeição do propostaId

Bug ÚNICO mas crítico (trava o passo 5 da jornada, o core value):

- **FIX-79** — ao fechar o contrato, a Bevi rejeita o `propostaId` com 400
  *"Proposta não pertence ao Bevi Consórcio."*. Cadeia confirmada no código:
  `createProposal` envia `productId` explícito (`BEVI_PRODUCT_ID` default hardcoded
  `6986245b3518ceb00e7844da`) mas `simulate` NÃO envia `productId` — a Bevi resolve a
  propriedade pela conta do `BEVI_API_TOKEN`. **HIPÓTESE forte (não cravável do nosso
  lado):** o `BEVI_PRODUCT_ID` hardcoded não corresponde ao product "Bevi Consórcio" da
  conta do token → a proposta nasce sob product órfão e o `simulate` recusa.

## Natureza e regressão — bug de INTEGRAÇÃO, NÃO de agente

Este é bug de **integração via adapter Bevi**, não de comportamento do agente. Logo a
regressão é **integration test do contrato do adapter** (`startContract` → `simulate`
sem 400 de ownership; reproduzir `errors:[{ field:'propostaId' }]` e garantir o fallback
gracioso), **NÃO cassette** de `agent-trajectory.test.ts`. (CLAUDE.md → "Quando NÃO
precisa adicionar cassette": código não-agêntico puro.)

## Ação externa PENDENTE-KAIRO (Bevi/AGX)

A correção definitiva depende de **dado externo**: confirmar com a Bevi/AGX qual o
`productId` correto do produto "Bevi Consórcio" da loja-piloto desse `BEVI_API_TOKEN` e
setar `BEVI_PRODUCT_ID` explícito no env. O executor deve: (a) deixar o código pronto pra
enviar `productId` também no `simulate` (e/ou parametrizar limpo o `BEVI_PRODUCT_ID`);
(b) cobrir com o integration test; (c) deixar a dependência externa marcada como
**PENDENTE-KAIRO** no `.done/` (não inventar o productId — é dado da Bevi).

Disjunto dos Blocos A (orchestrator/prompt) e C (estudo/ADR) — nível 1.
