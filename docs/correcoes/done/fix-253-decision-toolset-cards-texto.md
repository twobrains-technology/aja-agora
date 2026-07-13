---
id: FIX-253
titulo: "present_decision_prompt fora do toolset (scarcity incondicional) + embedded_bid no caminho texto"
status: done
bloco: bloco-r4-cards-polish
arquivos:
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/server-cards.ts
  - src/lib/agent/orchestrator/types.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/web/adapter.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/interactive-handlers.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, gaps scarcity/embedded PARCIAIS)
executado_em: "2026-07-10"
nota: |
  Implementado JUNTO com FIX-254 (mesmo commit) — a infra suppressGateEvent que
  o FIX-254 usa pra matar o double-dispatch é a mesma que protege o novo
  embedded_bid-no-caminho-texto (FIX-253) de duplicar no caminho de clique.
  Separá-las em commits distintos deixaria um estado intermediário quebrado.
---
## Gap (veredito FINAL §2 e §3, "pro teto" #2)
- **scarcity**: no Fluxo A o LLM chamou `present_decision_prompt` DIRETO (bypassa o ramo
  `nextGateToFire==="decision"` do `index.ts:380-400` que emite scarcity server-side) → 0
  scarcity no Fluxo A. Enquanto `present_decision_prompt` estiver no toolset (reveal/closing),
  o LLM decide se o gancho de escassez existe — mesma Lei violada que o FIX-246 fechou.
- **embedded_bid**: o caminho TEXTO do gate lance ("junto 4 mil/mês") despacha lance-embutido
  SEM o card (só cliques emitem). `web/adapter.ts` case "gate" só emite pergunta+chips.
## Correção
- Tirar `present_decision_prompt` do toolset do LLM (`tool-policy.ts`, reveal+closing) e rotear
  TODO decision pelo ramo do orchestrator → scarcity server-side vira incondicional.
- Emitir `embedded_bid` server-side no caminho TEXTO (gate handler do adapter/index), não só nos cliques.
## Regressão (TDD + E2E)
- Fluxo A (avanço por texto) → decision vem do orchestrator, scarcity emitido (não 0).
- caminho texto do gate lance → embedded_bid no artifact stream.
- present_decision_prompt não está no allowedTools (teste tool-policy).
