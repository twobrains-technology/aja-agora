---
slug: fix-artifact-selado-inert-booleano
titulo: Card antigo selado não ficava realmente inert (inert="" vira false em React 19)
status: done
severidade: media-baixa
executado_em: 2026-06-21
commit: (test+fix inline — QA noturno profundidade de negócio)
mexe_em:
  - src/components/chat/artifact-renderer.tsx
  - src/components/chat/artifact-renderer.sealing.test.tsx
---

# Bug — selo de card antigo (FIX-49) furado: `inert=""` vira `false` em React 19

## Cenário (achado no browser real)
Durante a jornada de descoberta (chat teatro), o console acusou:
`Received an empty string for a boolean attribute 'inert'. This will treat the
attribute as if it were false.` (React 19, ao montar o simulador / cards do histórico).

## Causa
`src/components/chat/artifact-renderer.tsx:38` selava o card fora do turno ativo com
`inert=""` (string vazia). O intuito (FIX-49) é tornar cards do histórico read-only —
não só pro mouse (`pointer-events-none`), mas pra **teclado/foco/screen-reader** via o
atributo booleano `inert`. Em **React 19**, prop booleana com string vazia (`inert=""`)
é tratada como `false` e o atributo **não é renderizado** no DOM → o card antigo
continua alcançável por Tab/SR e re-clicável por teclado (vetor de re-disparo da ação,
cruza com FIX-48/FIX-49). O `pointer-events-none` mascarava o furo só pro mouse.

## Esperado × Atual
- **Esperado:** wrapper `[data-sealed]` tem o atributo `inert` (boolean) presente.
- **Atual (antes):** `inert=""` → React não renderiza o atributo → `hasAttribute("inert") === false`.

## Regressão (TDD — Camada 1, bug de UI puro não-agêntico)
`src/components/chat/artifact-renderer.sealing.test.tsx` — novo caso
"active=false → wrapper REALMENTE inert". Visto FALHAR (`expected false to be true`)
antes do fix, VERDE depois. Os 2 casos antigos (data-sealed/aria-disabled/pointer-events)
seguem verdes.

## Fix
`inert=""` → `inert={true}` (e removido `@ts-expect-error` obsoleto: React 19 já tipa
`inert?: boolean`). Sem novo erro de typecheck.
