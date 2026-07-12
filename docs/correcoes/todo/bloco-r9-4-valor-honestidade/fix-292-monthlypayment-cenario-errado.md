---
id: FIX-292
titulo: "monthlyPayment fica do cenário errado mesmo após o FIX-287 corrigir o creditValue por groupId"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-r9-4-valor-honestidade
arquivos:
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/agent/tools/known-credit-values.ts
rodada: "2026-07-12 loop r9 ONDA 4 (pós-onda-3 4/10, P1 Cálculo, veredito-r9pos3-sonnet.md §3)"
---
## Palavras do juiz (veredito r9pos3, Sonnet 5 — P1 Cálculo)
> "recommendation_card = {creditValue:150000, monthlyPayment:3549.75}; simulation_result =
> {creditValue:211258, monthlyPayment:5136.66} (MESMO groupId); comparison_table (mesmo turno) =
> {creditValue:211258, monthlyPayment:3549.75} — creditValue corrigido, monthlyPayment do cenário
> ERRADO, dentro do MESMO artifact."
> — `.processo/loop/evidencias-r9/veredito-r9pos3-sonnet.md` §3 (probe-i3-fabricacao, turno 7,
> groupId `6a3e6cec419653c0a99937aa`)

## Cenário exato
- **Rota/tela:** chat, reveal de um grupo já simulado anteriormente na MESMA conversa (o
  `known-credit-values` já tem o `creditValue` real desse groupId).
- **Passos:** `recommend_groups`/`search_groups` retorna o grupo pela estimativa do índice de
  busca; `simulate_quota` já rodou antes no mesmo turno/conversa pro MESMO groupId; o
  `comparison_table` do turno corrige o `creditValue` pro real (211258) mas mantém o
  `monthlyPayment` da estimativa antiga (3549.75, que correspondia ao `creditValue` de 150000).
- **Dados usados:** `dossie.json` probe-i3-fabricacao, turno 7.

## Esperado × Atual
- **Esperado:** todos os campos financeiros de um mesmo artifact (creditValue, monthlyPayment,
  adminFeePercent, termMonths) descrevem o MESMO cenário real — se `creditValue` é corrigido pro
  valor conhecido, `monthlyPayment` tem que vir do MESMO cenário (proporcional/real), não da
  estimativa que gerou o `creditValue` antigo.
- **Atual:** só `creditValue` é sobrescrito; `monthlyPayment` fica órfão, descrevendo um crédito
  que não é mais o exibido.

## Root cause (INVESTIGADO — provado no código)
- `coerceRevealCota` (`src/lib/agent/orchestrator/recommendation-payload.ts:82-148`, usada tanto
  pelo hero via `coerceRecommendationPayload` quanto pelo seletor via `coerceComparisonPayload`,
  linhas 236-259) primeiro copia `creditValue`/`monthlyPayment`/`termMonths` do índice de busca
  (estimativa, linhas 121-123), depois — bloco FIX-287, linhas 133-145 — checa se existe um
  `knownReal` (`knownCreditValueByGroupId.get(id)`) que diverge do `creditValue` da estimativa e,
  se sim, **sobrescreve SÓ `out.creditValue = knownReal`** (linha 144). `out.monthlyPayment`
  NUNCA é tocado nesse bloco — continua com o valor calculado pra estimativa antiga
  (`creditValue` errado), agora dessincronizado do `creditValue` real recém-corrigido.
- A fonte do "conhecido" também está incompleta na origem: `extractKnownCreditValue`
  (`src/lib/agent/tools/known-credit-values.ts:19-34`) extrai e mapeia **só**
  `{groupId, creditValue}` de um `simulation_result` já persistido — nunca captura
  `monthlyPayment` (nem `termMonths`/`adminFeePercent`), então mesmo se `coerceRevealCota`
  quisesse corrigir `monthlyPayment` junto, a fonte única (`known-credit-values.ts`) não carrega
  esse dado pra ele usar.
- Root cause: a "fonte única de creditValue por groupId" do FIX-287 é literalmente única PRA
  creditValue — não existe uma fonte única equivalente pra `monthlyPayment` (nem os demais campos
  simulados), então a correção parcial do FIX-287 criou uma inconsistência NOVA dentro do mesmo
  artifact em vez de resolver o problema por completo.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `extractKnownCreditValue`/o loader de conhecidos passam a capturar TAMBÉM `monthlyPayment` (e considerar `termMonths`/`adminFeePercent` se vierem do `simulation_result`) por groupId — vira `known-credit-values.ts` uma fonte única multi-campo, não só creditValue | `src/lib/agent/tools/known-credit-values.ts` (função de extração + o Map/loader que ela alimenta) |
| `coerceRevealCota` (bloco FIX-287, `recommendation-payload.ts:133-145`) — quando sobrescrever `creditValue` pelo conhecido, sobrescrever `monthlyPayment` (e os demais campos disponíveis) do MESMO registro conhecido, nunca deixar um campo do cenário antigo ao lado de um campo do cenário novo | `recommendation-payload.ts` (~133-148) |
| Assinatura de `coerceRevealCota`/`coerceRecommendationPayload`/`coerceComparisonPayload` que recebem `knownCreditValueByGroupId` precisam do tipo do Map ampliado (`{creditValue, monthlyPayment, ...}` em vez de só `number`) — atualizar os 3 call-sites (`runner.ts:693-714`, e onde mais chamar) | `recommendation-payload.ts` + `runner.ts` (assinatura, não lógica de negócio) |

## Regressão exigida
- Novo teste (unit, `recommendation-payload.fix-292-monthlypayment-consistente.test.ts`): monta
  `knownCreditValueByGroupId` com `{groupId, creditValue: 211258, monthlyPayment: 5136.66}`, chama
  `coerceRevealCota` com uma cota estimada `{creditValue:150000, monthlyPayment:3549.75}` do MESMO
  groupId — assevera que o resultado tem `creditValue===211258` E `monthlyPayment===5136.66`
  (nunca a mistura antiga).
- Caso de borda: groupId SEM conhecido (nunca simulado) — mantém o comportamento atual
  (estimativa completa, sem sobrescrever nada).
- `pnpm test:unit` verde.
