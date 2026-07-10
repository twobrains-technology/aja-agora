---
id: FIX-271
titulo: "Fallback de empty-turn ainda pede 'manda de novo' sem rodar o resolver"
status: done
bloco: bloco-r8-acabamento
arquivos: [src/app/api/chat/route.ts]
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

## Implementado (2026-07-10)
O gap era no ROUTE (não no runner — `mentionedOffer` já roda pré-turno em `index.ts`/FIX-258, mas o
guard de empty-turn vive em `route.ts`, fora do runTurn). No bloco `isTurnEmpty` do turno de
texto-livre: quando não há gate pendente pra reengajar (FIX-208), roda
`resolveOfferMentionForConversation` (mesmo resolver do FIX-266/258, contra os grupos já exibidos)
sobre `userText` ANTES de cair no `EMPTY_TURN_FALLBACK` genérico. Resolveu → reafirma com
`buildToolErrorRecoveryResolvedFallback` (marca/crédito/parcela/prazo), `finishReason` vira
"empty-turn-resolved" (observável no turn-trace, FIX-269). Teste estrutural (Camada 1, mesmo padrão
de `lance-embutido-gate.test.ts`): `empty-turn-resolve-fix-271.test.ts`. Suíte completa: 3222/3222
verde no container.
