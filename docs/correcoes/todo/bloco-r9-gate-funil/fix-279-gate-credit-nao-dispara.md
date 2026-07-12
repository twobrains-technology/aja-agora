---
id: FIX-279
titulo: "Analyzer preenche creditMax no turno de desire e pula o gate credit (agulha nunca aparece)"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-r9-gate-funil
arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/turn-analyzer.ts
rodada: "2026-07-12 loop r9 onda 1 (baseline Sonnet 3/10)"
---
## Palavras do juiz (veredito r9, Sonnet 5 — G3, Funcional 5/10)
> "em nenhuma das 5 conversas o artifact `gate:credit` aparece. A busca (`search_groups`)
> dispara direto no turno seguinte ao `[ação gate] CPF e celular`, usando um valor
> (`rawCreditValue`) que o analisador de turno (`turn-analyzer.ts`) já extraiu de uma menção
> livre e aproximada no turno do `desire` (ex.: 'Um apartamento de uns 250 mil', 'Uma SUV, uns
> 150 mil') — bem antes do ponto em que o canônico manda coletar 'só o valor' via agulha
> dedicada."

## Cenário exato
- **Rota/tela:** chat web, gate `desire` (logo após o nome) até o gate `credit` (agulha,
  esperado logo após `identify`).
- **Passos:** 5/5 dossiês — usuário menciona bem + valor aproximado NO MESMO turno do
  `desire` (antes de `identify`/`credit` rodarem). Depois disso, o gate `credit` nunca aparece
  e a busca dispara direto após `identify`.
- **Consequência colateral (madalena turno 7):** quando o roteiro-gabarito manda a
  mensagem esperada *"Valor do bem: R$ X"* (esperando responder ao gate `credit`, que nunca
  apareceu), o sistema já trata como AJUSTE pós-reveal — o agente promete *"Só um instante
  que eu confirmo esse novo valor... e te trago o detalhamento atualizado"* mas nunca re-emite
  o card (só um `simulate_quota` silencioso) — promessa quebrada.

## Esperado × Atual
- **Esperado** (`docs/jornada/jornada-canonica.md:159`, item P4 — marcado ✅ RESOLVIDO no web
  por FIX-115): "Componente de valor = só a AGULHA do valor do bem" — o gate `credit` deveria
  SEMPRE emitir `kind:"slider"` antes da busca real.
- **Atual:** em 0/5 dossiês o artifact `gate:credit` aparece — o valor já está preenchido
  antes de a agulha rodar.

## Root cause (INVESTIGADO — provado no código)
`qualify-state.ts:88` (`nextGate()`): `if (q.creditMax === undefined) return "credit";` só
dispara o gate enquanto `creditMax` está `undefined`. O bug está em QUANDO `creditMax` deixa
de ser `undefined`: `analyze.ts` (`analyzeAndMerge`, chamado em **todo** turno de usuário, não
só quando `credit` é o gate ativo) faz o merge em `analyze.ts:94`:
```ts
if (sourceCreditMax !== null && (q.creditMax === undefined || isRevealRefit)) {
  ...
  q.creditMax = creditMax;
  ...
}
```
`sourceCreditMax` vem de `analysis.creditMax`, extraído pelo LLM `analyzeTurn`
(`turn-analyzer.ts`) de **qualquer** texto livre do turno, **sem checar se `credit` é o gate
ativo no momento**. Os próprios exemplos do prompt do analyzer (`turn-analyzer.ts:164-166`)
mostram extração de `creditMax` em turnos que na prática são de `desire` (ex.: "quero comprar
um carro de uns 80 mil em 2 anos" → `creditMax: 80000` no mesmo turno em que caberia
`desiredItem`/`motivation`). Resultado: se o usuário der o valor do bem junto com o desire
("apê de 250 mil"), `q.creditMax` já fica setado ANTES de `credit` virar o gate ativo —
quando `nextGate()` chega em `qualify-state.ts:88`, a condição já é falsa e o gate nunca
aparece.

**Prova comparativa — a mesma classe de bug JÁ foi corrigida para outro campo, mas não para
`creditMax`:** `analyze.ts:140` — o merge de `hasLance` tem exatamente o guard que falta
aqui: `if (analysis.hasLance && !q.hasLance && activeGateAtTurnStart === "lance")` — só aceita
a captura quando o gate `lance` é o REALMENTE ativo no turno (comentário do próprio FIX-236
explica o bug gêmeo de "captura oportunista irrestrita"). Esse guard nunca foi replicado pro
merge de `creditMax` (linha 94), que segue aceitando de qualquer turno. `activeGateAtTurnStart`
já é calculado no início da função (`analyze.ts:42`) — está disponível, só não é usado no
branch de `creditMax`.

**Sobre a promessa quebrada (madalena t7):** quando o roteiro reafirma o valor DEPOIS que a
busca/reveal já rodou com o valor pré-preenchido, `isRevealRefit` (`analyze.ts:61-65` — exige
`revealCompleted===true` + intent `providing_info` + valor diferente do último) passa a tratar
a repetição como um AJUSTE de faixa pós-reveal — correto SE fosse de fato uma troca de faixa,
mas aqui é só o usuário respondendo (tarde demais) o que deveria ter sido o gate `credit`
original. O mecanismo exato de por que o card não é re-emitido nesse caminho
(`revealValueTargetChanged`/`tool-policy.ts:104-109` deveria reabrir
`DISCOVERY_AND_REVEAL_CARDS`) **não foi isolado neste card** — é consequência observada no
veredito, não rastreada linha-a-linha até uma causa determinística; a correção primária
(não setar `creditMax` fora do gate `credit`) previne o cenário por completo, porque a agulha
vai aparecer ANTES do reveal, eliminando a necessidade do "ajuste" pós-hoc para este padrão de
conversa.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| **RECOMENDADO:** replicar o guard do FIX-236 (`activeGateAtTurnStart`) pro merge de `creditMax` — só aceitar a captura oportunista de valor quando `credit` é o gate ativo NO turno (preservar `isRevealRefit` como exceção separada, já legítima pós-reveal) | `analyze.ts:86-118` (usa `activeGateAtTurnStart`, já calculado na linha 42) |
| Alternativa aceitável (se a anterior tiver efeito colateral): quando `isRevealRefit` disparar por um valor que originalmente veio do turno de `desire` (nunca passou pelo gate `credit`), re-emitir o `recommendation_card`/`comparison_table` no mesmo turno do ajuste — nunca só o `simulate_quota` silencioso | `orchestrator/index.ts` (branch `nextGateToFire === "search"`, linha ~520) |
| Preservar `desiredItem`/`motivation` (captura oportunista do FIX-233) intocados — só `creditMax` precisa do guard novo | `analyze.ts` (não mexer nos blocos de desiredItem/motivation) |

## Regressão exigida
- **Unitário** (`analyze.test.ts` ou novo `analyze.fix279.test.ts`): turno de `desire`
  contendo bem + valor numérico juntos (ex.: "Um apartamento de uns 250 mil") ANTES de
  `identityCollected`/gate `credit` ativo → `q.creditMax` permanece `undefined` após o merge
  (a captura é rejeitada); `nextGate()` no turno seguinte continua retornando `"credit"`.
- Teste confirmando o caminho LEGÍTIMO intacto: turno respondendo AO gate `credit` já ativo
  (ex.: "200 mil") → `q.creditMax` é setado normalmente.
- (Camada 2/cassette, se o executor optar pela alternativa de re-emissão) trajetória cobrindo
  o "ajuste pós-hoc" reemitindo o card em vez de só simular silenciosamente.
