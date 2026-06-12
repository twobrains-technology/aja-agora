---
id: FIX-37
titulo: "Card de decisão quebra o layout — label 'Quero falar com um especialista da Aja Agora' transborda pra fora do card sem quebrar linha"
status: todo
bloco: bloco-t-ux-chat
arquivos:
  - src/components/chat/artifacts/decision-prompt.tsx
rodada: 2026-06-12 (testes manuais do Kairo no dev, pós-merge PRs #28/#30)
anotado_em: 2026-06-12
---

# FIX-37 — Overflow do label no card de decisão

### Palavras do operador

> "veja o componente quebrando o layout"

### Cenário exato (print, dev 2026-06-12)

Card "Esse plano faz sentido para você? (ITAÚ)" — a terceira opção aparece
como **"Quero falar com um especialista da Aja Agor"**, com o texto cortado
saindo da borda direita do card.

### Root cause INVESTIGADO (provado no código)

- `decision-prompt.tsx:38`: card com `max-w-[340px]`.
- `decision-prompt.tsx:51-67`: os labels renderizam dentro do `Button` do
  shadcn, cuja classe BASE inclui `whitespace-nowrap` — o label longo
  ("Quero falar com um especialista da Aja Agora", definido em
  `DECISION_PROMPT_OPTIONS` no `types.ts`) não cabe em 340px com ícone +
  padding e, sem quebra de linha, transborda; o overflow do card corta.

### Correção proposta

| O quê | Onde |
|---|---|
| Permitir quebra nos botões do card: `whitespace-normal h-auto text-left` (mantém o min-h-[44px] de toque) — OU encurtar o label ("Falar com especialista") se o produto preferir 1 linha | `decision-prompt.tsx` (e `types.ts` se for pelo label) |
| Conferir os outros artifacts com Button + label longo (mesmo padrão nowrap) | varredura rápida em `artifacts/*.tsx` |

### Regressão exigida

- Camada 1: component test — com o label canônico mais longo, o botão não
  excede a largura do card (ou label atualizado coberto por assert de copy).
  Bug de CSS puro — cassette dispensado.
