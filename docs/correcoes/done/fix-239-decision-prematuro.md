---
id: FIX-239
titulo: "decision_prompt prematuro em elogio + turno morto no pedido real"
status: done
bloco: bloco-r2-funil-cards
arquivos:
  - src/lib/agent/orchestrator/artifact-guard.ts
  - src/lib/agent/orchestrator/artifact-guard.test.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/decision-advancement.test.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #6)
commit: PENDENTE (preenchido no commit real)
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D3.4, gap #6)
(a) "Gostei, faz bastante sentido" (elogio, NÃO decisão) disparava `decision_prompt`
ANTES de experience/timeframe/lance resolvidos. (b) Em "quero seguir com esse plano" o
agente anunciava "Então deixa eu confirmar com você:" e NADA aparecia (guard
`decisionDispatched` engolia a re-emissão) — promessa visível sem entrega (família
FIX-206/207).

## Causa raiz
(a) `present_decision_prompt` é liberada pela FASE (tool-policy `reveal`/`closing`), não
pelo estado da qualificação — o LLM podia chamá-la livremente em qualquer afirmativo
pós-reveal, mesmo com experience/timeframe/lance ainda pendentes. O único guard
existente (`isDecisionDup`) só cobria a RE-emissão pós-`decisionDispatched`, não a
PRIMEIRA emissão fora de ordem.
(b) Depois que `decisionDispatched=true`, `nextGate()` nunca mais re-emite "decision" —
a conversa vira 100% free-run do LLM. Um re-pedido em TEXTO LIVRE ("quero seguir")
fazia o LLM tentar re-chamar `present_decision_prompt` (suprimido pelo `isDecisionDup`),
mas o TEXTO da resposta ("deixa eu confirmar...") já tinha saído — card nunca chegou.
O clique estruturado "Tenho interesse" já tinha o caminho certo
(`buildAdvanceToContractDirective`, route.ts `kind:"interest"`); só o texto livre não.

## Correção
1. **Nova regra `premature-decision`** em `artifact-guard.ts`: suprime `decision_prompt`
   quando `decisionDispatched !== true` E `nextGate(meta)` ainda não é `"decision"` —
   `nextGate()` é a fonte única da ordem (só chega em "decision" depois de
   experience/timeframe/lance+lance-embutido/simulator-offer resolvidos).
2. **Roteamento determinístico em `index.ts`**: `isUserTurn && decisionDispatched===true
   && !contractClosed && userIntent==="ready_to_proceed"` → dispara
   `buildAdvanceToContractDirective` diretamente (mesma directive do clique "Tenho
   interesse"), pulando o free-run que gerava a promessa sem entrega.

## Regressão (TDD + suíte)
- `src/lib/agent/orchestrator/artifact-guard.test.ts`: 5 testes novos (SUPRIME em
  neutral/ready_to_proceed pré-qualificação; PERMITE pós-qualificação completa; não
  interfere em outros artifacts; decisionDispatched=true delega pro reveal-loop). Um
  teste PRÉ-EXISTENTE ("PERMITE: primeiro decision_prompt") tinha fixture que
  encodava a premissa ERRADA (decision_prompt sempre ok logo após reveal) — corrigido
  pra qualificação completa, preservando a intenção original do teste (caminho feliz).
- `src/lib/agent/orchestrator/decision-advancement.test.ts`: 2 testes novos
  (source-level) travando que `index.ts` importa e usa
  `buildAdvanceToContractDirective` guardado por `decisionDispatched` +
  `ready_to_proceed` + `contractClosed`.
- `pnpm test:unit`: 3010/3010 verde.
- E2E: pendente validação por API contra a app rodando (ver resumo final do bloco).
