---
bloco: bloco-a-funil-coleta-ordem
branch: fix/funil-coleta-ordem
workspace: fix-funil-coleta-ordem
onda: 1
depends_on: []
paralelo_com: [bloco-b-simulador-recomendacao, bloco-c-landing-copy-ui]
itens: [FIX-52, FIX-53, FIX-58]
escopo_arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/lib/leads/contact-capture.ts
  - src/lib/leads/phone.ts
  - docs/jornada/jornada-canonica.md
  - docs/jornada/proposta-simulador.md
  - docs/jornada/CONTEXT.md
  - tests/regression/agent-trajectory.test.ts
conflitos_esperados:
  - "src/lib/agent/tools/ai-sdk.ts — bloco-b toca tools de simulação/recomendação (regiões diferentes). Nível 2."
  - "tests/regression/agent-trajectory.test.ts — append-only de cassettes com bloco-b. Nível 2."
ordem_merge: "Mergear A ANTES de B (A reordena o funil e o system-prompt; B rebase depois resolve o overlap mecânico em ai-sdk.ts/agent-trajectory)."
---
# Bloco A — Comportamento e ordem do agente no funil

Reúne tudo que toca o **fluxo/system-prompt/tools de coleta** do agente — mesma
região de código, alto acoplamento, tem que ser sequencial num dev só:

- **FIX-52** — card de dados não dispara com CPF+telefone juntos; remover fallback
  proibido ("atualiza a página") e meta-narrativa do mecanismo. (bug crítico, image4)
- **FIX-53** — reordenar: dados antes do valor; parar de re-pedir o valor.
- **FIX-58** — reposicionar o simulador de contemplação para ANTES da indicação do
  melhor grupo + confirmar premissas antes de avançar (decisão do Bernardo). Aqui só
  muda a ORDEM no fluxo (system-prompt/orchestrator) e a doc da jornada — NÃO redesenha
  o simulador (componente é do Bloco B; ver limite de escopo no fix-58).

Ordem interna: FIX-53 (reordena o funil) → FIX-52 (conserta a coleta de dados dentro
da nova ordem) → FIX-58 (reposiciona simulador + confirmação). Os três convergem no
`system-prompt.ts` — fazer sequencial evita reescrever a mesma seção 3 vezes.

Overlap com Bloco B é nível 2 (regiões distintas de `ai-sdk.ts` e cassettes
append-only) — paralelo mesmo assim; mergear A primeiro.
