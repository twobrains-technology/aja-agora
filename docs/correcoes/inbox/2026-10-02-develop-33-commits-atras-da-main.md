---
slug: develop-33-commits-atras-da-main
titulo: "A develop está 33 commits atrás da main — todo trabalho novo nasce sem o A/B"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-10-02 — reconhecimento antes de abrir a worktree do chefe
mexe_em:
  - operação (git), não código
---

## Palavras do operador
> (achado técnico meu, não é fala do dono — registrado porque custa caro se passar)

## Cenário
- **Comando:** `git rev-list --count develop..origin/main` em 02/10/2026
- **Passos:** 1) comparar develop local, origin/develop e origin/main

## Esperado × Atual
- **Esperado:** develop = main (ou à frente), como base de todo trabalho novo.
- **Atual:** `develop..origin/main` = **33**; `origin/main..develop` = **0**. Os PRs #151 (FIX-403, o A/B A+B) e #152 (FIX-404, filtro por braço) foram mergeados **direto na main** e nunca voltaram para a develop. Quem partir da develop hoje reimplementa o A/B ou cria conflito.

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Fluxo de merge: os PRs de correção foram abertos contra `main`. O primeiro passo do trabalho novo tem que ser
**sincronizar a develop com a main** antes de qualquer branch.
