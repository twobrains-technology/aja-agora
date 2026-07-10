---
id: FIX-243
titulo: "Agente vende com 'boa taxa de contemplação' (campo proibido) na FALA"
status: done
bloco: bloco-r2-valor-compliance
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/HARD_RULES.md
  - src/lib/agent/hard-rules.ts
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #7)
commit: 9403b65
executado_em: "2026-07-10"
---

## Gap (veredito Fable §D5.2, gap #7)
Texto do agente (B2 T5): "A ITAÚ se destaca pela **boa taxa de contemplação** e uma
taxa de administração de 13,46% — uma das mais baixas da faixa". `taxaContemplacao` é
PROIBIDO (semântica não documentada, spec 05). O guard cobre payload/UI, mas o TEXTO
do LLM vazava o conceito como argumento de venda; "uma das mais baixas da faixa" é
claim comparativo sem fonte exibida.

## Correção
- `sanitizer.ts`: `isTaxaContemplacaoClaim` — padrão `/\btaxa\s+de\s+contempla[çc][ãa]o\b/i`
  dropa o segmento inteiro em runtime (mesma família de `isPrazoReductionClaim`/
  `isPrematureReservationClaim`, FIX-234). Barreira em CÓDIGO (Lei 4).
- `system-prompt.ts`: nova seção proibindo o termo explicitamente, mesmo com número —
  estende a regra existente de "taxa competitiva/dentro da média sem número" (Bv2-06,
  CDC art. 37) que já cobria taxa de administração.
- `HARD_RULES.md` (seção 1.10) + `hard-rules.ts` regenerado (paridade byte-a-byte,
  `assistant-prompt.test.ts`).

## Regressão (TDD — vista falhar antes, verde depois)
- `sanitizer.test.ts`: `isTaxaContemplacaoClaim` pega as 4 variantes reais (incluindo
  a frase exata do bug); NÃO pega copy legítima sobre contemplação (contagem
  real)/taxa de administração; `stripProcessPreamble` remove o segmento mantendo o
  resto da fala.
- `assistant-prompt.test.ts`: paridade HARD_RULES.md ↔ hard-rules.ts mantida.

## Achado extra corrigido de quebra
`system-prompt.ts` é um TEMPLATE LITERAL JS (backtick-delimited) — a primeira versão
do texto usava backticks Markdown (`` `taxaContemplacao` ``) pra formatar nomes de
campo, o que TERMINA o template literal prematuramente e quebra a sintaxe do arquivo
inteiro (`[PARSE_ERROR] Expected a semicolon...`). Corrigido pra texto plano (sem
backtick), como o resto do arquivo já faz pra nomes de tool/campo.
