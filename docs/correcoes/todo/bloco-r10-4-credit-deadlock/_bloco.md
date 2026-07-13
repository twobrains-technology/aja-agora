---
bloco: bloco-r10-4-credit-deadlock
branch: fix/r10-4-credit-deadlock
workspace: fix-r10-4-credit-deadlock
onda: 4
depends_on: [bloco-r10-1-funil-reveal, bloco-r10-2-bakeoff-regua, bloco-r10-3-timeframe-stuck]
paralelo_com: [bloco-r10-4-reco-consent-hero, bloco-r10-4-topic-picker-serverside, bloco-r10-4-happy-path-ceremony]
itens: [FIX-306, FIX-307, FIX-310, FIX-312]
escopo_arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/gate-questions.ts
conflitos_esperados: "baixo: qualify-state.ts também é tocado pelo bloco-r10-4-reco-consent-hero, mas em região diferente (este bloco mexe em STUCK_ESCAPE_GATES/gateStuckTurns pro gate `credit`; o outro mexe em nextGate() pro gate `reco-consent`) — resolução manual simples esperada no merge do orquestrador."
---
# Bloco r10-4 — credit-deadlock (FIX-306, FIX-307, FIX-310, FIX-312)

Onda 4 — 4 dos 7 fixes da investigação de causa-raiz da Etapa A do loop-de-goal (rodada 10),
agrupados neste bloco porque compartilham arquivo/coupling (`analyze.ts`/`qualify-state.ts`/
`gate-questions.ts`, todos na região do gate `credit`). É a família dominante de causa-raiz do
regressão real (1/10 confirmado na Rodada A.2): o funil trava no gate `credit` mesmo quando o
usuário já mencionou o valor junto da resposta do `desire` (cenário Mario), deixando todo o resto
da cascata pós-credit como código morto nesse caminho.

## Decisão já resolvida (não re-perguntar)
A abordagem já foi decidida via investigação de causa-raiz direta (não delegada) desta sessão,
documentada em `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção Rodada 10 → onda 4):
promoção do valor mencionado no `desire` pra `creditMax` (FIX-306) + escape condicional do gate
`credit` quando travado E o valor já foi mencionado (FIX-307, defesa em profundidade — NÃO se
aplica quando não há nenhum valor mencionado, isso continua travando por design). Não re-discuta
o "se" — só os detalhes de implementação (nomes de campo, exato do N de tentativas do FIX-307,
que deve espelhar o N já usado no FIX-305 da onda 3).

## Referências obrigatórias
- `.processo/loop/2026-07-09-agente-vendas-consorcio.md` (seção Rodada 10 → investigação de
  causa-raiz → família Mario/credit-deadlock) — contém a query real no banco que confirmou o bug.
- `.processo/loop/evidencias-r10/dossies/mario-sem-lance-v2/dossie.json` (turno 4 — reprodução
  exata do cenário).
- `docs/correcoes/todo/bloco-r10-4-credit-deadlock/fix-306-*.md`,
  `fix-307-*.md`, `fix-310-*.md`, `fix-312-*.md` (cada um com root cause file:line já investigado).
- `src/lib/agent/qualify-state.ts:59-64` (`STUCK_ESCAPE_GATES`, exclusão deliberada de `credit`
  — NÃO remova a exclusão geral, só adicione o escape CONDICIONAL descrito no FIX-307).
