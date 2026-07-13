---
id: FIX-286
titulo: "Guard de tool-error/cap (FIX-262) descarta um reveal LEGÍTIMO já buscado no próprio turno e mente 'as opções já apareceram' quando nada apareceu ainda"
status: done
commit: b6b1e44
executado_em: "2026-07-12"
severidade: alta
projeto: aja-agora
bloco: bloco-r9-3-reveal-guard
arquivos:
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: "2026-07-12 loop r9 ONDA 3 (pós-onda-2 Sonnet 4/10, P0-1 novo, veredito-r9pos2-sonnet.md §3)"
---
## Palavras do juiz (veredito r9pos2, Sonnet 5 — P0-1, Funcional 4/10 MÍNIMO)
> "em `probe-i2-justificativa`, o turno 7 — a MESMA ação-padrão 'Valor do bem: R$ 120.000' usada
> com sucesso nos outros 4 cenários — dispara o guard de tool-error/cap (`runner.ts:473-511`,
> FIX-262) e SUPRIME a apresentação inteira do reveal: `present_recommendation_card` nunca é
> chamado, `recommendation_card` nunca aparece, `gate:experience` nunca dispara — em NENHUM dos
> 9 turnos da conversa inteira. O agente entrega o fallback genérico
> `buildToolErrorRecoveryFallback` [...] 'as opções que já apareceram aqui pra você continuam
> valendo' — uma frase factualmente falsa nesse ponto (nada tinha aparecido ainda)."
> — `.processo/loop/evidencias-r9/veredito-r9pos2-sonnet.md` §3 (P0-1) + tabela Funcional

## Cenário exato
- **Rota/tela:** chat web, 1ª busca da conversa (turno 7 de `probe-i2-justificativa`, fase
  discovery/reveal, gate credit acabou de confirmar o valor do bem).
- **Passos:** usuário responde "Valor do bem: R$ 120.000" → agente chama `search_groups` (OK,
  `tool:search_groups` no dossiê) → chama `recommend_groups` (OK, `tool:recommend_groups`) → uma
  chamada de tool SEGUINTE (apresentação — `present_recommendation_card`/`present_group_card`)
  falha como `tool-error` (nunca aparece em `artifactTypes`, pois o case `tool-error` de
  `runner.ts:473-497` não emite artifact nenhum, só loga + aborta) → o turno inteiro é substituído
  pelo fallback genérico.
