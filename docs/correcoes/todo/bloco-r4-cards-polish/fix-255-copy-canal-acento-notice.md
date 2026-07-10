---
id: FIX-255
titulo: "Copy de identidade por canal + acento nos nomes da Bevi + creditAdjustmentNotice coerente"
status: todo
bloco: bloco-r4-cards-polish
arquivos: [src/lib/agent/orchestrator/gate-questions.ts, src/lib/adapters/bevi/offer-mapper.ts, src/lib/agent/orchestrator/directives.ts]
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-D/N-E/N-G P2/P3)
---
## Gaps (veredito FINAL §N-D, §N-E, §N-G)
- **N-D**: web mostra "Seu celular eu já pego aqui do WhatsApp" com o form de celular na tela
  (`gate-questions.ts:99`, copy única pros 2 canais). Copy por canal.
- **N-E**: `creditAdjustmentNotice` do simulate_quota semanticamente INVERTIDA — diz "ajustada
  de 161.258 (nominal) PARA 100.000" mas o payload devolve os números do NOMINAL. Corrigir pra
  o payload/narração baterem (mostrar o solicitado, não o nominal como "correto").
- **N-G**: "Confirmei com a ITAU/TRADICAO" — nome cru da Bevi sem acento na copy ao usuário
  (inviolável PT). Normalizar acentuação dos nomes de administradora exibidos.
## Regressão
- web: copy de identidade NÃO diz "pego do WhatsApp".
- nomes de administradora com acento correto na fala.
- creditAdjustmentNotice coerente com o payload.
