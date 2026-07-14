---
id: FIX-339
titulo: "P0 — turno morto pós-CPF: 'Já vou buscar as melhores opções' e a conversa PARA (3 de 4 jornadas)"
status: done
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/adapter.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
executado_em: 2026-07-14
---

# FIX-339 — o agente promete buscar e não busca

## Cenário (auto, moto, serviços — 3 de 4 jornadas)

> **USUÁRIO:** [CPF]
> **AGENTE:** "Perfeito, recebido! Já vou buscar as melhores opções."
> …e **para**. Nada acontece.

Numa das jornadas o usuário só destravou mandando "não entendi".

## Root cause (provado pelo juiz)

`src/lib/whatsapp/adapter.ts:553` marca `searchDispatched: true` **ANTES** de confirmar que a
busca funcionou. É exatamente o padrão pré-FIX-291, **que já foi corrigido no canal web**
(`src/lib/web/adapter.ts:562-577`) e **nunca foi portado pro WhatsApp**.

## Correção proposta
| O quê | Onde |
|---|---|
| Portar o FIX-291: só marcar `searchDispatched` **depois** que a busca retornou com sucesso; se falhar/degradar, liberar o retry | `whatsapp/adapter.ts:537-559` |

## Regressão exigida
- Integração: pós-CPF no WhatsApp, a busca dispara no MESMO turno e as opções aparecem.
- Integração: busca que falha → `searchDispatched` NÃO fica marcado (retry liberado).

## Execução (2026-07-14)

Porte literal do FIX-291b (`web/adapter.ts:562-577`): `runSearchSummaryWithOrchestrator`
movia o `persistMeta(..., {searchDispatched:true})` de ANTES pra DEPOIS do
`runDirectiveWithOrchestrator`, condicionado a `postSearch.revealCompleted === true`
(recarregado do banco pós-turno). Falha/degradação → loga `[discovery-degraded]` e NÃO marca —
retry liberado no próximo turno.

O disparo do directive em si (`buildSearchSummaryDirective`) não mudou — só a ORDEM de
quando a flag de idempotência é persistida. O guard de turno-mudo (`guardEmptyTurn: true`,
FIX-189) já existia e continua intacto — ele cobre "o turno fechou sem nada visível"; este
fix cobre "o turno falou algo mas a busca não completou de verdade" (dois bugs adjacentes,
mesma família).

Teste novo (`adapter.fix-339-search-dispatched-guard.test.ts`) usa um mock de
`reloadMeta`/`persistMeta` com estado mutável (em vez do `mockResolvedValue` estático do
FIX-189) pra simular o banco de verdade mudando entre as duas leituras — inclui um teste
direto de ORDEM ("nunca marca searchDispatched antes do directive rodar") que reproduz
exatamente a causa raiz. TDD confirmado via `git stash` (RED nos 2 casos que provam o bug,
GREEN após o fix). Suíte completa de `src/lib/whatsapp/` (278 testes) sem regressão.
