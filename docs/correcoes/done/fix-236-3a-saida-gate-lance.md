---
id: FIX-236
titulo: "3ª saída 'só a parcela' completar — gate lance precisa APARECER com o chip"
status: done
bloco: bloco-r2-funil-cards
arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/orchestrator/analyze.test.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #1)
commit: PENDENTE (preenchido no commit real)
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D3.1, gap #1)
3ª saída "só a parcela" quebrada em TODOS os caminhos → Fluxo B morre sem proposta.
Chip "Só a parcela, sem lance" (adapter.ts) + union `so_parcela` (actions.ts) + handler
que roteia so_parcela → `buildLanceSoParcelaDirective` (route.ts) já estavam na base
(commit e5882cb6). Faltava: o gate `lance` estava sendo PULADO no funil (ia direto pra
`lance-embutido`), então o chip nunca aparecia pro cliente escolher.

## Causa raiz (achada nesta rodada)
`hasLance` era capturado de QUALQUER turno de texto livre em `analyze.ts` (linha 161,
sem checar se o gate `lance` estava de fato ativo). Uma frase respondendo o gate
`timeframe` — "Queria rápido, mas não tenho grana agora" — contém o sinal lexical "não
tenho" e o analyzer LLM extraía `hasLance="no"` cedo demais, ANTES do gate `lance` ter
sido mostrado. Duplo efeito, os dois sintomas do veredito:
1. `nextGate` pulava o gate `lance` direto pra `lance-embutido` (o chip nunca aparecia).
2. Quando o usuário DEPOIS dizia a recusa explícita ("não quero comprometer nada além
   da parcela" → `so_parcela`), o guard `!q.hasLance` já estava satisfeito por um "no"
   falso e a recusa real nunca sobrescrevia — a MESMA bolha de educação de embutido
   repetia (Fable viu 3× seguidas no Fluxo B).

## Correção
`analyzeAndMerge` agora tira um snapshot do gate REALMENTE ativo (`nextGate(meta, ...)`)
ANTES de qualquer merge do turno, e só aceita `hasLance` quando esse snapshot é
exatamente `"lance"`. A conversa de lance só existe PÓS-reveal (FIX-215) — restringir a
captura ao gate ativo não perde nenhum caminho legítimo (o "lead que diz tudo numa
frase" continua funcionando pra credit/prazo/desire, que não sofrem do mesmo
falso-positivo lexical).

Achado extra corrigido no caminho: `tests/regression/agent-trajectory.test.ts` (FIX-118)
tinha uma janela de slice fixa (1800 chars) no bloco do gate `lance` em `route.ts` que
o próprio bloco `so_parcela` (commit e5882cb6) já havia estourado — teste pré-existente
quebrado, corrigido pra janela dinâmica até o próximo `action.gate ===`.

## Regressão (TDD + suíte)
- `src/lib/agent/orchestrator/analyze.test.ts`: 3 testes novos —
  (1) resposta ao gate `timeframe` com sinal lexical de lance NÃO captura `hasLance`,
      gate `lance` continua sendo o próximo;
  (2) resposta ao gate `lance` (texto livre, `so_parcela`) captura normalmente e roteia
      pra `decision` (two_paths);
  (3) resposta ao gate `lance` com `"yes"` captura normalmente (caminho feliz
      preservado).
- `pnpm test:unit`: 2986/2986 verde (rodado em container do workspace com Postgres real
  via `.claude/skills/local-dev`).
- E2E: pendente validação por API contra a app rodando (ver resumo final do bloco).
