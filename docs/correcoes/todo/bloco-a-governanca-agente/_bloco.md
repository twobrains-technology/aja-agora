---
bloco: bloco-a-governanca-agente
branch: feat/governanca-agente
workspace: feat-governanca-agente
onda: 1
depends_on: []
paralelo_com: [bloco-b-intent-ver-mais, bloco-c-frontend-e-flaky]
itens: [FIX-181, FIX-180, FIX-182]
escopo_arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/tools/shown-groups.ts
  - src/lib/agent/orchestrator/artifact-guard.ts
conflitos_esperados:
  - "runner.ts é tocado pelos 3 itens deste bloco (por isso estão JUNTOS — edição sequencial, sem merge). Fora do bloco, runner.ts NÃO é tocado por bloco-b nem bloco-c (disjunto). Nível 1 entre blocos."
---
# Bloco A — Governança determinística do agente (o NÚCLEO / a cura)

Pacote de UM dev sênior: endurecer a fase pós-busca da jornada com allowlist
`estado → ação → precondição` usando primitivos NATIVOS do AI SDK (`prepareStep`,
`onStepFinish`, `experimental_repairToolCall`), generalizando o FIX-179 e aposentando
a blocklist reativa do `artifact-guard`. É a resposta arquitetural pra "a IA saiu do
trilho" (jornada da Mirella).

## Por que os 3 juntos
Os três tocam `runner.ts` (wiring do streamText) — juntos = edição sequencial, zero
merge conflict. E são o mesmo tema: governar corretamente o que o agente pode fazer.

## Ordem interna
1. **FIX-181** (observabilidade `onStepFinish`) PRIMEIRO — é fundação barata: com o log de
   tool I/O ligado, todo o resto do bloco fica depurável.
2. **FIX-180** (allowlist estado→ação→precondição) — o coração. **DESIGN real**: escreva a
   spec/ADR ANTES de codar, pesquisando os primitivos na doc oficial (context7) conforme a
   regra do tripé. FIX-179 é o primeiro tijolo (não regredir).
3. **FIX-182** (texto colado multi-tool) — pequeno, no fim; encaixa no wiring já mexido.

## Fundamento (leia antes)
- `~/.claude/reference/arquitetura-agentes-ia.md` (as 6 leis + a regra do tripé de pesquisa).
- Card-âncora da doença: `docs/correcoes/todo/bloco-b-intent-ver-mais/fix-183-*.md` (a análise
  completa do incidente da Mirella está lá).
