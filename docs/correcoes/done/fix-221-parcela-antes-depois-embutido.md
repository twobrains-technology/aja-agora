---
id: FIX-221
titulo: "Parcela antes/depois da contemplação no card + corrigir rótulo mentiroso + 'embutido = recebe menos' explícito (modelo AMORTIZA)"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-cards-recomendacao
arquivos:
  - src/lib/consorcio/contemplation-dial.ts
  - src/components/chat/artifacts/contemplation-dial.tsx
  - src/components/chat/artifacts/simulation-result.tsx
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 4.2, P0) + inbox 2026-07-02-dial-parcela-apos-lance-identica
commit: 5f84473
executado_em: 2026-07-04
---
## Palavras do operador
> Ata 4.2: *"Mostrar parcela antes e depois da contemplação (ex.: 6.800 até contemplar → cai pra ~800 depois de dar o lance). Indispensável. Deixar claro que usar lance embutido = receber menos dinheiro da carta."*

## Cenário exato
- Card/simulador de uma cota com lance: mostrar **parcela até contemplar** e **parcela depois de contemplar** (que cai por causa do lance).
- Bug do inbox: com lance **100% embutido**, a "parcela depois" aparece **idêntica** à de antes, mas rotulada "menor, depois do lance".

## Esperado × Atual
- **Esperado:** a parcela pós-contemplação **cai** quando há lance (recurso próprio + embutido amortizam o saldo); o card mostra as duas parcelas (antes → depois) e enuncia que **usar embutido = recebe menos crédito**.
- **Atual:** só o `ownCashValue` (dinheiro) abate o saldo; o `embeddedBidValue` (embutido) **não** abate → lance 100% embutido: parcela depois === parcela antes, com rótulo "menor" mentindo.

## Root cause (INVESTIGADO)
- `contemplation-dial.ts:113-118`:
  ```
  remainingBalance = monthlyPayment * remainingMonths - ownCashValue
  paymentAfterContemplation = max(0, remainingBalance) / remainingMonths
  ```
  Só `ownCashValue` abate; `embeddedBidValue` só reduz o `receivedCredit` (`:106`), não a dívida (`:108-112`, intencional hoje).
- Consequência: `ownCashPct=0` → `ownCashValue=0` → `paymentAfterContemplation===monthlyPayment`.
- Rótulo estático "menor, depois do lance" hardcoded em `contemplation-dial.tsx:274` (não condicional).
- Parcela antes/depois **já existem juntas** no grid `contemplation-dial.tsx:253-276` ("Até contemplar" `:259` / "Após receber" `:271-273`).
- Copy parcial de "recebe menos" em `simulation-result.tsx:160-163` (`receivedCredit`), sem o enunciado explícito.

## Decisão de produto (T2 — RESOLVIDO por ora: AMORTIZA)
A Ata decide (ex. 6.800 → ~800 após o lance) que o **lance abate o saldo** → parcela pós **cai**.
⚠️ Isto **INVERTE** o modelo atual do código + `CONTEXT.md` D18/C4 + `system-prompt.ts:222` (que dizem
"embutido reduz crédito, não dívida"). **PENDENTE-Bernardo validar o número exato antes de prod.**

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Incluir `embeddedBidValue` no abatimento do saldo (modelo AMORTIZA) → `remainingBalance = monthlyPayment*remainingMonths − (ownCashValue + embeddedBidValue)` | `contemplation-dial.ts:113-118` |
| Atualizar os testes/prompt que assumiam o modelo antigo (TDD, **não** skip) + registrar a inversão no ADR | `contemplation-dial.*.test.ts`, `system-prompt.ts:222`, ADR do bloco |
| Rótulo **condicional**: só dizer "menor" quando a parcela depois for de fato menor | `contemplation-dial.tsx:274` |
| Enunciado explícito "usar lance embutido = você recebe menos dinheiro da carta" | `simulation-result.tsx:160-163` e/ou card |
| Consolidar "parcela antes → depois" **dentro do card** de recomendação (portar o bloco do dial) | `recommendation-card.tsx` (portar `contemplation-dial.tsx:253-276`) |

## Regressão exigida (TDD strict)
1. Teste que, com lance embutido > 0, `paymentAfterContemplation < monthlyPayment` (não idêntica).
2. Teste que o rótulo só diz "menor" quando de fato menor (nunca mente).
3. Teste do enunciado "recebe menos" presente na opção com embutido.
4. Teste que o card de recomendação mostra parcela **antes** e **depois**.
5. ⚠️ Deixar um marcador claro no `.done/` + ADR: **PENDENTE-Bernardo** validar o número do modelo amortização.

## Implementação (2026-07-04)

- `contemplation-dial.ts`: `remainingBalance` agora subtrai `(ownCashValue + embeddedBidValue)` — o lance TOTAL amortiza o saldo pós-contemplação. Nova função `paymentAfterLabel` (fonte única do rótulo — nunca diz "menor" se o número não caiu de fato).
- `contemplation-dial.tsx`: rótulo "Após receber" usa `paymentAfterLabel` (era hardcoded "menor, depois do lance").
- `recommendation-card.tsx`: novo bloco "Até contemplar → Após receber" (portado do dial, mesmo motor puro, mês-âncora heurístico quando não há `referenceMonth` real) + enunciado fixo de que o embutido reduz o crédito recebido.
- `simulation-result.tsx`: enunciado "recebe menos crédito da carta agora" explícito na seção de lance embutido.
- `system-prompt.ts`: LOOP CONVERSACIONAL do simulador atualizado pra narrar o modelo AMORTIZA (nunca mais "a parcela não muda").
- Testes do modelo antigo (`contemplation-dial.test.ts`, `contemplation-dial.oferta-real.test.ts` (lib+componente), `tests/regression/agent-trajectory.test.ts`) reescritos pro modelo AMORTIZA — nenhum skip.
- **Inversão + PENDENTE-Bernardo já registrados** em `docs/decisoes/blocos/2026-07-04-ata-mudancas-aja.md` (seção "Lance embutido AMORTIZA a dívida — T2").
