---
id: FIX-339
titulo: "P0 — turno morto pós-CPF: 'Já vou buscar as melhores opções' e a conversa PARA (3 de 4 jornadas)"
status: todo
bloco: bloco-c-whatsapp-invariantes
arquivos:
  - src/lib/whatsapp/adapter.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1
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
