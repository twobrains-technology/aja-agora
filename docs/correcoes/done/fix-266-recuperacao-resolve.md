---
id: FIX-266
titulo: "Recuperação é enlatada/lenta — pede 'me diz o nome' logo após o usuário ter dito o nome"
status: done
bloco: bloco-r7-recuperacao
arquivos: [src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/directives.ts]
rodada: 2026-07-10 rodada 7 (Fable r6, o que segura o 7)
---
## Gap (veredito r6 — "o que segura o 7")
Turnos contidos (tool-error/recuperação) levam 72-112s até um fallback ENLATADO que pede "me diz o
nome" logo depois de o usuário JÁ TER dito o nome — e repete idêntico 2×. É contenção sem resolução.
## Correção
- No caminho de RECUPERAÇÃO (tool-error/fallback), rodar o resolver de menção (FIX-264) sobre a
  mensagem do usuário ANTES de cair no fallback enlatado — se o usuário nomeou uma administradora/
  valor exibido, RESOLVER (não pedir de novo). Transforma contenção em resolução.
- Fallback nunca repetir a MESMA frase 2×; se persiste, oferecer opção concreta (lista da tabela).
## Regressão (TDD)
- tool-error + usuário nomeou marca exibida → resolve (não pede "me diz o nome").
- fallback não repete idêntico.

## Implementado (2026-07-10)
`mentionedOffer` já era resolvido em `index.ts` ANTES do turno (FIX-258) — o fallback do tool-error
(FIX-262) só não o consultava. Agora, quando `mentionedOffer` resolve, usa
`buildToolErrorRecoveryResolvedFallback` (reafirma crédito/parcela/prazo da oferta, nunca pede o nome
de novo). Quando não resolve, compara com a ÚLTIMA mensagem do assistant no histórico — se for
idêntica ao fallback genérico, troca pra `buildToolErrorRecoveryFallbackRepeat` (lista as cotas já
exibidas via `listShownOffersForConversation`). Testes: `directives.test.ts` (unit, pure) +
`index.fix-266-recuperacao-resolve.integration.test.ts` (tool-error real + comparison_table seedada,
skip sem DB — 3/3 verdes no container). Suíte completa: 3200/3200 verde.
