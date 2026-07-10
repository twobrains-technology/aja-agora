---
id: FIX-255
titulo: "Copy de identidade por canal + acento nos nomes da Bevi + creditAdjustmentNotice coerente"
status: done
bloco: bloco-r4-cards-polish
arquivos:
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/adapters/bevi/offer-mapper.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/adapters/bevi/bevi-self-contract-proposal-gateway.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-D/N-E/N-G P2/P3)
executado_em: "2026-07-10"
nota: |
  N-E na verdade vivia em ai-sdk.ts (executeSimulateQuota), não em
  directives.ts como o card original apontava — causa-raiz confirmada por
  leitura: bevi-self-contract-adapter.ts:simulateQuota IGNORA
  params.creditValue por completo (retorna sempre o nominal da oferta), então
  a mensagem antiga "ajustada de NOMINAL para SOLICITADO" mentia sobre o que
  foi de fato simulado. N-G corrigido na fonte única (offer-mapper.ts,
  normalizeAdministradoraName) + replicado nos 2 outros pontos que
  duplicavam `bankLabel ?? bank` cru (bevi-self-contract-adapter.ts
  getGroupDetails/getRates, bevi-self-contract-proposal-gateway.ts
  toPartnerOffer — este último é a fonte EXATA do "Confirmei com a ITAU" do
  veredito, via closing-presentation.ts).
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
