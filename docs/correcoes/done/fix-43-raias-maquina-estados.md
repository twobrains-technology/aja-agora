---
id: FIX-43
titulo: "Redesenho das raias + máquina de estados forward-only"
status: done
commit: 12ebee8
executado_em: 2026-06-14
bloco: bloco-b-funil-raias
arquivos:
  - src/db/schema.ts
  - src/lib/admin/lead-stages.ts
  - src/lib/admin/lead-transitions.ts
rodada: 2026-06-14 — anotação Funil + Cliente unificado + Retorno web (Kairo, voz)
---

# FIX-43 — Raias + máquina de estados forward-only

## Palavras do operador

> *"propor e revisar os passos do funil (as raias)... pode olhar para os passos
> da jornada mas faça algo que faz sentido a nível de mercado também e de
> acionamento. não sou especialista disso, você tem que me ajudar."*

## Cenário / problema

As 7 raias atuais (`schema.ts:33-41`) são razoáveis mas foram desenhadas na era
anterior (pré-Bevi-fonte-única). Falta um modelo explícito que amarre **cada
raia a um gatilho automático** e impeça regressão acidental.

## Root cause investigado (provado no código)

- `schema.ts:33-41` — enum `lead_stage`: novo, engajado, qualificado,
  em_negociacao, proposta_enviada, fechado_ganho, perdido.
- `lead-stages.ts:1-15` — `STAGE_ORDER` cobre só novo/engajado/qualificado; as
  raias finais não têm ordem nem regra de avanço.
- `lead-transitions.ts:19-54` — `transitionLeadStage` tem `onlyAdvance` opcional,
  mas a rota admin não usa (FIX-44 trata).

## Correção proposta

Implementar a tabela de raias **aprovada pelo Kairo** (Parte 2 da proposta). Em
relação ao enum atual, a síntese mantém o vocabulário comercial e formaliza:

| O quê | Onde |
|---|---|
| `STAGE_ORDER` completo (todas as raias + terminais) — base do forward-only | `lead-stages.ts` |
| Ajustes de enum conforme a Parte 2 aprovada — provável **split do fechamento** em `na_administradora` / `contratado_boleto` / `fechado_ganho` (raias 6-8, refletindo mesa→boleto) + possível rename de "Em negociação" | `schema.ts` (migração) |
| `transitionLeadStage` com forward-only como **default** pra atores `system`; `admin` pode mover livre (inclusive marcar terminal) mas a regressão é explícita | `lead-transitions.ts` |

> Se a revisão mantiver o enum atual, este item vira só `STAGE_ORDER` + regra de
> avanço (sem migração de enum). A migração só entra se houver rename/split.

## Regressão exigida (CLAUDE.md)

- **Camada 1 (structural, obrigatória):** `lead-stages.<raias>.test.ts` — asserta
  `STAGE_ORDER` completo e monotônico; enum bate com a proposta aprovada;
  `transitionLeadStage(system, regressão)` é no-op/rejeitada por default.
- **Camada 2 (cassette):** dispensada aqui (sem reação a tool) — a reação a tools
  é do FIX-44.
- **Integration:** `transitionLeadStage` contra DB real (avanço ok, regressão
  system bloqueada, idempotência).
