---
id: FIX-79
titulo: "Fechamento trava: Bevi rejeita o propostaId ('Proposta não pertence ao Bevi Consórcio') — provável BEVI_PRODUCT_ID hardcoded fora da conta do token"
status: todo
bloco: bloco-b-bevi-fechamento
arquivos:
  - src/lib/adapters/bevi/bevi-api-adapter.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/adapters/bevi/bevi-errors.ts
rodada: "2026-06-25 sessão de QA manual Kairo — jornada chat/fechamento"
---

# Bug (INTEGRAÇÃO Bevi — não é bug de agente) — Fechamento de contrato trava: Bevi rejeita o `propostaId` ("Proposta não pertence ao Bevi Consórcio")

- **Natureza:** bug de **integração com a Bevi** (via adapter), NÃO comportamento do agente. Provável mismatch de `productId`/conta entre criar e simular a proposta.
- **Data:** 2026-06-25 (teste manual do Kairo — chat web, conv `a9c5effa`, administradora TRADIÇÃO)
- **Severidade (HIPÓTESE forte):** ALTA — **trava o FECHAMENTO do contrato** (passo 5 da jornada, o core value). Confirmar na hora de corrigir.

## Cenário
- **Rota/tela:** chat web. Usuário escolhe a oferta (administradora TRADIÇÃO) e clica "Continuar com segurança" / "Enviei meus dados pra contratar".
- **Sintoma:** UX mostra fallback gracioso (print do Kairo): *"Tive um problema ao falar com a administradora agora. Pode tentar de novo em instantes?"* — **fechamento não acontece**.

## Esperado × Atual
- **Esperado:** proposta recém-criada é aceita pelo `simulate` da Bevi e o fechamento prossegue.
- **Atual:** a Bevi rejeita o `propostaId` com 400; o app cai no fallback gracioso e o contrato não fecha.

## Evidência (array `errors` completo da Bevi — code 400)
De `src/lib/adapters/bevi/bevi-errors.ts:104`:
```
errors: [{ field: 'propostaId', message: 'Proposta não pertence ao Bevi Consórcio.' }]
```

## Causa-raiz (cadeia CONFIRMADA no código)
- `startContract` (`src/lib/bevi/fulfillment.ts:86`) → `gateway.simulate({ proposalId })` → `BeviApiAdapter.simulate` (`src/lib/adapters/bevi/bevi-api-adapter.ts:140`, service `calculate_simulation_bevi_consorcio`) manda `propostaId` (linha 143).
- conv `a9c5effa` tem **0 linhas em `bevi_proposals`** → NÃO foi reuso idempotente; foi `createProposal` **fresco** (`fulfillment.ts:75-83` → `insert_proposal_bevi_consorcio`, `bevi-api-adapter.ts:116-128`); a linha **não persistiu** porque o erro estourou no `simulate` (linha 86) **antes** do snapshot (linha 98+).
- **SMOKING GUN:** `createProposal` envia `productId` **explícito** (`bevi-api-adapter.ts:120`, `BEVI_PRODUCT_ID=6986245b3518ceb00e7844da`) mas `simulate` **NÃO** envia `productId` (linhas 142-158) — a Bevi resolve a propriedade da proposta pela **conta do `BEVI_API_TOKEN`**. Proposta recém-criada recusada como "não pertence" indica que **nasceu sob product/conta diferente** do que o token resolve como "Bevi Consórcio".
- **NÃO é dado da Maria mal-formatado** (CPF/celular/LGPD não reclamados, só `propostaId`). **NÃO é específico da TRADIÇÃO** (o erro é na identidade da proposta, etapa anterior à administradora; o `simulate` nem manda administradora).

## HIPÓTESE de causa-raiz (NÃO verificável só do nosso lado — marcar como hipótese, não fato)
`BEVI_PRODUCT_ID` (`6986245b3518ceb00e7844da`) é o **DEFAULT HARDCODED** em `bevi-api-adapter.ts:60` (não setado explícito no env) e pode **não corresponder** ao product "Bevi Consórcio" da conta do `BEVI_API_TOKEN` (`rp3rm...`, base `api.uxvision.tech`). Proposta nasce sob product órfão → `simulate` recusa.

## Ações (PENDENTE-KAIRO / externo — precisam da Bevi/AGX)
1. **Nº1 acionável:** verificar com Bevi/AGX qual o `productId` correto do produto "Bevi Consórcio" da loja-piloto desse `BEVI_API_TOKEN` e **setar `BEVI_PRODUCT_ID` explícito no env**.
2. **Nº2:** investigar com a Bevi se `ignoreOngoingProposals:true` (`fulfillment.ts:82`) realmente solta o CPF de proposta ongoing em **outro** product.

## Tratamento (quando for corrigir — NÃO agora) — bug de integração via adapter → INTEGRATION TEST
- **NÃO** é cassette de agente. É **integration test do contrato do adapter Bevi**: `startContract` com proposta recém-criada deve `simulate` **sem** 400 de ownership; mockar o gateway pra reproduzir `errors:[{ field:'propostaId' }]` e garantir o fallback gracioso.
- TDD strict: teste FALHA primeiro (reproduz o 400 de ownership) → fix (setar `productId` no `simulate` e/ou `BEVI_PRODUCT_ID` correto no env) → verde.
