---
id: FIX-107
titulo: "Web: trocar value_picker complexo por agulha/slider simples 1k em 1k (valor do bem)"
status: done
bloco: bloco-web-valor-agulha
commit: f2a8247e  # test+feat: troca seletor de valor da web por agulha simples de 1k (branch feat/web-valor-agulha-simples)
executado_em: 2026-06-29
arquivos:
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/components/chat/artifacts/value-picker.fix-107.test.tsx
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> "na web temos que trocar por um de agulha simples de 1k em 1k - acho que ate ja temos"

## Cenário exato
Na web, o valor do bem era coletado por componentes COMPLEXOS (o `value_picker` /
`ValuePicker` com 3 sliders interligados valor/parcela/prazo — FIX-16 — e recálculo
ao vivo). O Kairo quer um slider SIMPLES de R$ 1.000 em R$ 1.000 só pro valor do bem.

## Root cause investigado
- `src/components/chat/artifacts/value-picker.tsx` = o componente complexo (3 sliders
  interligados via engine `value-picker-link`, selo de estimativa de parcela).
- `src/components/chat/artifacts/plan-estimate-picker.tsx` = candidato ao "já temos",
  porém **NÃO** é a agulha simples: é o gate "Planeje sua conquista" (valor + segmented
  "o que mais importa" + prazo + lance/embutido). É o gate de valor REAL da entrada hoje
  (`adapter.ts` → `kind: "plan"`). Reaproveitá-lo traria de volta a complexidade (prazo,
  intenção) que a revisão da jornada está REMOVENDO. → cai no "senão, simplifique o
  `value-picker.tsx`".
- `src/components/ui/slider.tsx` = slider shadcn base (step configurável).
- `gate-renderer.tsx` → `kind: "slider"` renderizava o `ValuePicker`; é caminho **legacy
  sem emissor** (o gate de valor da entrada é `kind: "plan"`). O artifact `value_picker`
  (tool `present_value_picker`) deixa de ser emitido na entrada (bloco-jornada-entrada).

## Correção entregue
| O quê | Onde |
|---|---|
| `ValuePicker` simplificado → AGULHA ÚNICA do valor do bem, `step={VALUE_STEP}` (1000), formato currency, input livre (FIX-55 preservado) | `value-picker.tsx` |
| Removida a engine de sliders interligados (`identifyLinkRoles`/`recalcLinkedValues`), o selo de estimativa de parcela e a coleta de parcela/prazo na entrada | `value-picker.tsx` |
| `kind: "slider"` (legacy) passa a renderizar a agulha SEM `onSubmit` → manda o valor por TEXTO (valor por conversa), sem inventar `monthlyBudget` falso | `gate-renderer.tsx` |
| `TODO(bloco-jornada-entrada)` nos pontos onde o contrato do que o agente emite muda (parar de emitir `present_value_picker`; `credit` sem `monthlyBudget`/prazo) | `value-picker.tsx`, `gate-renderer.tsx` |

NÃO toquei backend/agent nem o `plan-estimate-picker.tsx` (gate "plan"): a remoção do
prazo / valor-por-conversa nesse componente é coordenada com o bloco-jornada-entrada
(altera o shape `credit` que o backend consome) e foge do escopo do FIX-107.

## Regressão entregue (3 camadas, conforme CLAUDE.md)
- **Camada 1 (structural):** `value-picker.fix-107.test.tsx` assere via source que o
  componente NÃO usa mais `recalcLinkedValues`/`identifyLinkRoles` e usa `step={...1000}`.
- **Camada 2 (componente, happy-dom):** renderiza UM único slider; ArrowRight anda +R$ 1.000
  (80.000 → 81.000) e o submit emite o valor escolhido; sem selo de estimativa / sem
  "parcela"; ignora campos extras (parcela/prazo) do payload legado.
- `value-picker.fix-55.test.tsx` (input livre, valor quebrado) **mantido e verde**.
- Removido `value-picker.linked.test.tsx` (FIX-16) — testava o comportamento interligado
  que a decisão de produto 2026-06-28 substituiu.

## Validação
- `pnpm test:unit` (Camadas 1+2) → **189 arquivos, 1980 testes, 0 falhas** (container com
  Postgres migrado).
- `pnpm biome check` nos arquivos tocados → limpo. `tsc --noEmit` → sem erros nos arquivos.
