---
id: FIX-246
titulo: "Emitir two_paths/embedded_bid/scarcity server-side (não depender do LLM chamar a tool)"
status: done
bloco: bloco-r3-serverside-cards
arquivos:
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/server-cards.ts
  - src/lib/agent/orchestrator/dial-payload.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/personas.ts
  - src/lib/web/adapter.ts
rodada: 2026-07-10 rodada 3 (Fable r2, gaps 1/3 PARCIAIS)
commit: db1b072
executado_em: "2026-07-10"
---

## Gap (veredito Fable r2, gaps #1 e #3 — PARCIAIS)
`two_paths` 0/2 emissões; `embedded_bid`/`scarcity` 0 emissões em 5 oportunidades. Os directives
`buildLanceSoParcelaDirective`/`buildEmbeddedBidDirective`/`buildScarcityDirective` DISPARAM mas o
LLM ignora/erra (num clique chamou `present_whatsapp_optin` no lugar; scarcity virou bolha vazada
"Não tenho novidade de vaga"). Causa-raiz: invariante no PROMPT, não em código (Lei 1/4).

## Correção
- Emitir o card SERVER-SIDE no handler determinístico: onde hoje o directive manda o LLM chamar
  `present_two_paths`/`present_embedded_bid`/`present_scarcity`, o servidor monta o payload coagido
  (reusar a coerção do `runner.ts` — extrair helper se preciso) e faz `writer.write({type:
  "data-artifact", data:{type, payload}})` direto, no ponto certo (so_parcela→two_paths;
  gate lance-embutido→embedded_bid; pré-proposta→scarcity se availableSlots baixo).
- O directive/texto do agente só escreve o texto de acompanhamento (1 frase), NÃO o card.

## Regressão (TDD + E2E adaptativo)
- E2E: Fluxo B (so_parcela) → `two_paths` no artifact stream SEMPRE (determinístico, não depende do LLM).
- Fluxo A: `embedded_bid` no gate lance-embutido; `scarcity` antes da proposta.
- teste: o handler emite o data-artifact (não depende de tool-call do LLM).
