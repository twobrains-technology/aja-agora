---
bloco: bloco-jornada-conversa
branch: feat/jornada-conversa-consorcio
workspace: feat-jornada-conversa-consorcio
onda: 1
depends_on: []
paralelo_com: [bloco-motor-calculo, bloco-cards-ui]
itens: [FIX-233, FIX-234, FIX-235]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-state.test.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/hard-rules.ts
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/whatsapp/proxy.ts
  - docs/jornada/jornada-canonica.md
conflitos_esperados:
  - "nível 3 (contrato) com bloco-cards-ui: o gate `lance` (3ª saída) invoca a tool `present_two_paths` (criada no bloco-cards). Referencie pelo NOME da tool (string); se ela ainda não existir no toolset no momento do merge, o allowlist/directive tolera (é filtro). Ajuste de minutos pós-merge."
---

# Bloco jornada-conversa — funil, voz e fecho (PR3 + PR1-sanitizer + PR4 + PR9)

Reordena os gates, reintroduz o gate desire e o timeframe, ajusta tom/cadência, os
guards do sanitizer e o fecho pro WhatsApp. É o dono ÚNICO do `system-prompt.ts` nesta
onda (por isso funil+voz+fecho estão juntos — evita 2 blocos brigando no prompt).

## Ordem interna
FIX-233 (gates + slots — o esqueleto) → FIX-234 (sanitizer + voz) → FIX-235 (fecho WhatsApp).

## DECISÕES DE PRODUTO (ADR docs/decisoes/blocos/2026-07-09-agente-vendas-consorcio.md)
- **timeframe REINTRODUZIDO** (reverte FIX-103) — depois da recomendação, ponte pro simulador.
- **experience MOVIDO** pra depois de `search`.
- Atualizar `docs/jornada/jornada-canonica.md` (fonte soberana) refletindo as duas mudanças.

Spec: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/01-gates-e-ordem.md`
+ `docs/04-copy-fluxos.md` (cadência, tom, os 2 fluxos, o FECHO) + `docs/05-compliance-e-dados.md`.
