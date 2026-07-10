---
bloco: bloco-r2-funil-cards
branch: fix/r2-funil-cards-consorcio
workspace: fix-r2-funil-cards-consorcio
onda: 1
depends_on: []
paralelo_com: [bloco-r2-valor-compliance]
itens: [FIX-236, FIX-237, FIX-238, FIX-239]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/web/adapter.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/tools/ai-sdk.ts
conflitos_esperados:
  - "nível 2 com bloco-r2-valor-compliance em route.ts (regiões diferentes: funil vs contract-submit guard). Ordem de merge: funil-cards primeiro."
---

# Bloco r2 funil-cards — corrige os gaps de FUNIL do veredito Fable (P0/P1)

Rodada 2 do loop-de-goal. Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r1.md`
(nota 3/10, gaps com arquivo:linha, esperado×atual). Corrige os 4 gaps de funil/cards.

## Ordem interna
FIX-236 (3ª saída — completar) → FIX-237 (cards órfãos) → FIX-238 (desire) → FIX-239 (decision).

Cada card aponta o gap do veredito. TDD strict — o funil TEM testes de ordem
(`qualify-state.*.test.ts`); teste que falha antes, corrige, passa. Valide também via a
condução E2E por API (`scratchpad/conduz-jornada.py` no host, ou replique) — o card DEVE
aparecer no artifact stream, não só existir.
