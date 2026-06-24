---
bloco: bloco-b-simulador-recomendacao
branch: fix/simulador-recomendacao
workspace: fix-simulador-recomendacao
onda: 1
depends_on: []
paralelo_com: [bloco-a-funil-coleta-ordem, bloco-c-landing-copy-ui]
itens: [FIX-54, FIX-55, FIX-56, FIX-57]
escopo_arquivos:
  - src/lib/agent/qualify-config.ts
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/plan-estimate-picker.tsx
  - src/lib/agent/recommendation.ts
  - src/components/chat/artifacts/simulation-result.tsx
  - src/components/chat/artifacts/decision-prompt.tsx
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "tests/regression/agent-trajectory.test.ts — append-only de cassettes com bloco-a. Nível 2."
ordem_merge: "Mergear DEPOIS do Bloco A (rebase resolve o append-only do agent-trajectory; B não toca system-prompt.ts nem ai-sdk.ts para minimizar conflito)."
---
# Bloco B — Simulador e recomendação de grupos

Mecânica do simulador e da recomendação — arquivos de config/lógica/artifacts
distintos do Bloco A:

- **FIX-54** — teto de carro em 300k (CREDIT_BOUNDS) → elevar.
- **FIX-55** — simulador não aceita números quebrados (step 10k) → reduzir step e/ou
  input livre.
- **FIX-56** — recomendação mostra 2 grupos da mesma administradora → dedup/diversificar
  em `rankGroups`.
- **FIX-57** — fim inconclusivo: CTA claro de próximo passo + microcopy meses×lance
  (NÃO mexer no cálculo de `contemplation-dial.ts` — a mecânica está correta).

Ordem interna: FIX-54 → FIX-55 (ambos em `qualify-config.ts` + pickers — mesma região,
sequencial) → FIX-56 (`recommendation.ts`) → FIX-57 (`simulation-result.tsx`).

**Limite com Bloco A:** NÃO tocar `system-prompt.ts`, `ai-sdk.ts` nem reposicionar o
simulador no fluxo (isso é FIX-58, do Bloco A). Aqui é só a mecânica interna dos
componentes/lógica. Único overlap esperado: cassettes append-only em
`agent-trajectory.test.ts`.
