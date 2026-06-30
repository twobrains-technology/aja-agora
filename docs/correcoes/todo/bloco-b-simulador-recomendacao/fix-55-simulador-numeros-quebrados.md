---
id: FIX-55
titulo: "Simulador não sensível a números quebrados (step de 10k no slider de valor força múltiplos redondos)"
status: todo
bloco: bloco-b-simulador-recomendacao
arquivos:
  - src/lib/agent/qualify-config.ts
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/plan-estimate-picker.tsx
rodada: 2026-06-19 — jornada2_revisão.docx (teste manual Bernardo em ajaagora.com.br)
---

# FIX-55 — Simulador não aceita valores quebrados

## Palavras do operador (docx)
> "O simulador não está sensível a números quebrados, é isso mesmo?"

## Cenário exato
O usuário não consegue informar um valor de bem quebrado (ex. R$ 347.500). O slider só permite múltiplos de R$ 10.000 (80k, 90k, 100k…), forçando arredondamento. O stakeholder percebeu e questionou.

## Root cause investigado (Explore)
- `src/lib/agent/qualify-config.ts:40` — `auto: { …, step: 10_000, … }`. O `step` do slider de valor do bem é 10.000 → só múltiplos de 10k.
- `src/components/chat/artifacts/plan-estimate-picker.tsx:229` — step do lance: `payload.credit.step / 10 >= 100 ? Math.round(payload.credit.step / 10) : 100` → ~1.000, mas o valor base do bem já vem quantizado a 10k.
- `value-picker.tsx` usa o `Slider` (shadcn) respeitando exatamente o `step` do payload.

## Correção proposta
| O quê | Onde |
|---|---|
| Permitir valores quebrados. Decidir no brainstorming entre: (a) reduzir o `step` (ex. 1.000), e/ou (b) adicionar **input numérico livre** ao lado do slider para o usuário digitar o valor exato (recomendado — slider para faixa rápida + input para precisão). | `qualify-config.ts` (step), `value-picker.tsx` (input livre) |
| Ajustar o step do lance em `plan-estimate-picker.tsx` para acompanhar a nova granularidade. | `plan-estimate-picker.tsx:229` |
| Garantir que o valor digitado livre passe pela validação `clampCreditToCategory` (min/max da categoria) sem re-quantizar para múltiplo de 10k. | `qualify-config.ts` / `value-picker.tsx` |

> Decisão de design: reduzir step vs adicionar input livre vs ambos. Registre em `decisions/`. Mobile-first: input numérico tem que ser confortável no celular.

## Regressão exigida (3 camadas)
- **Camada 1:** teste assertando que um valor quebrado (ex. 347_500) sobrevive a `clampCreditToCategory` para auto sem virar múltiplo de 10k; e que o `step` configurado permite granularidade fina. `qualify-config.test.ts`.
- **Camada 2 (component):** teste do `value-picker.tsx` (e/ou `plan-estimate-picker.tsx`) garantindo que o input livre aceita e propaga um valor quebrado.
