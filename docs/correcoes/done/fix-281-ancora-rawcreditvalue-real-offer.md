---
id: FIX-281
titulo: "Âncora rawCreditValue do real_offer (fechamento) vem do creditValue da última oferta, não do pedido original — divergência CDC silenciada/sub-representada"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-r9-2-anchor-fechamento
arquivos:
  - src/lib/bevi/contract-input.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/contract-input.test.ts
  - src/lib/bevi/fulfillment.test.ts
rodada: "2026-07-12 loop r9 ONDA 2 (pós-onda-1 Sonnet 4/10, gap G-A)"
---
## Palavras do juiz (veredito r9pos, Sonnet 5 — G-A, Cálculo 5/10 + UI/Compliance 6/10)
> "o campo `rawCreditValue` que alimenta o aviso de divergência não é propagado corretamente até
> o `real_offer` (o card do fechamento, onde o compromisso é assinado) [...] Em mario, o campo
> simplesmente não existe [...] em madalena, o campo existe mas aponta pro valor errado (260.173,
> o `creditValue` do reveal anterior — não os 250.000 que a cliente pediu de fato)."
> — `.processo/loop/evidencias-r9/veredito-r9pos-sonnet.md` §3, G-A

## Cenário exato
- **Rota/tela:** chat web, passo 5.1 (`real_offer`, card de fechamento — `contract-submit`).
- **Passos:** qualificação → `gate:credit` (valor pedido) → reveal (`recommendation_card` com
  `rawCreditValue` correto) → decisão → `contract_form` → `contract-submit` → `real_offer`.
- **Dados usados:** dossiês `madalena-junta` (pedido 250.000, reveal `creditValue`=260.173,
  fechamento `creditValue`=263.864) e `mario-sem-lance` (pedido 70.000, fechamento
  `creditValue`=71.043) — `.processo/loop/evidencias-r9/dossies-r9pos/`.

## Esperado × Atual
- **Esperado:** o `real_offer` compara o valor REALMENTE pedido pelo cliente (o mesmo
  `rawCreditValue` que já aparece correto no hero `recommendation_card`, âncora em
  `meta.qualifyAnswers.creditClampedFrom ?? meta.qualifyAnswers.creditMax`) com a carta REAL do
  fechamento — mesmo padrão que `real-offer.tsx:85-100` já implementa corretamente no componente.
- **Atual:**
  - **mario:** `real_offer.payload` = `{"creditValue": 71043, ...}` — **sem `rawCreditValue`**,
    apesar do pedido original (70.000) divergir +1,5% da carta.
  - **madalena:** `real_offer.payload` = `{"creditValue": 263864, ..., "rawCreditValue": 260173}`
    — o campo existe, mas 260.173 é o `creditValue` do REVEAL anterior (turno 7), não o pedido
    original da cliente (250.000). O aviso, se renderizar, sub-representaria a divergência real
    (250k→263.864 = +5,55%) como se fosse só 1,4% (260.173→263.864).

## Root cause (INVESTIGADO — provado no código)
`src/lib/bevi/contract-input.ts:57-61` (`buildStartContractInput`):
```ts
const valor =
    (offerMatchesCurrentAdmin ? meta.recommendedOffer?.creditValue : undefined) ??
    q.creditMax ??
    q.creditMin ??
    50000;
```
Este `valor` tem DOIS papéis conflados na mesma variável:
1. **Âncora de matching da oferta** (correto, FIX-73: reusar `recommendedOffer.creditValue` —
   NUNCA `creditMax` — pra não trocar de carta no fechamento). **Este uso está certo e NÃO deve
   mudar.**
2. **Fonte do aviso CDC de divergência** — via `fulfillment.ts:150-157`
   (`StartContractResult.requestedCreditValue = input.valor`, o mesmo `valor` acima) →
   `closing-presentation.ts:79-86` (`rawCreditValue: result.requestedCreditValue`, só quando
   diverge de `offer.creditValue`). **Este uso está ERRADO**: `valor` já é o `creditValue` da
   ÚLTIMA oferta vista (não o pedido original), então:
   - Em **mario**: `startContract` re-simula com `valor = recommendedOffer.creditValue` — o
     `offer.creditValue` resultante fica igual/muito próximo desse mesmo número → o teste
     `Math.round(requestedCreditValue) !== Math.round(offer.creditValue)`
     (`closing-presentation.ts:83-84`) dá FALSE → chave `rawCreditValue` **omitida**.
   - Em **madalena**: o resultado do re-simulate diverge um pouco (263.864 vs 260.173) → a chave
     entra, mas com o número ERRADO (o creditValue do reveal, não o pedido original).

O HERO (`recommendation_card`) já resolve isso CORRETAMENTE — fonte diferente, própria pra essa
finalidade: `src/lib/agent/orchestrator/runner.ts:656-665`:
```ts
// FIX-261: valor PEDIDO pelo usuário — mesma precedência do FIX-68
const requestedCreditValue =
    meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax;
payload = coerceRecommendationPayload(input, revealGroupsById, await getAdministradoraLogos(), requestedCreditValue);
```
O componente (`real-offer.tsx:85-104`) está correto e é agnóstico à fonte — ele só renderiza o
que chegar em `rawCreditValue`/`creditValue`. O bug é 100% upstream: `contract-input.ts`/
`fulfillment.ts` nunca usam a MESMA âncora do hero (`creditClampedFrom ?? creditMax`) pro
fechamento — usam o `creditValue` da oferta (variável certa pro OUTRO propósito).

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Adicionar um campo NOVO e independente `originalRequestedCreditValue?: number` ao `StartContractInput`, calculado com a MESMA precedência do hero (`meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax`) — **sem tocar** no cálculo existente de `valor` (que continua servindo só o matching da oferta, FIX-73) | `contract-input.ts` (`buildStartContractInput`) |
| `StartContractInput`: adicionar o campo ao tipo. `startContract`: computar `requestedCreditValue: input.originalRequestedCreditValue ?? input.valor` (fallback pro `valor` antigo quando o campo novo vier ausente — degradação graciosa, D11) em vez de `input.valor` puro | `fulfillment.ts` (interface `StartContractInput`, função `startContract`, linha ~154) |
| Nenhuma mudança — `closing-presentation.ts` já consome `result.requestedCreditValue` corretamente; o bug estava 100% em QUAL valor chegava nesse campo | (confirmar com teste, não mexer) |
| Nenhuma mudança — `route.ts`/`whatsapp/contract-capture.ts` já destructuram `requestedCreditValue` do resultado; passam a receber o valor CERTO automaticamente | (confirmar com teste, não mexer) |

## Regressão exigida
- `contract-input.test.ts`: novo caso que prova `buildStartContractInput` popula
  `originalRequestedCreditValue` a partir de `creditClampedFrom ?? creditMax` (não de
  `recommendedOffer.creditValue`), com um cenário onde os dois valores DIVERGEM (ex.: pedido
  250.000, `recommendedOffer.creditValue` 260.173) — TDD strict: falha hoje (campo não existe),
  passa depois.
- `fulfillment.test.ts`: novo caso ponta-a-ponta que pina os DOIS números (pedido original ×
  carta final do `startContract`) através do fluxo completo — reproduz literalmente o cenário do
  mario (pedido 70.000, carta 71.043, `rawCreditValue` DEVE aparecer com valor 70.000) e da
  madalena (pedido 250.000, carta 263.864, `rawCreditValue` DEVE ser 250.000, nunca 260.173).
- Rodar `pnpm test:unit` completo pra garantir que nenhum teste existente dependia do
  `requestedCreditValue == input.valor` antigo.
