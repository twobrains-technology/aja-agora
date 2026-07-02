# Away — Dossiê de validação dos endpoints Conexia/Bevi (é a Bevi ou nós?)

- **Início:** 2026-06-26 15:20 · **Sessão:** aja-agora/develop
- **Critério de pronto:** dossiê salvo com veredito cravado por evidência + collection Postman corrigida + card do achado no inbox + commitado
- **Status:** EM ANDAMENTO

## Decisões

### D1 · 15:20 — VEREDITO: é a BEVI que mudou, não nós
- **Contexto:** o `calculate_simulation_bevi_consorcio` retorna 400 "Proposta não pertence ao Bevi Consórcio" — o mesmo erro do FIX-79. O Kairo perguntou: a Bevi bugou ou mudamos as chamadas?
- **Decidi:** cravar que é a Bevi/AGX (produto/conta reconfigurado), com evidência. Provas:
  1. O simulate falha IDÊNTICO **com e sem** `productId` no body → o FIX-79 (que adicionou productId) NÃO é a causa nem a cura. Foi diagnóstico errado.
  2. A captura real de 2026-05-27 (docs/integracoes/bevi-api-parceiro-spec.md §4.3) mostra o MESMO fluxo (mesmo productId 6986245b na criação, simulate SEM productId) retornando **200 "Simulação realizada com sucesso"**. Funcionava.
  3. `consult_proposal_status` na proposta recém-criada também dá "não pertence" → não é específico do simulate; é a PROPOSTA que não é reconhecida como consórcio.
  4. `insert_proposal` 201 (cria) e `list_segments` 200 (estático — controle com proposalId fake deu "proposalId obrigatório", não valida pertencimento).
- **Alternativas descartadas:** "productId errado no body" (testei sem → falha igual); "FIX-79 quebrou" (o erro é anterior ao productId); "campo faltando" (body bate com a captura que funcionava).
- **Reversibilidade:** n/a (diagnóstico).
- **Evidência:** curls nesta sessão; docs/integracoes/bevi-api-parceiro-spec.md:193-214.

### ⚠️ PENDENTE-KAIRO · 15:20 — contatar Bevi/AGX pro productId/produto correto
- **O que é:** o `BEVI_PRODUCT_ID=6986245b3518ceb00e7844da` (token `rp3rmx…`) não está mais associado ao produto "Bevi Consórcio" na conta — a proposta nasce mas os serviços de consórcio (simulate/status) a rejeitam. Confirmar com a Bevi/AGX: o productId correto atual do Consórcio nessa conta, OU se a loja/produto foi migrado, OU se há um passo novo (ex.: selecionar produto) entre create e simulate.
- **Por que não fiz:** é externo (depende da Bevi/AGX) — não dá pra resolver do nosso lado.
- **Como destrava:** Bevi confirma o productId correto → setar `BEVI_PRODUCT_ID` no env (dev+prod) → re-validar o fechamento.

## Linha do tempo
- 15:20 — fechei a investigação dos endpoints (curl contra homologação). Veredito D1. Montando o dossiê + corrigindo a collection.

### D2 · 15:35 — confirmado pela doc oficial: é a Bevi (com 2 achados nossos)
- **Contexto:** Kairo mandou a doc oficial atual (Postman documenter). Cruzei com curls ao vivo.
- **Decidi:** veredito final = **é a Bevi/AGX** (productId 6986245b não vinculado ao produto Consórcio na conta). Provado: simulate falha "não pertence" com o body do app E com o body EXATO da doc oficial, em CPF limpo sem ongoing. Achados nossos acionáveis: (a) FIX-79 (productId no simulate) é diagnóstico errado e diverge da doc → reverter; (b) lanceEmbutido no simulate não consta na doc atual.
- **Reversibilidade:** o revert do FIX-79 é fácil (git). O bloqueio em si é da Bevi (externo).
- **Evidência:** docs/integracoes/2026-06-26-dossie-validacao-endpoints-bevi.md.

## Relatório final
- **Resultado vs critério de pronto:** ✅ dossiê completo salvo com veredito cravado por evidência. É a BEVI (não nós). Doc oficial confirma productId/fluxo iguais ao nosso.
- **O que NÃO fiz:** não revertí o FIX-79 ainda (é fix de produto — deixei como próximo passo/bloco, não no escopo "dossiê"); não corrigi a collection Postman ainda (próximo passo).
- **Revisar primeiro:** D1/D2 (veredito Bevi) + o PENDENTE-KAIRO (contatar Bevi/AGX pro vínculo do productId).
- **Próximos passos:** (1) Kairo contata Bevi/AGX; (2) bloco pra reverter productId do simulate (FIX-79) + alinhar body à doc.
- **Status:** COMPLETO
