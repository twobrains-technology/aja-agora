---
id: FIX-271
titulo: "Fallback de empty-turn ainda pede 'manda de novo' sem rodar o resolver"
status: todo
bloco: bloco-r8-acabamento
arquivos: [src/lib/agent/orchestrator/runner.ts]
rodada: 2026-07-10 rodada 8 (Fable r7, mesma família da recuperação)
---
## Gap (veredito r7)
O fallback de EMPTY-TURN (`finishReason="length"`, 52.9s) pede "manda de novo" sem rodar o resolver
de menção — mesma família do FIX-266 (recuperação=resolução) mas no caminho empty-turn.
## Correção
- No empty-turn-fallback, rodar o resolver de menção sobre a última mensagem do usuário ANTES do
  "manda de novo" — se o usuário nomeou algo exibido, resolver.
## Regressão (TDD)
- empty-turn + usuário nomeou marca exibida → resolve (não pede de novo).