- **Dados usados:** `.processo/loop/evidencias-r9/dossies-r9pos2/probe-i2-justificativa/dossie.json`
  turno 7 (`agentText`: "Perfeito, R$ 120.000,00 confirmado.Rafael, as opções que já apareceram
  aqui pra você continuam valendo [...]"; `artifactTypes: ["tool:search_groups",
  "tool:recommend_groups"]`, sem nenhum `recommendation_card`/`gate:experience`).

## Esperado × Atual
- **Esperado:** reveal completo (`recommendation_card` em destaque + `gate:experience`) na
  primeira busca bem-sucedida — `search_groups`/`recommend_groups` retornaram grupos reais neste
  MESMO turno (indexados em `revealGroupsById`, `runner.ts:273,430-432`); se uma tool de
  apresentação seguinte falhar, o sistema tem os dados prontos pra materializar o card mesmo
  assim.
- **Atual:** o texto EXATO devolvido é `buildToolErrorRecoveryFallback` (`directives.ts:417-424`)
  — a mesma frase usada para "peça de novo, as opções que já existem continuam valendo" — mesmo
  quando é a PRIMEIRA tentativa da conversa e nada existia ainda. `recommendation_card` e
  `gate:experience` nunca disparam nos 9 turnos.

## Root cause (INVESTIGADO — provado no código)
1. **A identidade do texto prova o branch.** A frase "as opções que já apareceram aqui pra você
   continuam valendo" só existe em `directives.ts:417-424` (`buildToolErrorRecoveryFallback`),
   escrita para o cenário `toolErrorThisTurn || toolCallCapExceededThisTurn`
   (`index.ts:477-518`) — NÃO para `discoveryFailedThisTurn` (que usa
   `buildDiscoveryFailedFallback`, texto diferente, `index.ts:454-460`). Ou seja, o turno 7
   bateu exatamente no guard FIX-262 (`runner.ts:473-511`), não numa falha de descoberta.
2. **Cap não é a causa aqui.** `artifactTypes` mostra só 2 tool-calls processadas
   (`search_groups`, `recommend_groups`) — muito abaixo do `TOOL_CALL_HARD_CAP = 12`
   (`runner.ts:99`). Então o `toolCallCapExceededThisTurn` (linha 505-511) não pode ter disparado
   — sobra o branch `case "tool-error"` (linha 473-497): uma 3ª chamada de tool (provavelmente
   `present_recommendation_card`/`present_group_card`, a apresentação que viria depois de
   `recommend_groups`) foi rejeitada pelo AI SDK (o mesmo padrão documentado no comentário
   `runner.ts:461-472`: "o modelo chamou uma tool FORA do toolset da fase") — e como o case
   `tool-error` não emite `artifact`/`tool-call` nenhum (só loga + `turnAbortController.abort()`),
   essa 3ª tentativa falhada é INVISÍVEL no dossiê — só o corte abrupto da narração denuncia.
3. **O dado real já estava em mãos e foi jogado fora.** `runner.ts:428-432` já indexa QUALQUER
   `tool-result` de `search_groups`/`recommend_groups` em `revealGroupsById` — a MESMA estrutura
   que, no caminho feliz, alimenta `coerceRecommendationPayload`/`coerceComparisonPayload`
   (`runner.ts:654-673`) pra montar o card sem depender dos números da LLM. Quando o guard
   dispara (linha 723, `if (toolErrorThisTurn || toolCallCapExceededThisTurn) break;`), o loop
   para de consumir o stream e o `result` (com `revealGroupsById` já populado) some no retorno —
   `index.ts:477-518` recebe só as duas flags booleanas, nunca `revealGroupsById`, e por isso não
   tem como saber "os grupos reais já foram buscados com sucesso ANTES do erro".
4. **O fallback nunca checa se é a primeira vez.** `index.ts:477-518` decide entre 3 variantes
   (`buildToolErrorRecoveryExactnessFallback` / `buildToolErrorRecoveryResolvedFallback` /
   `buildToolErrorRecoveryFallback`) só olhando o TEXTO do usuário (`isExactnessOrCriteriaQuestion`,
   `mentionedOffer`) — nenhuma condiciona ao estado real da conversa
   (`meta.revealCompleted`, presente em `meta` e já lido em `index.ts:337` noutro ponto do
   arquivo). Resultado: a MESMA frase "já apareceram" serve tanto pra "você pediu de novo e elas
   continuam lá" (uso correto, I1) quanto pra "é a primeira vez e o processo de apresentar
   quebrou no meio" (uso incorreto, este P0) — a família FIX-262/266/282 foi desenhada e testada
   só para o cenário de REPETIÇÃO pós-reveal (`runner.fix-262-tool-error-cap.integration.test.ts`
   simula exatamente isso: tool-error em cima de uma oferta JÁ mostrada antes), nunca para a
   falha DURANTE a primeira apresentação.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Antes de escolher o fallback em `index.ts:477-518`, checar `!meta.revealCompleted && revealGroupsById.size > 0` (dados reais já buscados este turno, nenhum reveal anterior existia) — nesse caso, NÃO usar `buildToolErrorRecoveryFallback` (mentira "já apareceram"); materializar o reveal server-side a partir de `revealGroupsById` (reaproveitando `coerceRecommendationPayload`/`coerceComparisonPayload`, o mesmo padrão já usado no caminho feliz, `runner.ts:654-673`) + emitir `gate:experience` | `index.ts:477-518` (novo branch antes do genérico) + expor `revealGroupsById` no retorno de `runner.ts` (hoje só as flags booleanas voltam) |
| Se não houver `revealGroupsById` suficiente pra montar um card completo (ex.: só `search_groups` rodou, `recommend_groups` nunca chegou a rodar), degradar para um D10 HONESTO — "tive uma instabilidade técnica bem na hora de te mostrar as opções, deixa eu tentar de novo" (nunca "já apareceram") + retry determinístico de `recommend_groups`/apresentação, não repetir a mesma tentativa que já falhou sem mudança | novo builder em `directives.ts` (ex. `buildFirstRevealRecoveryFallback`), distinto de `buildToolErrorRecoveryFallback` |
| Manter `buildToolErrorRecoveryFallback`/`Resolved`/`ExactnessFallback` intocados para o caso ORIGINAL (repetição pós-reveal, `meta.revealCompleted === true`) — não regredir I1/G-B/FIX-266/FIX-282 | `directives.ts` (funções existentes) |

## Regressão exigida
- Novo `src/lib/agent/orchestrator/index.fix-286-reveal-legitimo.integration.test.ts` (mesmo
  padrão de `runner.fix-262-tool-error-cap.integration.test.ts`/
  `index.fix-266-recuperacao-resolve.integration.test.ts`): mocka um fullStream que (a) emite
  `tool-call`+`tool-result` reais de `search_groups`/`recommend_groups` com grupos válidos, (b)
  em seguida uma 3ª tool-call que produz `tool-error`. Antes do fix: falha mostrando que a
  resposta final é o texto verbatim de `buildToolErrorRecoveryFallback` E que nenhum
  `recommendation_card`/`gate:experience` foi emitido. Depois do fix: `recommendation_card` (ou
  o D10 honesto de retry, se optar pela via B) É emitido, e o texto NUNCA afirma "já apareceram"
  quando `meta.revealCompleted` era `false` no início do turno.
- `runner.fix-262-tool-error-cap.integration.test.ts` e
  `index.fix-266-recuperacao-resolve.integration.test.ts` continuam verdes (cenário de REPETIÇÃO
  pós-reveal não pode regredir).
- `pnpm test:unit` verde.
