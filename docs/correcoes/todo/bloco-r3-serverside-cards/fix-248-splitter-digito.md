---
id: FIX-248
titulo: "Valor monetário quebrado em 2 bolhas ('Juntando R$ 4.' | '000,00/mês')"
status: todo
bloco: bloco-r3-serverside-cards
arquivos: [src/lib/agent/orchestrator/sanitizer.ts]
rodada: 2026-07-10 rodada 3 (Fable r2, gap NOVO N1 P0)
---

## Gap (veredito Fable r2, N1 — NOVO P0)
"Juntando R$ 4." ‖ "000,00 por mês" — 2× ao vivo. `splitSegments`/`lastBoundaryIndex`
(`sanitizer.ts:163`) tratam o PONTO DE MILHAR como fim de frase e quebram o valor em duas bolhas.
Superfície criada pela narração do FIX-241 (âncora de dinheiro).

## Correção
- Guarda de dígito no splitter: um "." entre dígitos (milhar) ou seguido de dígitos NÃO é fronteira
  de sentença. Só quebrar em ". " seguido de maiúscula/fim real.

## Regressão (TDD)
- "Juntando R$ 4.000,00 por mês" NÃO é quebrado (1 bolha).
- frases reais ainda quebram corretamente.
