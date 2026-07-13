---
bloco: bloco-r10-1-topicpicker-clarify
branch: fix/r10-1-topicpicker-clarify
workspace: fix-r10-1-topicpicker-clarify
onda: 1
depends_on: []
paralelo_com: [bloco-r10-1-funil-reveal, bloco-r10-1-sanitizer-invariantes, bloco-r10-1-web-reengage]
itens: [FIX-300, FIX-301]
escopo_arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/components/chat/artifacts/topic-picker.tsx
  - src/lib/agent/orchestrator/turn-analyzer.ts
  - src/lib/chat/types.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/gate-questions.ts
conflitos_esperados: "FIX-301 (transição clarify) pode tocar orchestrator/index.ts na mesma região que bloco-r10-1-funil-reveal mexe. Este bloco MERGEIA DEPOIS do funil-reveal (nível 2/3 — resolva o conflito puxando a versão já integrada e reaplicando o comportamento clarify por cima)."
---
# Bloco r10-1 — topicpicker-clarify (FIX-300 + FIX-301)

FIX-300 (schema/tool-policy/artifact-guard — arquivos isolados) e FIX-301 (nova transição
`clarify` — toca `turn-analyzer.ts`/`orchestrator/index.ts`, zona compartilhada com o bloco
funil-reveal) andam juntos porque resolvem o MESMO problema de produto (P6+P7 do estudo: card
alucinado + usuário confuso).

## Ordem interna
1. **FIX-300 primeiro** (isolado, sem risco de conflito).
2. **FIX-301 depois** (toca zona compartilhada — implemente de forma que minimize a superfície de
   edição em `orchestrator/index.ts`: prefira um comportamento condicional simples ao invés de
   reestruturar a máquina de estados).

## Correção de dependência (crítico da rodada)
A intent `confused` NÃO EXISTE hoje (`turn-analyzer`/type `UserIntent` só tem
`expressing_doubt`/`off_topic`). Adicione-a OU mapeie a partir de `expressing_doubt` + existência
de gate pendente — decisão de implementação sua, documente qual escolheu e por quê.

## Catálogo canônico de chips (usar o do mockup, não inventar)
"o que é lance?", "como funciona o sorteio?", "e quando eu for contemplado(a)?", "por que as
cartas variam?" — ver `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (array `F1`,
seção `badges`).

## Referências obrigatórias
- `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P6, P7).
- Print do card alucinado confirmado contra `topic-picker.tsx` (ver fix-card FIX-300).
