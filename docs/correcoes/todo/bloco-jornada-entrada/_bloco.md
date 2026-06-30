---
bloco: bloco-jornada-entrada
branch: feat/jornada-entrada-conversacional
workspace: feat-jornada-entrada-conversacional
onda: 1
depends_on: []
paralelo_com: [bloco-web-valor-agulha, bloco-whatsapp-apresentacao]
itens: [FIX-103, FIX-104, FIX-105, FIX-106]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/tools/ai-sdk.ts
---
# Bloco jornada-entrada — comportamento do agente na entrada + simulador conversacional

Coração da revisão da jornada de entrada (decisões do Kairo 2026-06-28, ver
`docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md`).
Concentra TODO o comportamento do agente: o que ele pergunta na qualificação,
como coleta o valor, e como conduz o simulador de contemplação.

Os outros 2 blocos consomem o CONTRATO que este define (o agente para de emitir
`value_picker` na entrada e remove o gate de prazo; passa a coletar valor por
conversa e a conduzir o simulador em loop) — **nível 3, via stub `TODO(bloco-jornada-entrada)`**.

Ordem interna (mesma máquina qualify-state/config + system-prompt, por isso juntos):
FIX-103 (remove prazo) → FIX-104 (valor conversacional) → FIX-105 (qualificação
híbrida) → FIX-106 (simulador conversacional).
