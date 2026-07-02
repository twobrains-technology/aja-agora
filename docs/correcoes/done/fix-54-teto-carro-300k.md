---
id: FIX-54
titulo: "Simulador de carro limitado a R$ 300k (teto hardcoded por categoria em CREDIT_BOUNDS)"
status: done
bloco: bloco-b-simulador-recomendacao
arquivos:
  - src/lib/agent/qualify-config.ts
  - src/components/chat/artifacts/value-picker.tsx
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
commit: c11c4f3f
executado_em: 2026-06-26
---

# FIX-54 — Carro indo só até R$ 300 mil

## Palavras do operador (docx)
> "Carro - está indo só até 300k"

## Cenário exato
Ao escolher a categoria carro/auto e ajustar o valor do bem, o slider para em R$ 300.000 — não permite valores acima. Carros novos/premium passam disso; o teto está baixo demais para a categoria.

## Root cause investigado (Explore)
- `src/lib/agent/qualify-config.ts:40` — `CREDIT_BOUNDS`:
  ```ts
  auto: { min: 20_000, max: 300_000, step: 10_000, default: 80_000 },
  ```
  `max: 300_000` é o teto. `CREDIT_BOUNDS` é a **fonte única** dos limites: alimenta o slider web (`value-picker.tsx` via `field.max` do payload) e a validação server-side `clampCreditToCategory` (`qualify-config.ts:61-62`).

## Correção proposta
| O quê | Onde |
|---|---|
| Elevar o teto de `auto` para um valor realista (decidir no brainstorming — ex. faixa de carros premium; checar se há valor de referência Bevi/categoria). Manter min/default coerentes. | `qualify-config.ts:40` |
| Confirmar que `value-picker.tsx` reflete o novo max via payload (não há teto duplicado hardcoded no componente). | `value-picker.tsx` |

> Decisão de design: qual o novo teto de carro? Use best practice (faixa real de mercado/categoria Bevi) e registre em `decisions/`. Não inventar número fora de realidade.

## Regressão exigida (3 camadas)
- **Camada 1 (structural, é onde mora):** teste em `qualify-config.test.ts` assertando `CREDIT_BOUNDS.auto.max` >= novo teto definido, e que `clampCreditToCategory` aceita o valor acima de 300k para auto. (bug de config pura — Camada 1 cobre o essencial)
- **Camada 2:** se o teto vazar para um artifact/tool, cassette curto; caso contrário, cross-ref no `agent-trajectory.test.ts`.
