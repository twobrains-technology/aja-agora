---
id: FIX-290
titulo: "comparison_table some do reveal porque o pareamento com recommendation_card é só regra-no-prompt (sem emissão server-side garantida)"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-r9-4-reveal-serverside
arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
rodada: "2026-07-12 loop r9 ONDA 4 (pós-onda-3 4/10, P0 sistêmico, veredito-r9pos3-sonnet.md §3)"
---
## Palavras do juiz (veredito r9pos3, Sonnet 5 — P0 Funcional)
> "present_recommendation_card e present_comparison_table são 'INSEPARÁVEIS' (regra do
> próprio sistema) — os dois devem sair juntos. Atual: recommendation_card aparece;
> comparison_table, gate:experience e whatsapp_optin nunca aparecem na conversa inteira."
> — `.processo/loop/evidencias-r9/veredito-r9pos3-sonnet.md` §3 (probe-i2-justificativa, turno 7)

## Cenário exato
- **Rota/tela:** chat web/WhatsApp, turno de reveal (2+ grupos retornados por `search_groups`).
- **Passos:** modelo (GPT-4.1) chama `search_groups` → `recommend_groups` →
  `present_recommendation_card` e PARA — nunca chama `present_comparison_table` no mesmo turno.
- **Dados usados:** `dossies-r9pos3/probe-i2-justificativa/dossie.json` turno 7 — `artifactTypes`
  sem `present_comparison_table`/`comparison_table`/`gate:experience`/`whatsapp_optin`.

## Esperado × Atual
- **Esperado:** no ramo 2+ grupos, `recommendation_card` + `comparison_table` saem SEMPRE juntos
  no mesmo turno (o reveal é uma unidade atômica) — nunca um sem o outro.
- **Atual:** a garantia de pareamento é só uma frase no prompt (`directives.ts:348`, "REGRA
  DURA... INSEPARÁVEIS") — se o modelo parar de gerar tool-calls após a 1ª, nada no código força
  a 2ª. O card recomendado aparece sozinho e a tabela comparativa simplesmente some.

## Root cause (INVESTIGADO — provado no código)
- O pareamento `recommendation_card` × `comparison_table` é **regra-no-prompt**
  (`src/lib/agent/orchestrator/directives.ts:348`, "REGRA DURA — present_recommendation_card e
  present_comparison_table são INSEPARÁVEIS"), sem NENHUM invariante em código que force a 2ª
  tool-call quando a 1ª sai.
- `present_comparison_table` (`src/lib/agent/tools/ai-sdk.ts:1148-1155`) só faz `markShown` +
  devolve uma string de confirmação pro modelo — é uma tool comum, liberada no toolset da fase
  (`tool-policy.ts`), sem fallback de emissão. Comparar com `present_recommendation_card`
  (`ai-sdk.ts:1157-1173`): mesma estrutura (markShown + precondição via `evaluateActionPrecondition`)
  — a diferença real não está nessas duas tools (ambas são "regra de aceitação de INPUT", não
  emissão), mas em quem GARANTE que a tool seja chamada.
- A coerção server-side do PAYLOAD (`coerceRecommendationPayload`/`coerceComparisonPayload`,
  `recommendation-payload.ts:152-197` e `:236-259`) roda em `runner.ts:693-714` **só quando o
  modelo de fato chamou a tool** — ela corrige os NÚMEROS de quem foi emitido, mas não cria o
  card que nunca foi chamado.
- O mecanismo que GARANTE emissão mesmo sem tool-call do modelo é `emitServerCard`
  (`src/lib/agent/orchestrator/index.ts:95-117`, "nunca depende de o LLM chamar present_X") — mas
  ele só é invocado para `recommendation_card` (linha 520), `whatsapp_optin` (670), `scarcity`
  (724), `two_paths` (752), `decision_prompt` (772) e `embedded_bid` (815).
  **`comparison_table` NÃO está nessa lista** — é a única carta do reveal sem nenhum caminho de
  emissão server-side garantida.
- Confirma-se até no caminho de RECUPERAÇÃO já existente (FIX-286, `index.ts:484-542`): quando o
  guard de tool-error/cap interrompe o turno, o código reconstrói e reemite
  `recommendation_card` via `emitServerCard` a partir de `revealGroupsById`
  (`pickBestRankedGroup` + `buildRecommendationCardFromRevealGroup`,
  `recommendation-payload.ts:203-231`) — mas essa recuperação **também não** emite
  `comparison_table` junto, mesmo tendo o índice completo de grupos disponível
  (`result.revealGroupsById`, alimentado em `runner.ts:467-471`).
- Ou seja: em NENHUM caminho do código (feliz OU de recuperação) há uma emissão do
  `comparison_table` que não dependa 100% do modelo decidir chamar a tool. `gate:experience` e
  `whatsapp_optin` desaparecerem no mesmo turno é sintoma colateral: o funil determinístico
  provavelmente usa a presença de `comparison_table`/reveal completo como sinal pra disparar o
  gate seguinte (não investigado a fundo — fora do escopo do root cause do card em si).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Depois que o turno termina (ou no ponto em que `recommendation_card` é emitido/coagido, tool-call OU recovery), checar se o ramo é 2+ grupos (`revealGroupsById`/`lastSearchGroups` tem 2+ entradas) e se `comparison_table` NÃO saiu neste turno — se não saiu, emitir via `emitServerCard` reaproveitando `coerceComparisonPayload` + os grupos já indexados (o MESMO padrão do FIX-286 pra `recommendation_card`) | `src/lib/agent/orchestrator/index.ts` (perto do bloco FIX-286, ~484-542) e/ou `runner.ts` (expor o sinal "comparison_table emitido neste turno" pro orchestrator, mesmo padrão de `toolErrorThisTurn`) |
| Alternativa mais forte (preferível): tratar o reveal como conjunto atômico desde a origem — ao coagir/emitir `recommendation_card` no caminho feliz (`runner.ts:693-706`), se o turno teve 2+ grupos e a tool `present_comparison_table` não foi chamada até o fim do stream, forçar sua emissão server-side ali mesmo (sem esperar o modelo) | `runner.ts` (fim do loop de stream, ~744-765) reaproveitando `coerceComparisonPayload`/`revealGroupsById` |
| Manter a regra-no-prompt (`directives.ts:348`) como reforço — não remover, só deixar de ser a ÚNICA garantia | `directives.ts` (sem mudança funcional necessária) |

## Regressão exigida
- Novo teste de integração (padrão de `index.fix-246-server-cards.integration.test.ts`): simula
  um turno onde o modelo chama `search_groups`+`recommend_groups`+`present_recommendation_card` e
  PARA (sem chamar `present_comparison_table`), com 2+ grupos retornados — assevera que o
  `TurnEvent` de artifact `comparison_table` é emitido mesmo assim, com os grupos reais.
- Caso de borda: busca com exatamente 1 grupo — `comparison_table` NUNCA deve ser forçado (regra
  já documentada: "só pulam os DOIS juntos quando a busca devolveu 1 grupo único").
- Regressão do caminho feliz: quando o modelo chama as duas tools normalmente, nada muda
  (idempotente — não duplicar o card).
- `pnpm test:unit` verde.
