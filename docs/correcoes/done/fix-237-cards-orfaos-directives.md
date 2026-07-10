---
id: FIX-237
titulo: "Acionar embedded_bid e scarcity — cards órfãos (directive que o LLM chama)"
status: done
bloco: bloco-r2-funil-cards
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/directives.test.ts
  - src/lib/agent/orchestrator/index.ts
  - src/app/api/chat/route.ts
  - tests/regression/fix-237-cards-orfaos.test.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P0 #3)
commit: PENDENTE (preenchido no commit real)
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D2.1, gap #3)
`present_embedded_bid` e `present_scarcity` eram ÓRFÃOS: tool + schema + allowlist
(`tool-policy.ts`) + coerção server-side (`embedded-bid-payload.ts`/`scarcity-payload.ts`)
+ componente + case no `artifact-renderer.tsx` já existiam — mas ZERO directive/prompt
instruía o modelo a chamá-las. 0 de 3 cards novos do handoff apareciam na jornada.

## Correção
Duas directives novas em `directives.ts` (modelo: `buildSimulatorDialDirective` /
`buildLanceSoParcelaDirective` — 1 frase curta + 1 chamada de tool, payload coagido
server-side):
- `buildEmbeddedBidDirective()` — disparada no gate `lance-embutido`, ANTES do
  texto+chips determinístico (`pipeGatePrompt`), nos dois pontos de entrada do gate
  em `route.ts` (ramo no/maybe do gate `lance`, e após `lance-value`).
- `buildScarcityDirective()` — disparada depois da estratégia de lance resolvida,
  IMEDIATAMENTE antes do card de decisão (`buildDecisionPromptDirective`), nos dois
  pontos onde o `decision` é despachado: `orchestrator/index.ts` (caminho canal-agnóstico,
  só no ramo NORMAL — pula no caminho `so_parcela`/two_paths, que vai direto pro fecho
  sem o gancho de escassez) e `route.ts` (ramo "Agora não" do gate `simulator-offer`,
  caminho ambíguo preservado pelo FIX-38).

Achados extras corrigidos no caminho (mesma classe do FIX-236 — janela fixa de slice
em teste source-level que meu comentário/código legítimo estourou):
- `tests/regression/agent-trajectory.test.ts` (FIX-38): a regex do bloco
  `simulator-offer` parava no PRIMEIRO comentário (`\n\t+\/\/`), e meu comentário do
  scarcity cortava a janela antes de `buildDecisionPromptDirective`. Trocado por janela
  até o próximo `if (action.gate ===`, igual ao fix já aplicado no FIX-236.

## Regressão (TDD + suíte)
- `src/lib/agent/orchestrator/directives.test.ts`: 6 testes novos (existência das
  directives + regra dura de não inventar números + presença do `groupId`).
- `tests/regression/fix-237-cards-orfaos.test.ts` (NOVO, source-level): trava que
  TODA ocorrência de `gate: "lance-embutido"` em route.ts tem `buildEmbeddedBidDirective`
  nos 400 chars anteriores; trava que `buildScarcityDirective` precede
  `buildDecisionPromptDirective` nos dois pontos de despacho de `decision`. Escritos
  ANTES da wiring (falharam 4/4 antes, passam depois — reproduzem o gap real, não só a
  ausência da função).
- `pnpm test:unit`: 2996/2996 verde.
- E2E: pendente validação por API contra a app rodando (ver resumo final do bloco).
