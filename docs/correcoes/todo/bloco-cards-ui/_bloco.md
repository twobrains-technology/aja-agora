---
bloco: bloco-cards-ui
branch: feat/cards-consorcio-ui
workspace: feat-cards-consorcio-ui
onda: 1
depends_on: []
paralelo_com: [bloco-motor-calculo, bloco-jornada-conversa]
itens: [FIX-228, FIX-229, FIX-230, FIX-231, FIX-232]
escopo_arquivos:
  - src/lib/chat/types.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/schemas.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/components/chat/artifacts/artifact-renderer.tsx
  - src/components/chat/artifacts/embedded-bid.tsx
  - src/components/chat/artifacts/two-paths.tsx
  - src/components/chat/artifacts/scarcity.tsx
  - src/components/chat/artifacts/group-card.tsx
  - src/components/chat/artifacts/comparison-table.tsx
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/real-offer.tsx
  - src/components/chat/artifacts/contemplation-dial.tsx
conflitos_esperados:
  - "nível 3 (contrato) com bloco-motor-calculo: o motor REMOVE `likelihood` de ContemplationDialResult. Este bloco remove o CONSUMO de likelihood em contemplation-dial.tsx. Merge recomendado: motor ANTES de cards."
  - "nível 3 (contrato) com bloco-jornada-conversa: o gate `lance` (3ª saída, jornada) invoca a tool `present_two_paths` criada aqui. Nomes de tool são strings — implemente contra o nome; a ligação do gate é do bloco-jornada."
---

# Bloco cards-ui — a camada de cards (PR5+PR6+PR7 novos, PR1-guard+PR2-ajuste+PR10)

Três cards novos (embutido, dois-caminhos, escassez) + ajustes nos existentes. Todos
tocam os MESMOS 6 arquivos de plumbing (types/tools/schemas/runner/tool-policy/renderer)
— por isso vivem no MESMO bloco (evita 3 blocos brigando nos mesmos arquivos).

Como um card nasce (checklist, `docs/02-cards-novos.md`): (1) payload em `chat/types.ts`
no union `ArtifactByType`; (2) tool `present_*` em `tools/ai-sdk.ts` + schema Zod em
`tools/schemas.ts`; (3) coerção server-side no `runner.ts:427-458` (números vêm da oferta
REAL, a LLM só escolhe o grupo); (4) componente + case no `artifact-renderer.tsx:47`;
(5) registrar na fase certa em `tool-policy.ts` (`allowedTools`).

## Ordem interna
FIX-231 (guard taxaContemplacao + ajustes — toca cards existentes) → FIX-228 (embutido)
→ FIX-229 (dois caminhos) → FIX-230 (escassez placebo) → FIX-232 (proposta co-branded).

Spec: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/02-cards-novos.md`
+ `docs/04-copy-fluxos.md` (copy exata) + `docs/05-compliance-e-dados.md` (o que nunca exibir).
