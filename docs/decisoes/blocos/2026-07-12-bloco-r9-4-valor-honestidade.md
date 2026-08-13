---
bloco: bloco-r9-4-valor-honestidade
data: 2026-07-12
onda: 4 (r9)
itens: [FIX-292, FIX-293]
---
# Decisões de design — valor & honestidade da justificativa (onda 4)

Ambos os cards trouxeram root cause + correção fechada. Nenhum trade-off
exigiu parar pra `AskUserQuestion` — nos dois casos a correção óbvia seguiu
um precedente arquitetural já validado no próprio codebase (Lei 4: invariante
crítico vira código, não regra-no-prompt). Registro as decisões de execução
tomadas mesmo assim, pra rastreabilidade.

## D1 (FIX-292) — `knownCreditValueByGroupId` vira `Map<string, KnownGroupValue>` multi-campo

**Decisão:** o Map que carrega o cenário REAL já simulado por groupId deixa de
guardar só `number` (creditValue) e passa a guardar `{creditValue, monthlyPayment,
termMonths?}`. `extractKnownCreditValue` (nome mantido — ver D2) agora EXIGE
`creditValue` E `monthlyPayment` válidos (>0, finito) pra considerar o registro
utilizável; sem os dois juntos, `null` (nunca contamina o mapa com metade do
cenário).

**Por quê:** o root cause do card já provava que `coerceRevealCota` sobrescrevia
só `creditValue` quando havia divergência — `monthlyPayment` ficava órfão. A
fonte única (`known-credit-values.ts`) tinha que virar multi-campo pra fechar o
bug por completo, não só adicionar mais um parâmetro solto.

**Escopo excluído — `adminFeePercent`:** o card sugeria "considerar
`termMonths`/`adminFeePercent` se vierem do `simulation_result`". Incluí
`termMonths` (mesmo nome/unidade nos dois lados — meses de prazo). **Não**
incluí `adminFeePercent`: o payload do `simulation_result` carrega `adminFee`
em **R$ absolutos** (`offer-mapper.ts:199`, `adminFeeBrl`), enquanto
`adminFeePercent` do grupo é **percentual** (`offer-mapper.ts:143`). Mapear um
pro outro direto seria introduzir um bug novo (unidades incompatíveis) —
verifiquei no código antes de decidir, não assumi.

## D2 (FIX-292) — nome da função mantido (`extractKnownCreditValue`)

**Decisão:** não renomeei `extractKnownCreditValue`/`loadKnownGroupCreditValues`
apesar de agora extraírem mais que só `creditValue`.

**Por quê:** renomear tocaria identificadores só por motivo cosmético (zero
mudança de comportamento), aumentando o diff e o raio de revisão sem benefício
real. Documentei a ampliação de escopo no comentário de topo do arquivo em vez
de mexer no nome.

## D3 (FIX-293) — short-circuit ANTES de `runAgentTurn`, nunca depois

**Decisão:** o novo gate de `isExactnessOrCriteriaQuestion` no caminho NORMAL
(sem tool-error) foi colocado em `orchestrator/index.ts`, **antes** da chamada
a `runAgentTurn` — nunca como um filtro pós-`result`, que é o padrão que o
próprio FIX-282 usa dentro do bloco de tool-error.

**Por quê:** `runAgentTurn` é consumido via `yield* runAgentTurn(...)` — isso
repassa CADA evento (incluindo `text-delta`) pro chamador em tempo real, à
medida que a LLM gera. No caminho de tool-error, o runner deliberadamente NUNCA
emite `text-delta` (comentário explícito no código) — é só por isso que o
FIX-282 consegue interceptar `result.toolErrorThisTurn` DEPOIS e ainda
substituir a resposta a tempo. No caminho normal, o texto livre da LLM já
teria streamado pro usuário antes de qualquer checagem pós-`result` — um
filtro "depois" chegaria tarde demais. Este é o trade-off real que o `_prompt.md`
pedia pra resolver; a resposta veio da leitura do código (como `runAgentTurn`
é consumido), não de uma escolha de gosto — por isso não parei em
`AskUserQuestion`.

## D4 (FIX-293) — reaproveita `buildToolErrorRecoveryExactnessFallback`/`isExactnessOrCriteriaQuestion` sem renomear

**Decisão:** o novo call-site em `index.ts` importa e chama as MESMAS funções
de `directives.ts` já usadas pelo FIX-282 (tool-error). Não criei uma função
irmã nem renomeei as existentes.

**Por quê:** o comportamento desejado é idêntico nos dois pontos de entrada —
mesma pergunta, mesma resposta determinística, mesmo escopo estreito de regex
(falso-negativo preferível a falso-positivo, decisão já travada no FIX-282).
Duplicar a função só pra ter um nome "mais correto" (sem "ToolError" no nome)
violaria a regra de não introduzir abstração além do necessário — e o card
só pedia renomear "se deixar de ser exclusiva de tool-error" **como
necessidade**, não como obrigação incondicional. A regressão do FIX-282
(`directives.test.ts` + `index.fix-282-honestidade-toolerror.integration.test.ts`)
segue 100% verde e intocada — prova que reaproveitar não quebrou o caminho já
validado.

## D5 (FIX-293) — condição de disparo espelha exatamente a do FIX-282

**Decisão:** o novo short-circuit exige `isUserTurn && meta.revealCompleted
=== true && isExactnessOrCriteriaQuestion(userText) && typeof
meta.recommendedOffer?.creditValue === "number"` — as MESMAS 4 condições que
o bloco de tool-error já usa (linha ~563-567 de `index.ts`).

**Por quê:** manter a paridade evita um comportamento "mais permissivo" no
caminho normal do que no caminho de erro (o que seria uma inconsistência nova).
`revealCompleted` continua sendo o guard que impede a pergunta de disparar
antes de existir algo pra justificar.

## D6 (FIX-293) — REGRA DURA no system-prompt é reforço, não a correção primária

**Decisão:** a nova regra em `system-prompt.ts` ("NUNCA alegue estado do
grupo sem tool-output") cobre o caminho residual — perguntas fora do padrão
regex de `isExactnessOrCriteriaQuestion` que ainda chegam à LLM em texto
livre. A correção primária (que resolve o cenário EXATO do veredito, turnos
8-9 do probe-i2) é o short-circuit determinístico (D3).

**Por quê:** o escopo do regex é deliberadamente estreito (mesma decisão do
FIX-282) — nem toda pergunta de justificativa vai casar. Pra essas, o prompt
segue sendo a única defesa disponível; documentei isso como reforço de
segunda linha, não como o fix principal.
