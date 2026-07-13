---
bloco: bloco-r10-3-timeframe-stuck
branch: fix/r10-3-timeframe-stuck
workspace: fix-r10-3-timeframe-stuck
onda: 3
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-2-bakeoff-regua]
paralelo_com: []
itens: [FIX-305]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/orchestrator/gate-questions.ts
conflitos_esperados: "nenhum — onda 1+2 já integradas e pushadas na base, este bloco forka delas sozinho (único bloco da onda 3)."
---
# Bloco r10-3 — timeframe-stuck (FIX-305)

Único bloco da onda 3 — achado DEPOIS da onda 2 (não fazia parte da spec original), via
verificação real do bakeoff pós-onda-1 (FIX-304): o score do Qwen PIOROU porque o funil pós-reveal
trava indefinidamente no gate `timeframe` sob modelo com extração fraca de dados em texto livre.

## Decisão já resolvida (não re-perguntar)
Escape via default após N tentativas (~2-3), decidido pelo Kairo via `AskUserQuestion`
(2026-07-13): assume um prazo padrão razoável (ex.: 12 meses) e segue o funil, nunca trava.

## Referências obrigatórias
- `.bakeoff/qwen-jornada-pos-r10-onda1.log` (evidência real do trave — path só existe no worktree
  do bloco `fix/r10-2-bakeoff-regua`, já mergeado; se não estiver disponível neste worktree, peça
  pro Kairo ou reproduza rodando `pnpm vitest run tests/eval/jornada-aja-agora.eval.test.ts` com
  `AI_MODEL` apontando pro Qwen).
- `docs/correcoes/done/fix-304-bakeoff-regua-admissao.md` (análise completa do achado).
- `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção "Onda 2 — o bakeoff PIOROU").
