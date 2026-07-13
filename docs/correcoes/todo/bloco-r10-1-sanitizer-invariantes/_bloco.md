---
bloco: bloco-r10-1-sanitizer-invariantes
branch: fix/r10-1-sanitizer-invariantes
workspace: fix-r10-1-sanitizer-invariantes
onda: 1
depends_on: []
paralelo_com: [bloco-r10-1-funil-reveal, bloco-r10-1-topicpicker-clarify, bloco-r10-1-web-reengage]
itens: [FIX-298, FIX-299]
escopo_arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/turn-analyzer.ts
conflitos_esperados: "nenhum bloco paralelo mexe em sanitizer.ts/turn-analyzer.ts nesta onda."
---
# Bloco r10-1 — sanitizer-invariantes (FIX-298 + FIX-299)

Agrupados por mesma zona de arquivo (`sanitizer.ts`). Dois invariantes independentes entre si —
pode implementar em qualquer ordem, mas ambos tocam o `EphemeralTextFilter`.

## Cuidado de precisão (crítico da rodada — não errar isso)
- FIX-298 é **"1 FRASE interrogativa por balão"**, NÃO "1 pedido por balão". O próprio mockup-alvo
  tem uma frase válida com dois pedidos e um `?` só ("Que carro você tem em mente, e quanto custa
  mais ou menos?"). Não corte isso.

## Referências obrigatórias
- `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P4, P9, P10).
- `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (mockup — confira a frase composta
  do Mario, array `F2`, pra não quebrar no teste positivo).
