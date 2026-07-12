---
bloco: bloco-r9-2-gate-refino
branch: fix/r9-2-gate-refino
workspace: fix-r9-2-gate-refino
onda: 1
depends_on: []
paralelo_com: [bloco-r9-2-anchor-fechamento, bloco-r9-2-prompt-honestidade]
itens: [FIX-285, FIX-284]
escopo_arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/qualify-state.fix-285-motivo-item-generico.test.ts
  - src/lib/agent/orchestrator/analyze.test.ts
  - src/lib/agent/orchestrator/gate-questions.fix-284-confirma-desire.test.ts
conflitos_esperados:
  - "system-prompt.ts: este bloco toca `desireFollowUpSection` (linha ~1019-1027, FIX-285); o bloco-r9-2-prompt-honestidade toca `whatsappOptinSection` (linha ~918-920, FIX-283) — regiões DIFERENTES do mesmo arquivo, ~100 linhas de distância, funções exportadas distintas (nível 2: overlap textual, não estrutural). Resolução mecânica esperada (auto-merge). Ordem de merge recomendada: bloco-r9-2-prompt-honestidade MERGEIA ANTES deste bloco — se o merge automático falhar mesmo assim, este bloco (gate-refino) resolve o conflito no merge (mergeia depois)."
---
# Bloco r9-2 — Refino dos gates de qualificação (FIX-285 + FIX-284)

## Ordem interna
1. **FIX-285 primeiro** (P2/Func — gate do motivo nunca segura o funil quando o `desire` só traz
   a categoria genérica). Ambos os itens mexem em `qualify-state.ts`/`analyze.ts`/
   `system-prompt.ts`, mas em pontos DIFERENTES do funil (motivo × valor do bem) — sem
   dependência real entre eles; a ordem é só por severidade/afinidade temática (os dois são
   sobre o gate `desire`/`credit` logo em seguida um do outro na jornada).
2. **FIX-284 depois** (P2/UX — `gate:credit` re-pergunta o valor já mencionado no `desire`).

## Por que este bloco existe (root causes provados, não as hipóteses originais da rodada)
A rodada hipotetizou, pro FIX-285, "`meta.motivationAsked` marcado cedo demais" —
INVESTIGADO E REFUTADO: `motivationAsked` nunca chega a ser marcado neste cenário porque a
precondição de `shouldAskMotive` (`Boolean(q.desiredItem)`) nunca fica truthy quando o usuário só
nomeia a categoria genérica ("um carro") em vez de um item específico ("um Corolla") — por
design EXPLÍCITO do prompt do `turn-analyzer.ts` ("não invente [desiredItem] a partir da
categoria genérica"). Ver `fix-285-gate-motivo-depende-de-item-especifico.md`.

Pro FIX-284, a rodada apontou certo o efeito colateral do FIX-279 (guard `activeGateAtTurnStart`
em `analyze.ts`), mas o gap real não é reverter esse guard (regrediria o G3 do baseline, já
morto) — é que o valor mencionado informalmente no `desire` NUNCA fica salvo em NENHUM campo, só
descartado. A correção captura esse valor num campo NOVO e NÃO-bloqueante (que não interfere com
a agulha formal), pra o `gate:credit` poder CONFIRMAR em vez de perguntar do zero. Ver
`fix-284-gate-credit-confirma-valor-do-desire.md`.

## Escopo compartilhado com o bloco-r9-2-prompt-honestidade
Só `system-prompt.ts`, regiões disjuntas (`desireFollowUpSection` vs `whatsappOptinSection`,
~100 linhas de distância) — ver `conflitos_esperados` acima. Nenhum outro arquivo é compartilhado
com os outros 2 blocos da onda.
