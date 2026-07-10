---
id: FIX-245
titulo: "Higiene: contradição tripla de emoji no prompt + comentário FIX-C4 stale + exemplo genérico"
status: todo
bloco: bloco-r2-valor-compliance
arquivos: [src/lib/agent/system-prompt.ts, src/lib/consorcio/contemplation-dial.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P3 #10)
---

## Gap (veredito Fable §D4.e + gap #10)
1. Contradição TRIPLA de emoji no `system-prompt.ts`: `:21` "NUNCA use emoji, nenhum" × `:126`/`:148`
   "Emoji com PARCIMÔNIA... não é proibição total" × `:1157` "1 a cada 2-3 mensagens". Fonte única.
2. Comentário `contemplation-dial.ts:70-73` (FIX-C4) diz "só dinheiro abate" mas o código AMORTIZA
   tudo (FIX-221) — stale, enganoso.
3. Educação de embutido usa exemplo genérico "numa carta de R$ 100 mil" quando a carta do cliente
   está na tela (ex. 92.902/150.000) — consultor usaria o número real do cliente.

## Correção
- Resolver a regra de emoji pra UMA fonte coerente (a decisão vigente: parcimônia, ~1 a cada 3-4 balões).
- Corrigir/remover o comentário stale FIX-C4 em contemplation-dial.ts.
- Prompt da educação de embutido: usar o valor da carta real do cliente, não "R$ 100 mil" genérico.

## Regressão
- grep: uma única regra de emoji no prompt.
- comentário do motor bate com o código (amortiza).
