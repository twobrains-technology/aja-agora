---
id: FIX-84
titulo: "Gate lance-embutido pulado para Não/Talvez — handler do route não acompanhou o FIX-4"
status: todo
bloco: bloco-a-funil-qualificacao
arquivos:
  - src/app/api/chat/route.ts
  - src/app/api/chat/lance-embutido-gate.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
---

# Bug — gate de lance embutido pulado para "Não"/"Talvez" (regressão do FIX-4)

- **Data:** 2026-06-21 · **Achado em:** QA noturno E2E browser (rodada 2026-06-21-0812, continuação /to-saindo) · **Superfície:** funil de qualificação (chat web) — handler do gate `lance`
- **Severidade:** média-alta — afeta todos que respondem "Não tenho reserva" ou "Talvez" no lance (provavelmente a maioria), justamente o público que a educação de lance embutido mais serve.

## Cenário (reproduzível no browser)
1. Funil de auto: chegar no gate lance ("Você teria uma reserva pra dar um lance?").
2. Escolher **"Por enquanto não"** (ou "Talvez, depende").
3. **Esperado (jornada-canonica §2, FIX-4):** o agente apresenta a **educação de lance embutido** ("Você sabe o que é lance embutido?..." + "Quer considerar nas suas simulações?") ANTES de buscar — a educação vale pra QUALQUER resposta (Sim/Não/Talvez); o texto mira quem NÃO tem o valor do lance hoje.
4. **Atual:** o agente vai **direto pra busca** ("Buscando grupos…" → recomendação), pulando a educação de lance embutido.

## Evidência (browser + DB — conversa `fa67e9a1`)
- Browser: lance "Por enquanto não" → "Bora ver o que encaixa na sua faixa:" → busca → recomendação. Nenhum card de lance embutido no meio.
- DB metadata: `hasLance: "no"`, `searchDispatched: true`, **`lanceEmbutido` AUSENTE** (gate nunca disparado).

## Causa raiz (contradição interna, determinística)
`src/app/api/chat/route.ts` — handler do gate `lance` (linha ~918): para `value !== "yes"` chamava `pipeSearchSummaryTurn` direto, pulando o gate `lance-embutido`. O comentário ainda dizia "maybe/no vão direto pra busca" (lógica **pré-FIX-4**).

Mas `src/lib/agent/qualify-state.ts:62-68` (nextGate) — comentário do **FIX-4** (2026-06-05): *"TODO MUNDO passa pelo gate de lance embutido (educa + opt-in) antes da busca... a versão anterior pulava maybe/no"* → `if (q.lanceEmbutido === undefined) return "lance-embutido"`.

Ou seja: o **FIX-4 atualizou o nextGate mas não o handler do route** — fix incompleto. No runtime quem dispara é o handler, então "no"/"maybe" pulavam a educação.

## decidido (§4.3.1 — reversível)
**Opção tomada:** no handler do gate lance, para "no"/"maybe", disparar `pipeGatePrompt({ gate: "lance-embutido" })` (espelhando o handler `lance-value` que já fazia isso, linha 1010) em vez de `pipeSearchSummaryTurn`. O caminho "yes" continua igual (reage → lance-value → lance-embutido). **Por quê:** alinha o handler ao nextGate + FIX-4 + jornada §2; reusa mecanismo já comprovado; o card lance-embutido é prosa educativa fixa (`gate-questions.ts:32`) que NÃO depende de `lanceValue`, então renderiza ok sem reserva. **Reversível** em 1 linha.

## Regressão (TDD)
- **Camada 1 (estrutural):** `src/app/api/chat/lance-embutido-gate.test.ts` — asserts contra o source do handler: o caminho não-yes dispara `gate: "lance-embutido"` e NÃO tem a chamada `await pipeSearchSummaryTurn(` direto. Provado: 3 passam com fix; revertendo o fix (stash) → 2 falham. (Nome sem prefixo "route" de propósito — `test:unit` exclui `route*.test.ts`; queremos rodar em todo PR.)
- **Cobertura E2E:** o BUG foi observado no browser+DB (lance=no pulou). A revalidação E2E browser do fix específico não foi percorrida (4ª travessia do funil = custo desproporcional); o risco de render foi descartado por leitura (`gateQuestion('lance-embutido')` é prosa fixa sem `lanceValue`), e o roteamento está travado pela Camada 1.
- **Sugestão (bloco):** um teste de integração de route (`route.*.test.ts`, fora do test:unit) exercitando o POST do gate lance=no → lance-embutido seria a cobertura comportamental completa.
